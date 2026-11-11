import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { RunOptions, RunState } from '../shared/types';
import { commandPreview, loadProject, runArguments, validateRun } from './project';
import { stopWindowsProcess } from './windows-stop';
import { RunLog } from './run-log';
import { runEnvironment } from './environment';
import { outputCharacterLimit, outputUpdateInterval } from '../shared/output';

export class Runner {
    private child: ChildProcess | null = null;
    private busy = false;
    private timer: NodeJS.Timeout | undefined;
    private stopped = false;
    private log: RunLog | null = null;
    private completion: Promise<void> = Promise.resolve();
    private starting: Promise<void> = Promise.resolve();
    private current: RunState = { status: 'idle', output: '', command: '', exitCode: null, outputTruncated: false, outputStartLine: 0, logPath: null, logError: null };
    constructor(private readonly publish: (state: RunState) => void, private readonly executable = process.env.SPEC_RUNNER_NODE ?? (process.versions.electron ? 'node' : process.execPath)) {}

    get state(): RunState { return { ...this.current }; }
    get active(): boolean { return this.busy; }
    private emit(): void { this.publish(this.state); }
    private append(data: string): void {
        // Keep ANSI colours, including sequences split across stdout/stderr chunks.
        this.current.outputTruncated ||= this.current.output.length + data.length > outputCharacterLimit;
        const combined = this.current.output + data;
        const discarded = combined.slice(0, Math.max(0, combined.length - outputCharacterLimit));
        this.current.outputStartLine += discarded.split('\n').length - 1;
        this.current.output = combined.slice(-outputCharacterLimit);
        if (this.log && !this.current.logError && !this.log.write(data)) {
            // Slow disks must not create an unbounded queue of pending log writes.
            this.child?.stdout?.pause();
            this.child?.stderr?.pause();
        }
        if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; this.emit(); }, outputUpdateInterval * Math.max(1, Math.ceil(this.current.output.length / 250_000)));
    }

    async run(root: string, input: RunOptions): Promise<RunState> {
        if (this.busy) throw new Error('A run is already active. Stop it before starting another.');
        this.busy = true;
        let ready!: () => void;
        this.starting = new Promise<void>(resolve => { ready = resolve; });
        this.stopped = false;
        try {
            const options = await validateRun(root, input);
            const requireFromProject = createRequire(path.join(root, 'package.json'));
            const packageFile = requireFromProject.resolve('cypress/package.json');
            const cypressPackage = requireFromProject('cypress/package.json') as { bin: { cypress: string } };
            const cli = path.resolve(path.dirname(packageFile), cypressPackage.bin.cypress);
            const project = await loadProject(root);
            const env = await runEnvironment(root, project.config, options.profile);
            const args = runArguments(options, project.config, env);
            const log = await RunLog.create(root, options.profile);
            this.log = log;
            const resume = () => { this.child?.stdout?.resume(); this.child?.stderr?.resume(); };
            log.stream.on('drain', resume);
            log.stream.on('error', error => {
                this.current.logError = `Full log could not be saved: ${error.message}`;
                resume();
                this.emit();
            });
            this.current = { status: 'running', output: '', command: commandPreview(options, project.config), exitCode: null, outputTruncated: false, outputStartLine: 0, logPath: log.path, logError: null };
            const child = spawn(this.executable, [cli, ...args], {
                cwd: root,
                env,
                shell: false,
                windowsHide: true,
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            this.child = child;
            child.stdout?.setEncoding('utf8').on('data', (data: string) => this.append(data));
            child.stderr?.setEncoding('utf8').on('data', (data: string) => this.append(data));
            child.on('error', (error: NodeJS.ErrnoException) => {
                const hint = error.code === 'ENOENT' ? 'Ensure a supported Node.js installation is available, then restart the runner from the project. ' : '';
                this.append(`\nUnable to start Cypress using ${this.executable}: ${hint}${error.message}\n`);
            });
            child.once('close', (code, signal) => {
                this.completion = this.finish(code, signal);
            });
            this.emit();
            return this.state;
        } catch (error) {
            await this.log?.finish();
            this.log = null;
            this.busy = false;
            throw new Error(`Cannot start run: ${(error as Error).message}`);
        } finally { ready(); }
    }

    private async finish(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
        this.child = null;
        if (!this.current.output.trim()) {
            const nativeCode = code !== null && (code > 255 || code < -255) ? ` (0x${(code >>> 0).toString(16).toUpperCase()})` : '';
            const result = signal ? `signal ${signal}` : `exit code ${code}${nativeCode}`;
            this.append(this.stopped ? 'Run stopped.\n' : `Cypress exited with ${result} without producing output.\nRuntime: ${this.executable}\n${code === 0 ? '' : 'Copy the command and run it in a terminal from this checkout to see whether Cypress starts there.\n'}`);
        }
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        await this.log?.finish();
        this.log = null;
        this.current.exitCode = code;
        this.current.status = this.stopped ? 'stopped' : code === 0 ? 'passed' : 'failed';
        this.child = null;
        this.busy = false;
        this.emit();
    }

    async stop(): Promise<void> {
        if (!this.child && this.busy) await this.starting;
        const child = this.child;
        if (!child || !child.pid) { await this.completion; return; }
        if (this.stopped) throw new Error('The run is already stopping.');
        this.stopped = true;
        this.current.status = 'stopping';
        this.emit();
        let onClose: () => void = () => {};
        const closed = new Promise<void>(resolve => { onClose = resolve; child.once('close', onClose); });
        try {
            if (process.platform === 'win32') {
                await stopWindowsProcess(child);
                await this.completion;
                return;
            } else {
                try { process.kill(-child.pid, 'SIGTERM'); }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
            }
            let timeout: NodeJS.Timeout | undefined;
            const result = await Promise.race([closed.then(() => true), new Promise<false>(resolve => { timeout = setTimeout(() => resolve(false), 5000); })]);
            if (timeout) clearTimeout(timeout);
            if (!result) {
                try { process.kill(-child.pid, 'SIGKILL'); }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
                await closed;
            }
            await this.completion;
        } catch (error) {
            if (this.child === child) {
                this.stopped = false;
                this.current.status = 'running';
                this.append(`\nStop failed: ${(error as Error).message}\n`);
                this.emit();
            }
            throw error;
        } finally {
            child.removeListener('close', onClose);
        }
    }
}
