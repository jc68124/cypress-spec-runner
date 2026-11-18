import { formatDuration } from '../shared/duration';
import { useLayoutEffect, useRef, useState } from 'react';
import type { RunJob, ProgressSpec } from '../shared/types';
import { pendingRun, runLabels } from '../shared/runs';
import { Button, Spinner } from './ui';
import { ResultsContent } from './Results';

const label: Record<ProgressSpec['state'], string> = { waiting: 'Waiting', running: 'Running', passed: 'Passed', failed: 'Failed', skipped: 'Pending / skipped', unknown: 'Results unavailable' };
export function RunProgressView({ job, raw }: { job: RunJob; raw: () => void }) {
    const [failedOnly, setFailedOnly] = useState(false);
    const [follow, setFollow] = useState(true);
    const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), running = useRef<HTMLDetailsElement>(null);
    const following = useRef(true), expectedTop = useRef(0);
    const progress = job.progress, active = pendingRun(job), completed = progress?.completed ?? 0, total = progress?.total ?? job.specs.length;
    const title = job.status === 'queued' ? 'Queued' : job.status === 'stopping' ? 'Stopping Cypress…' : !active ? runLabels[job.status] : progress?.phase === 'finishing' || progress?.phase === 'complete' ? 'Finishing run…' : progress?.currentSpec ? 'Running spec' : progress?.phase === 'running' ? 'Preparing next spec…' : 'Starting Cypress…';
    const specs: ProgressSpec[] = progress?.specs ?? job.specs.slice(0, 500).map(spec => ({ spec, state: 'waiting' as const, passed: 0, failed: 0, pending: 0, skipped: 0, duration: 0 }));
    function pause() { following.current = false; setFollow(false); }
    function position() {
        const list = viewport.current, row = running.current;
        if (!following.current || !active || !list || !row) return;
        const bounds = list.getBoundingClientRect(), current = row.getBoundingClientRect();
        const next = row.nextElementSibling?.getBoundingClientRect();
        // Keep one upcoming row below the current spec when both fit. Clamp to
        // real content bounds so the first and last specs never need filler space.
        const bottom = next && next.bottom - current.top <= list.clientHeight - 16 ? next.bottom : current.bottom;
        const target = list.scrollTop + bottom - bounds.top - list.clientHeight + 8;
        list.scrollTop = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, target));
        expectedTop.current = list.scrollTop;
    }
    useLayoutEffect(() => {
        if (!follow || !active || job.results) return;
        position();
        const observer = new ResizeObserver(position);
        if (viewport.current) observer.observe(viewport.current);
        if (content.current) observer.observe(content.current);
        return () => observer.disconnect();
    }, [follow, active, progress?.currentSpec, completed, failedOnly, job.results]);
    const totals = job.results ?? progress;
    return <section aria-label="Run progress" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div aria-label="Progress summary" className="shrink-0 rounded-lg border border-white/10 bg-zinc-950 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p role="status" className="flex items-center gap-2 text-sm font-semibold text-white">{active && job.status !== 'queued' && <Spinner />}{title}</p>{active && progress?.currentSpec && <p className="mt-2 break-all text-sm text-indigo-200">{progress.currentSpec}</p>}{job.status === 'queued' && <p className="mt-2 text-xs text-zinc-400">{job.waitReason ?? 'Starts automatically when a run slot is available.'}</p>}</div><span className="text-xs tabular-nums text-zinc-400">{completed} of {total} specs completed</span></div>
            <div role="progressbar" aria-label="Spec progress" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.min(completed, total)} aria-valuetext={`${completed} of ${total} specs completed`} className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full transition-[width] ${job.status === 'failed' || progress?.failed ? 'bg-red-400' : 'bg-indigo-400'}`} style={{ width: `${total ? Math.min(100, completed / total * 100) : 0}%` }} /></div>
            {(!!job.results || !!completed) && <p className="mt-3 text-xs text-zinc-300">{totals?.passed ?? 0} passed · {totals?.failed ?? 0} failed · {totals?.pending ?? 0} pending · {totals?.skipped ?? 0} skipped <span className="text-zinc-500">{job.results ? `· ${formatDuration(job.results.duration)}` : 'in completed specs'}</span></p>}
            {active && <p className="mt-3 text-xs text-zinc-500">Progress and test counts update as each spec finishes.</p>}
        </div>
        {progress?.phase === 'unavailable' && active && <div role="status" className="shrink-0 rounded-lg border border-amber-400/20 p-3 text-xs text-amber-200">{progress.message}<Button small className="ml-3" onClick={raw}>View raw output</Button></div>}
        {!job.results && <>
            {!active && <p role="status" className="text-xs text-zinc-400">{job.resultsError ?? 'No completed test summary is available. The saved log and raw output contain diagnostics.'}<Button small className="ml-3" onClick={raw}>View raw output</Button></p>}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white">Spec files</h3><div className="flex flex-wrap items-center gap-4">{active && <label className="flex items-center gap-2 text-xs text-zinc-400" title="Keep the running spec and the next file visible. Scrolling or opening a spec pauses following; tick to resume."><input type="checkbox" aria-label="Follow running spec" checked={follow} onChange={event => { following.current = event.target.checked; setFollow(event.target.checked); }} />Follow running spec</label>}<label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={failedOnly} onChange={event => setFailedOnly(event.target.checked)} />Failed specs only</label></div></div>
        </>}
        <div ref={viewport} aria-label={job.results ? 'Completed spec results' : 'Spec file progress'} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pr-1 [overflow-anchor:none]" onWheel={pause} onTouchStart={pause} onPointerDown={pause} onClick={event => { if ((event.target as HTMLElement).closest('summary')) pause(); }} onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Enter'].includes(event.key) && !(event.target as HTMLElement).closest('input,button,select,textarea')) pause(); }} onScroll={event => { if (Math.abs(event.currentTarget.scrollTop - expectedTop.current) > 1) pause(); expectedTop.current = event.currentTarget.scrollTop; }}>
            {job.results ? <ResultsContent key={job.id} id={job.id} name={job.name} results={job.results} scrollable={false} showSummary={false} /> : <div ref={content} className="space-y-1">{specs.filter(spec => !failedOnly || spec.state === 'failed' || spec.state === 'running').map(spec => <details ref={spec.spec === progress?.currentSpec ? running : undefined} data-progress-spec={spec.spec} key={spec.spec} open={!!spec.error} className={`group rounded-lg border p-2 ${spec.state === 'running' ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-white/10 bg-zinc-950'}`}>
                <summary className="flex min-w-0 cursor-pointer list-none items-center gap-3 text-xs"><span aria-hidden="true" className="shrink-0 text-zinc-500 group-open:rotate-90">›</span><span className="min-w-0 flex-1 truncate text-zinc-200" title={spec.spec}><span>{spec.spec.split('/').at(-1)}</span><span className="ml-2 text-zinc-500">{spec.spec.includes('/') ? spec.spec.slice(0, spec.spec.lastIndexOf('/')) : ''}</span></span>{!['waiting', 'running'].includes(spec.state) && <><span className="shrink-0 whitespace-nowrap tabular-nums text-zinc-400"><span className="text-emerald-300">{spec.passed} passed</span> · <span className={spec.failed ? 'text-red-300' : ''}>{spec.failed} failed</span>{!!(spec.pending + spec.skipped) && ` · ${spec.pending + spec.skipped} pending/skipped`}</span><span className="w-14 shrink-0 whitespace-nowrap text-right tabular-nums text-zinc-400">{formatDuration(spec.duration)}</span></>}<span className={`w-24 shrink-0 truncate whitespace-nowrap text-right ${spec.state === 'failed' ? 'text-red-300' : spec.state === 'passed' ? 'text-emerald-300' : spec.state === 'running' ? 'text-indigo-200' : 'text-zinc-400'}`}>{spec.state === 'waiting' && !active ? 'Not completed' : label[spec.state]}</span></summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-400">{spec.error ?? (spec.state === 'running' ? 'Open Raw output for detailed activity while this spec runs.' : 'Individual test details and artifacts are available when the full run finishes.')}</p>
            </details>)}{failedOnly && !specs.some(spec => spec.state === 'failed' || spec.state === 'running') && <p className="text-xs text-zinc-400">No failed specs reported.</p>}
            {(progress?.truncated || job.specs.length > 500) && <p className="text-xs text-zinc-500">Showing up to 500 spec rows. Progress totals include all specs.</p>}
            </div>}
        </div>
    </section>;
}
