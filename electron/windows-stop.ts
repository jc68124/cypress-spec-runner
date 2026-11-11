import { spawn, type ChildProcess } from 'node:child_process';

interface TaskkillResult { code: number | null; output: string }
type Taskkill = (pid: number) => Promise<TaskkillResult>;

const taskkill: Taskkill = pid => new Promise((resolve, reject) => {
    const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (data: Buffer) => { output = (output + data.toString()).slice(-4000); };
    killer.stdout.on('data', append);
    killer.stderr.on('data', append);
    killer.once('error', reject);
    killer.once('close', code => resolve({ code, output: output.trim() }));
});

export async function stopWindowsProcess(child: ChildProcess, terminate: Taskkill = taskkill, timeoutMs = 5000): Promise<void> {
    if (!child.pid) return;
    let onClose: () => void = () => {};
    let timer: NodeJS.Timeout | undefined;
    const closed = new Promise<true>(resolve => {
        onClose = () => resolve(true);
        child.once('close', onClose);
    });
    try {
        let failure: Error | undefined;
        try {
            const result = await terminate(child.pid);
            if (result.code !== 0) failure = new Error(`taskkill exited with ${result.code}${result.output ? `: ${result.output}` : '.'}`);
        } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); }
        // taskkill may return before Node delivers close, including code 128 when
        // Cypress has just exited. Confirm closure instead of judging the code alone.
        const finished = await Promise.race([
            closed,
            new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
        ]);
        if (!finished) throw failure ?? new Error('Cypress has not exited yet. Check Task Manager before closing the app.');
    } finally {
        if (timer) clearTimeout(timer);
        child.removeListener('close', onClose);
    }
}
