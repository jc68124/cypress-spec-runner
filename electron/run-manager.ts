import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Runner } from './runner';
import { PlainText } from './run-log';
import { commandPreview, loadProject, validateRun } from './project';
import type { ExecutionMode, MatrixOptions, MatrixResult, ProjectConfig, RunBatch, RunDetails, RunJob, RunOptions, RunResults, RerunMode } from '../shared/types';
import { failedSpecSelection, requireFailedSpecs } from '../shared/results';
import { browserName } from '../shared/types';
import { concurrencyCap, matrixRuns, validateMatrixTargets, maxOpenBatches, maxOpenRuns, pendingRun, validateRunDetails } from '../shared/runs';

type Entry = { job: RunJob; runner: Runner; config: ProjectConfig; options: RunOptions };
export class RunManager {
    private entries = new Map<string, Entry>();
    private groups = new Map<string, RunBatch>();
    private plans = new Map<string, { id: string; options: RunOptions; details: RunDetails; results?: RunResults }[]>();
    private nextBatchNumber = 1;
    private preparing = 0;
    private shuttingDown = false;
    private generation = 0;
    private nextNumber = 1;
    private stopping = new Map<string, Promise<void>>();
    constructor(private readonly root: string, private readonly publish: (job: RunJob) => void, private readonly publishBatch: (batch: RunBatch) => void = () => {}) {}
    get submitting(): boolean { return this.preparing > 0; }
    get active(): boolean { return this.submitting || [...this.entries.values()].some(entry => pendingRun(entry.job)); }
    list(): RunJob[] { return [...this.entries.values()].map(entry => this.copy(entry.job)); }
    get(id: string): RunJob { return this.copy(this.entry(id).job); }
    liveSpecDetails(id: string, spec: string) { return this.entry(id).runner.liveSpecDetails(spec); }
    hasLiveScreenshot(id: string, filename: string) { return this.entry(id).runner.hasLiveScreenshot(filename); }
    async copyText(id: string): Promise<string> {
        const entry = this.entry(id);
        if (!entry.job.logPath) {
            if (!entry.job.output) throw Error('There is no output to copy yet.');
            return new PlainText().write(entry.job.output);
        }
        return entry.runner.copyText();
    }
    private copy(job: RunJob): RunJob { return { ...job, specs: [...job.specs] }; }
    private entry(id: string): Entry {
        const entry = typeof id === 'string' ? this.entries.get(id) : undefined;
        if (!entry) throw Error('This run no longer exists.');
        return entry;
    }
    batches(): RunBatch[] { return [...this.groups.values()].map(batch => structuredClone(batch)); }
    private group(id: string): RunBatch { const batch = this.groups.get(id); if (!batch) throw Error('This run group no longer exists.'); return batch; }
    private notifyGroup(batch: RunBatch): void {
        const failed = this.plans.get(batch.id)?.filter(target => batch.statuses[target.id] === 'failed') ?? [];
        batch.failedSpecsProblem = Object.values(batch.statuses).some(status => pendingRun({ status })) ? 'Finish, stop or cancel this group first.' : !failed.length ? 'There are no failed runs in this group.' : failed.map(target => failedSpecSelection(target.results, target.options.specs).problem).find(Boolean);
        batch.revision++; this.publishBatch(structuredClone(batch));
    }
    private notify(entry: Entry): void {
        const plan = this.plans.get(entry.job.batchId)?.find(target => target.id === entry.job.id);
        if (plan && !pendingRun(entry.job)) plan.results = entry.job.results;
        const batch = this.group(entry.job.batchId);
        if (batch.statuses[entry.job.id] !== entry.job.status) { batch.statuses[entry.job.id] = entry.job.status; this.notifyGroup(batch); }
        entry.job.revision++; this.publish(this.copy(entry.job));
    }
    private remove(entry: Entry, cleanup = true): void {
        this.entries.delete(entry.job.id);
        this.publish({ ...this.copy(entry.job), revision: entry.job.revision + 1, removed: true, output: '' });
        if (cleanup && ![...this.entries.values()].some(other => other.job.batchId === entry.job.batchId)) this.closeBatch(entry.job.batchId);
    }
    update(id: string, value: RunDetails): RunJob {
        const entry = this.entry(id); Object.assign(entry.job, validateRunDetails(value));
        const target = this.plans.get(entry.job.batchId)?.find(target => target.id === id);
        if (target) target.details = { name: entry.job.name, notes: entry.job.notes };
        this.notify(entry); return this.get(id);
    }
    renameBatch(id: string, name: string): RunBatch {
        const batch = this.group(id); batch.name = validateRunDetails({ name, notes: '' }).name; this.notifyGroup(batch); return structuredClone(batch);
    }
    closeBatch(id: string): void {
        const batch = this.group(id);
        if (Object.values(batch.statuses).some(status => pendingRun({ status }))) throw Error('Finish, stop or cancel all runs before closing their group.');
        for (const entry of this.entries.values()) if (entry.job.batchId === id) this.remove(entry, false);
        this.groups.delete(id); this.plans.delete(id); this.publishBatch({ ...structuredClone(batch), revision: batch.revision + 1, removed: true });
    }
    async enqueue(input: RunOptions): Promise<RunJob> {
        const result = await this.enqueueMatrix({ specs: input?.specs, profiles: [input?.profile], browsers: [input?.browser], headed: input?.headed, isolateArtifacts: input?.isolateArtifacts });
        return result.runs[0];
    }
    async enqueueMatrix(input: MatrixOptions): Promise<MatrixResult> {
        if (this.shuttingDown) throw Error('The application is stopping its runs.');
        const selection = structuredClone(input);
        return this.enqueueOptions(matrixRuns(selection), undefined, undefined, selection.executionMode ?? 'repeat', selection);
    }
    async rerun(id: string, mode: RerunMode = 'all'): Promise<MatrixResult> {
        if (mode !== 'all' && mode !== 'failed-specs') throw Error('Choose the full run or failed specs.');
        const entry = this.entry(id);
        if (pendingRun(entry.job)) throw Error('Finish or stop this run before rerunning it.');
        const options = structuredClone(entry.options);
        if (mode === 'failed-specs') options.specs = requireFailedSpecs(entry.job.results, options.specs);
        return this.enqueueOptions([options], `${entry.job.name} (${mode === 'failed-specs' ? 'failed specs' : 'rerun'})`, [{ name: entry.job.name, notes: entry.job.notes }], this.group(entry.job.batchId).executionMode);
    }
    async rerunBatch(id: string, mode: 'all' | 'failed' | 'failed-specs'): Promise<MatrixResult> {
        const batch = this.group(id);
        if (mode !== 'all' && mode !== 'failed' && mode !== 'failed-specs') throw Error('Choose all runs, failed runs or failed specs.');
        if (Object.values(batch.statuses).some(status => pendingRun({ status }))) throw Error('Finish, stop or cancel this group before rerunning it.');
        const targets = this.plans.get(id)!.filter(target => mode === 'all' || batch.statuses[target.id] === 'failed');
        if (!targets.length) throw Error('There are no failed runs to rerun.');
        // Validate every failed target before enqueuing any subset; never expand pairs into a new matrix.
        const options = targets.map(target => ({ ...structuredClone(target.options), ...(mode === 'failed-specs' ? { specs: requireFailedSpecs(target.results, target.options.specs) } : {}) }));
        return this.enqueueOptions(options, `${batch.name} (${mode === 'failed-specs' ? 'failed specs' : mode === 'failed' ? 'failed rerun' : 'rerun'})`, targets.map(target => ({ ...target.details })), batch.executionMode);
    }
    private async enqueueOptions(combinations: RunOptions[], name?: string, details?: RunDetails[], executionMode: ExecutionMode = 'repeat', selection?: MatrixOptions): Promise<MatrixResult> {
        if (this.shuttingDown) throw Error('The application is stopping its runs.');
        if (this.entries.size + this.preparing + combinations.length > maxOpenRuns) throw Error(`Close completed run tabs before adding more runs (maximum ${maxOpenRuns}).`);
        const generation = this.generation;
        this.preparing += combinations.length;
        try {
            const project = await loadProject(this.root);
            const config = structuredClone(project.config);
            if (selection) validateMatrixTargets(selection, config);
            const validated = await Promise.all(combinations.map(options => validateRun(this.root, options, config, project.specs)));
            if (this.shuttingDown || generation !== this.generation) throw Error('The application is stopping its runs.');
            if (this.groups.size >= maxOpenBatches) {
                const unused = [...this.groups.values()].find(batch => ![...this.entries.values()].some(entry => entry.job.batchId === batch.id));
                if (unused) this.closeBatch(unused.id);
                else throw Error('Close a completed run group before adding more groups.');
            }
            const batch: RunBatch = { id: randomUUID(), revision: 0, name: (name ?? `${executionMode !== 'repeat' ? 'Split' : validated.length > 1 ? 'Matrix' : 'Run'} #${this.nextBatchNumber++}`).slice(0, 100),
                createdAt: Date.now(), profiles: [...new Set(validated.map(options => options.profile))].map(id => ({ id, name: config.profiles.find(profile => profile.id === id)!.name })),
                browsers: [...new Set(validated.map(options => options.browser))], browserNames: Object.fromEntries(validated.map(options => [options.browser, browserName(config, options.browser)])), specCount: new Set(validated.flatMap(options => options.specs)).size, executionMode, statuses: {}, targets: [] };
            const pairKey = (options: RunOptions) => JSON.stringify([options.profile, options.browser]);
            const pairCounts = new Map<string, number>();
            for (const options of validated) {
                const key = pairKey(options);
                pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
            }
            const pairParts = new Map<string, number>();
            const entries = validated.map((options, index) => {
                const id = randomUUID(), artifactDirectory = path.join(this.root, 'spec-runner-logs', id);
                const profile = config.profiles.find(profile => profile.id === options.profile)!;
                const browserLabel = browserName(config, options.browser);
                const key = pairKey(options);
                const part = (pairParts.get(key) ?? 0) + 1;
                pairParts.set(key, part);
                const suffix = pairCounts.get(key)! > 1 ? ` · Part ${part}` : '';
                let entry: Entry;
                const runner = new Runner(state => {
                    if (!this.entries.has(id)) return;
                    Object.assign(entry.job, state);
                    if (!runner.active) entry.job.finishedAt = Date.now();
                    this.notify(entry);
                    if (!runner.active) this.schedule();
                });
                entry = { config, options: structuredClone(options), runner, job: {
                    id, revision: 0, number: this.nextNumber++, batchId: batch.id, name: `${profile.name.replace(/[\x00\r\n]/g, ' ').slice(0, 85)} · ${browserLabel}`.slice(0, 100 - suffix.length) + suffix, notes: '',
                    status: 'queued', profileId: profile.id, profileName: profile.name, browser: options.browser, browserName: browserName(config, options.browser), headed: options.headed, isolateArtifacts: options.isolateArtifacts !== false, specs: [...options.specs],
                    createdAt: batch.createdAt, startedAt: null, finishedAt: null, waitReason: null, artifactDirectory,
                    output: '', command: commandPreview(options, config, artifactDirectory, project.cypressVersion), exitCode: null,
                    outputTruncated: false, outputStartLine: 0, logPath: null, logError: null,
                } };
                if (details?.[index]) Object.assign(entry.job, details[index]);
                batch.statuses[id] = 'queued'; batch.targets.push({ id, profileId: profile.id, browser: options.browser, specCount: options.specs.length }); return entry;
            });
            this.groups.set(batch.id, batch);
            this.plans.set(batch.id, entries.map(entry => ({ id: entry.job.id, options: { ...entry.options }, details: { name: entry.job.name, notes: entry.job.notes } })));
            for (const entry of entries) this.entries.set(entry.job.id, entry);
            this.notifyGroup(batch);
            for (const entry of entries) this.notify(entry);
            this.schedule();
            return { batch: structuredClone(batch), runs: entries.map(entry => this.get(entry.job.id)) };
        } finally { this.preparing -= combinations.length; }
    }
    private waitReason(entry: Entry): string | null {
        const running = [...this.entries.values()].filter(other => ['running', 'stopping'].includes(other.job.status));
        const profile = entry.config.profiles.find(profile => profile.id === entry.options.profile)!;
        const sameProfile = running.filter(other => other.options.profile === profile.id);
        const profileCap = Math.min(concurrencyCap(profile.maxConcurrentRuns ?? 1), ...sameProfile.map(other => concurrencyCap(other.config.profiles.find(profile => profile.id === other.options.profile)!.maxConcurrentRuns ?? 1)));
        if (sameProfile.length >= profileCap) return `Waiting for ${profile.name}`;
        if (profile.concurrencyGroup) {
            const group = entry.config.concurrencyGroups!.find(group => group.id === profile.concurrencyGroup)!;
            const shared = running.filter(other => other.config.profiles.find(profile => profile.id === other.options.profile)!.concurrencyGroup === group.id);
            const cap = Math.min(concurrencyCap(group.maxConcurrentRuns), ...shared.map(other => concurrencyCap(other.config.concurrencyGroups!.find(item => item.id === group.id)!.maxConcurrentRuns)));
            if (shared.length >= cap) return `Waiting for ${group.name}`;
        }
        const cap = Math.min(concurrencyCap(entry.config.maxConcurrentRuns ?? 2), ...running.map(other => concurrencyCap(other.config.maxConcurrentRuns ?? 2)));
        return running.length >= cap ? 'Waiting for a free run slot' : null;
    }
    private schedule(): void {
        if (this.shuttingDown) return;
        for (const entry of this.entries.values()) {
            if (entry.job.status !== 'queued') continue;
            const wait = this.waitReason(entry);
            if (wait) { if (entry.job.waitReason !== wait) { entry.job.waitReason = wait; this.notify(entry); } continue; }
            // Reserve capacity synchronously, before asynchronous process startup.
            entry.job.status = 'running'; entry.job.startedAt = Date.now(); entry.job.waitReason = null; this.notify(entry);
            void entry.runner.run(this.root, entry.options, entry.config, { id: entry.job.id, directory: entry.job.artifactDirectory }).catch(error => {
                Object.assign(entry.job, { status: 'failed', output: String(error.message) + '\n', resultsError: String(error.message), finishedAt: Date.now() });
                this.notify(entry); this.schedule();
            });
        }
    }
    async stop(id: string): Promise<void> {
        const entry = this.entry(id);
        if (entry.job.status === 'queued') {
            entry.job.status = 'cancelled'; entry.job.finishedAt = Date.now(); entry.job.waitReason = null;
            this.notify(entry); this.remove(entry); this.schedule(); return;
        }
        if (['running', 'stopping'].includes(entry.job.status)) {
            let stopping = this.stopping.get(id);
            if (!stopping) {
                stopping = entry.runner.stop(); this.stopping.set(id, stopping);
                void stopping.finally(() => this.stopping.delete(id)).catch(() => {});
            }
            await stopping;
        }
    }
    close(id: string): void {
        if (pendingRun(this.entry(id).job)) throw Error('Stop or cancel the run before closing its tab.');
        this.remove(this.entry(id));
    }
    async stopAll(): Promise<void> {
        this.shuttingDown = true; this.generation++;
        try {
            for (const entry of this.entries.values()) if (entry.job.status === 'queued') {
                entry.job.status = 'cancelled'; entry.job.finishedAt = Date.now(); entry.job.waitReason = null; this.notify(entry); this.remove(entry);
            }
            const results = await Promise.allSettled([...this.entries.values()].filter(entry => ['running', 'stopping'].includes(entry.job.status)).map(entry => this.stop(entry.job.id)));
            const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
            if (failures.length) throw Error(failures.map(result => String(result.reason)).join('\n'));
        } finally { this.shuttingDown = false; }
    }
}
