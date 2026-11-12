import { useEffect, useRef, useState } from 'react';
import type { RunJob } from '../shared/types';
import { pendingRun } from '../shared/runs';
import { outputCharacterLimit } from '../shared/output';
import { rgb, terminalBackground, terminalForeground } from '../shared/contrast';
import { AnsiOutput } from './AnsiOutput';
import { Button, Help } from './ui';

export const runLabels: Record<RunJob['status'], string> = { idle: 'Ready', queued: 'Queued', running: 'Running', stopping: 'Stopping', passed: 'Passed', failed: 'Failed', stopped: 'Stopped', cancelled: 'Cancelled' };
export function RunOutput({ runs, selectedId, select, follow, setFollow, pending, operation, close, prepare }: {
    runs: RunJob[]; selectedId: string | null; select: (id: string | null) => void;
    follow: boolean; setFollow: (value: boolean) => void; pending: boolean;
    operation: (action: () => Promise<void>) => Promise<void>; close: (id: string) => Promise<void>; prepare: () => void;
}) {
    const job = runs.find(run => run.id === selectedId) ?? runs.at(-1);
    const [now, setNow] = useState(Date.now());
    const output = useRef<HTMLPreElement>(null);
    useEffect(() => { if (!job || !pendingRun(job)) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [job?.id, job?.status]);
    useEffect(() => { if (follow && output.current) output.current.scrollTop = output.current.scrollHeight; }, [job?.id, job?.output, follow]);
    const elapsed = job?.startedAt ? Math.max(0, Math.floor(((job.finishedAt ?? now) - job.startedAt) / 1000)) : 0;
    return <section aria-label="Runs" className="flex h-full min-h-80 flex-col gap-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-white">Runs</h2><Button small onClick={prepare}>New run</Button></div>
        {!!runs.length && <div role="tablist" aria-label="Run tabs" className="flex shrink-0 gap-2 overflow-x-auto pb-1">{runs.map(run => <div key={run.id} className={`flex shrink-0 items-center rounded-lg border ${run.id === job?.id ? 'border-indigo-400 bg-indigo-500/15' : 'border-white/15 bg-zinc-900'}`}>
            <button type="button" role="tab" id={`run-tab-${run.id}`} aria-controls={`run-output-${run.id}`} aria-selected={run.id === job?.id} tabIndex={run.id === job?.id ? 0 : -1} onKeyDown={event => {
                const index = runs.findIndex(item => item.id === run.id);
                const next = event.key === 'ArrowRight' ? runs[(index + 1) % runs.length] : event.key === 'ArrowLeft' ? runs[(index + runs.length - 1) % runs.length] : event.key === 'Home' ? runs[0] : event.key === 'End' ? runs.at(-1) : undefined;
                if (next) { event.preventDefault(); select(next.id); document.getElementById(`run-tab-${next.id}`)?.focus(); }
            }} onClick={() => select(run.id)} className="px-3 py-2 text-left text-xs leading-5"><span className="block font-semibold text-white">{run.profileName} · {run.browser} · #{run.number}</span><span className={run.status === 'failed' ? 'text-red-300' : run.status === 'passed' ? 'text-emerald-300' : 'text-zinc-400'}>{runLabels[run.status]}</span></button>
            {!pendingRun(run) && <button type="button" aria-label={`Close run ${run.number}`} disabled={pending} className="px-2 py-3 text-zinc-400 hover:text-white" onClick={() => void operation(() => close(run.id))}>×</button>}
        </div>)}</div>}
        {!job ? <div className="card p-8 text-sm text-zinc-400">No runs yet. Choose specs, a profile, and a browser to start a run.</div> : <div role="tabpanel" id={`run-output-${job.id}`} aria-labelledby={`run-tab-${job.id}`} className="card flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3"><div><h3 className="text-sm font-semibold text-white">{job.profileName} · {runLabels[job.status]}</h3><p className="mt-1 text-xs text-zinc-400">{job.specs.length} specs · {job.browser}{job.headed ? ' · headed' : ''} · {Math.floor(elapsed / 60)}m {elapsed % 60}s{job.exitCode !== null ? ` · exit ${job.exitCode}` : ''}</p></div><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Follow output</label>
            {pendingRun(job) && <Button small kind={job.status === 'queued' ? 'outline' : 'danger'} disabled={pending || job.status === 'stopping'} onClick={() => void operation(async () => { await window.specRunner.stop(job.id); })}>{job.status === 'queued' ? 'Cancel queued run' : job.status === 'stopping' ? 'Stopping…' : 'Stop run'}</Button>}</div></div>
            {job.waitReason && <p role="status" className="border-b border-white/10 bg-amber-500/10 p-3 text-sm text-amber-200">{job.waitReason}</p>}
            <pre ref={output} tabIndex={0} aria-label="Cypress terminal output" style={{ background: rgb(terminalBackground), color: rgb(terminalForeground) }} className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs/6 whitespace-pre-wrap">{job.output ? <AnsiOutput text={job.output} startLine={job.outputStartLine} /> : job.status === 'queued' ? 'This run will start automatically when its limits allow.' : job.status === 'cancelled' ? 'This queued run was cancelled before Cypress started.' : 'Waiting for Cypress output…'}</pre>
            <details className="border-t border-white/10 p-3"><summary className="cursor-pointer text-xs text-zinc-400">Run command and artifacts</summary><code className="mt-2 block text-xs leading-5 break-all text-zinc-300">{job.command}</code><p className="mt-2 break-all text-xs text-zinc-400">Artifacts: {job.artifactDirectory}</p></details>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-3"><div className="min-w-0 text-xs text-zinc-400"><p>{job.outputTruncated ? 'Showing the latest' : 'Showing all output, up to'} {outputCharacterLimit.toLocaleString('en-GB')} characters.<Help label="About output history">Each run saves a complete plain-text log automatically. Its visible history is limited to keep the interface responsive.</Help></p>{job.logPath && <p className="mt-1 break-all">Full log: {job.logPath}{pendingRun(job) ? ' (saving…)' : ''}</p>}{job.logError && <p role="alert" className="mt-1 text-red-300">{job.logError}</p>}</div><Button small disabled={pendingRun(job) || pending || !job.logPath || !!job.logError} onClick={() => void operation(async () => { await window.specRunner.openLog(job.id); })}>Open log</Button></div>
        </div>}
    </section>;
}
