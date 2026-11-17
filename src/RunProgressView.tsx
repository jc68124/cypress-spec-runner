import { useState } from 'react';
import type { RunJob, ProgressSpec } from '../shared/types';
import { pendingRun, runLabels } from '../shared/runs';
import { Button, Spinner } from './ui';
import { ResultsContent } from './Results';

const label: Record<ProgressSpec['state'], string> = { waiting: 'Waiting', running: 'Running', passed: 'Passed', failed: 'Failed', skipped: 'Pending / skipped', unknown: 'Results unavailable' };
export function RunProgressView({ job, raw }: { job: RunJob; raw: () => void }) {
    const [failedOnly, setFailedOnly] = useState(false);
    const progress = job.progress, active = pendingRun(job), completed = progress?.completed ?? 0, total = progress?.total ?? job.specs.length;
    const title = job.status === 'queued' ? 'Queued' : job.status === 'stopping' ? 'Stopping Cypress…' : !active ? runLabels[job.status] : progress?.phase === 'finishing' || progress?.phase === 'complete' ? 'Finishing run…' : progress?.currentSpec ? 'Running spec' : progress?.phase === 'running' ? 'Preparing next spec…' : 'Starting Cypress…';
    const specs: ProgressSpec[] = progress?.specs ?? job.specs.slice(0, 500).map(spec => ({ spec, state: 'waiting' as const, passed: 0, failed: 0, pending: 0, skipped: 0, duration: 0 }));
    return <section aria-label="Run progress" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p role="status" className="flex items-center gap-2 text-sm font-semibold text-white">{active && job.status !== 'queued' && <Spinner />}{title}</p>{active && progress?.currentSpec && <p className="mt-2 break-all text-sm text-indigo-200">{progress.currentSpec}</p>}{job.status === 'queued' && <p className="mt-2 text-xs text-zinc-400">{job.waitReason ?? 'Starts automatically when a run slot is available.'}</p>}</div><span className="text-xs tabular-nums text-zinc-400">{completed} of {total} specs completed</span></div>
            <div role="progressbar" aria-label="Spec progress" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.min(completed, total)} aria-valuetext={`${completed} of ${total} specs completed`} className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full transition-[width] ${job.status === 'failed' || progress?.failed ? 'bg-red-400' : 'bg-indigo-400'}`} style={{ width: `${total ? Math.min(100, completed / total * 100) : 0}%` }} /></div>
            {!job.results && !!completed && <p className="mt-3 text-xs text-zinc-300">{progress?.passed ?? 0} passed · {progress?.failed ?? 0} failed · {progress?.pending ?? 0} pending · {progress?.skipped ?? 0} skipped <span className="text-zinc-500">in completed specs</span></p>}
            {active && <p className="mt-3 text-xs text-zinc-500">Progress and test counts update as each spec finishes.</p>}
        </div>
        {progress?.phase === 'unavailable' && active && <div role="status" className="rounded-lg border border-amber-400/20 p-3 text-xs text-amber-200">{progress.message}<Button small className="ml-3" onClick={raw}>View raw output</Button></div>}
        {job.results ? <ResultsContent key={job.id} id={job.id} name={job.name} results={job.results} /> : <>
            {!active && <p role="status" className="text-xs text-zinc-400">{job.resultsError ?? 'No completed test summary is available. The saved log and raw output contain diagnostics.'}<Button small className="ml-3" onClick={raw}>View raw output</Button></p>}
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white">Spec files</h3><label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={failedOnly} onChange={event => setFailedOnly(event.target.checked)} />Failed specs only</label></div>
            <div className="space-y-2">{specs.filter(spec => !failedOnly || spec.state === 'failed' || spec.state === 'running').map(spec => <details key={spec.spec} open={!!spec.error} className={`rounded-lg border p-3 ${spec.state === 'running' ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-white/10 bg-zinc-950'}`}>
                <summary className="cursor-pointer list-none"><span className="flex flex-wrap items-start justify-between gap-2 text-xs"><span className="min-w-0 flex-1 break-all text-zinc-200">{spec.spec}</span><span className={spec.state === 'failed' ? 'text-red-300' : spec.state === 'passed' ? 'text-emerald-300' : 'text-zinc-400'}>{spec.state === 'waiting' && !active ? 'Not completed' : label[spec.state]}</span></span>{!['waiting', 'running'].includes(spec.state) && <span className="mt-2 block text-xs text-zinc-500">{spec.passed} passed · {spec.failed} failed · {spec.pending + spec.skipped} pending/skipped · {(spec.duration / 1000).toFixed(1)}s</span>}</summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-400">{spec.error ?? (spec.state === 'running' ? 'Open Raw output for detailed activity while this spec runs.' : 'Individual test details and artifacts are available when the full run finishes.')}</p>
            </details>)}{failedOnly && !specs.some(spec => spec.state === 'failed' || spec.state === 'running') && <p className="text-xs text-zinc-400">No failed specs reported.</p>}</div>
            {(progress?.truncated || job.specs.length > 500) && <p className="text-xs text-zinc-500">Showing up to 500 spec rows. Progress totals include all specs.</p>}
        </>}
    </section>;
}
