import { useEffect, useRef, useState } from 'react';
import type { MatrixResult, RunBatch, RunDetails, RunJob } from '../shared/types';
import { pendingRun, runLabels } from '../shared/runs';
import { outputCharacterLimit } from '../shared/output';
import { rgb, terminalBackground, terminalForeground } from '../shared/contrast';
import { AnsiOutput } from './AnsiOutput';
import { Button, Help, Modal } from './ui';
import { MatrixOverview } from './MatrixOverview';
import { OutputSearch } from './OutputSearch';


const statusColor = (status: RunJob['status']) => status === 'failed' ? 'text-red-300' : status === 'passed' ? 'text-emerald-300' : status === 'queued' ? 'text-amber-200' : 'text-zinc-400';
function summary(batch: RunBatch): string {
    const values = Object.values(batch.statuses);
    return (['running', 'stopping', 'queued', 'passed', 'failed', 'stopped', 'cancelled'] as const)
        .map(status => ({ status, count: values.filter(value => value === status).length })).filter(item => item.count)
        .map(item => `${item.count} ${runLabels[item.status].toLowerCase()}`).join(' · ');
}
export function RunOutput({ runs, batches, selectedId, select, follow, setFollow, pending, operation, close, prepare, created }: {
    runs: RunJob[]; batches: RunBatch[]; selectedId: string | null; select: (id: string | null) => void;
    follow: boolean; setFollow: (value: boolean) => void; pending: boolean;
    operation: (action: () => Promise<void>) => Promise<void>; close: (id: string) => Promise<void>; prepare: () => void; created: (result: MatrixResult) => void;
}) {
    const [groupId, setGroupId] = useState<string | null>(null);
    const [editing, setEditing] = useState<RunJob | null>(null);
    const [showMatrix, setShowMatrix] = useState(false);
    const [renaming, setRenaming] = useState<RunBatch | null>(null);
    const [now, setNow] = useState(Date.now());
    const [copied, setCopied] = useState(false);
    const [findOpen, setFindOpen] = useState(false);
    const previousScrollTop = useRef(0);
    const output = useRef<HTMLPreElement>(null);
    const selected = runs.find(run => run.id === selectedId);
    useEffect(() => { if (selected) setGroupId(selected.batchId); }, [selected?.id]);
    const batch = batches.find(batch => batch.id === groupId) ?? batches.find(batch => batch.id === selected?.batchId) ?? batches.at(-1);
    const groupRuns = runs.filter(run => run.batchId === batch?.id);
    const job = groupRuns.find(run => run.id === selectedId) ?? groupRuns.at(-1);
    useEffect(() => { if (!job || !pendingRun(job)) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [job?.id, job?.status]);
    useEffect(() => {
        if (follow && output.current) { output.current.scrollTop = output.current.scrollHeight; previousScrollTop.current = output.current.scrollTop; }
    }, [job?.id, job?.output, follow]);
    useEffect(() => { setCopied(false); previousScrollTop.current = output.current?.scrollTop ?? 0; }, [job?.id]);
    useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
    const elapsed = job?.startedAt ? Math.max(0, Math.floor(((job.finishedAt ?? now) - job.startedAt) / 1000)) : 0;
    function choose(run: RunJob) { setGroupId(run.batchId); select(run.id); }
    return <section aria-label="Runs" className="flex h-full min-h-80 flex-col gap-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-white">Runs</h2><Button small onClick={prepare}>New run</Button></div>
        {!batches.length ? <div className="card p-8 text-sm text-zinc-400">No runs yet. Choose specs, profiles and browsers to start a run.</div> : <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 min-[1450px]:grid-cols-[16rem_minmax(0,1fr)] min-[1450px]:grid-rows-1">
            <nav aria-label="Run list" className="max-h-52 min-h-0 space-y-2 overflow-y-auto min-[1450px]:max-h-none">{batches.map(group => {
                const children = runs.filter(run => run.batchId === group.id);
                return <div key={group.id} className={`overflow-hidden rounded-lg border ${group.id === batch?.id ? 'border-indigo-400/60' : 'border-white/15'}`}>
                    <button type="button" aria-label={`View group ${group.name}`} aria-current={group.id === batch?.id ? 'true' : undefined} className="w-full bg-zinc-900 px-3 py-2 text-left" onClick={() => { setGroupId(group.id); select(children[0]?.id ?? null); }}><span className="block truncate text-xs font-semibold text-white" title={group.name}>{group.name}</span><span className="mt-1 block text-xs text-zinc-400">{summary(group)}</span></button>
                    {!!children.length && <div role="tablist" aria-label={`Runs in ${group.name}`} aria-orientation="vertical">{children.map(run => <div key={run.id} className={`flex items-start border-t border-white/10 ${run.id === job?.id ? 'bg-indigo-500/15' : 'bg-zinc-950'}`}>
                        <button type="button" role="tab" id={`run-tab-${run.id}`} aria-controls={`run-output-${run.id}`} aria-selected={run.id === job?.id} tabIndex={run.id === job?.id ? 0 : -1} onKeyDown={event => {
                            const index = children.findIndex(item => item.id === run.id);
                            const next = ['ArrowDown', 'ArrowRight'].includes(event.key) ? children[(index + 1) % children.length] : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? children[(index + children.length - 1) % children.length] : event.key === 'Home' ? children[0] : event.key === 'End' ? children.at(-1) : undefined;
                            if (next) { event.preventDefault(); choose(next); document.getElementById(`run-tab-${next.id}`)?.focus(); }
                        }} onClick={() => choose(run)} className="min-w-0 flex-1 px-3 py-2 text-left text-xs leading-5"><span className="block truncate font-semibold text-white" title={run.name}>{run.name}</span><span className="block truncate text-zinc-400" title={`${run.profileName} · ${run.browser}`}>{run.profileName} · {run.browser} · #{run.number}</span><span className={statusColor(run.status)}>{runLabels[run.status]}</span>{run.notes && <span className="block truncate text-zinc-500" title={run.notes}>{run.notes}</span>}</button>
                        {!pendingRun(run) && <button type="button" aria-label={`Close run ${run.number}`} disabled={pending} className="px-2 py-2 text-zinc-400 hover:text-white" onClick={() => void operation(() => close(run.id))}>×</button>}
                    </div>)}</div>}
                </div>;
            })}</nav>
            <div className="flex min-h-0 min-w-0 flex-col gap-3">
                {batch && <div aria-label="Run group summary" className="card shrink-0 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold text-white">{batch.name}</h3><div className="flex gap-2"><Button small onClick={() => setShowMatrix(true)}>View matrix</Button><Button small disabled={pending} onClick={() => setRenaming(batch)}>Rename group</Button>{!Object.values(batch.statuses).some(status => pendingRun({ status })) && <><Button small disabled={pending} onClick={() => void operation(async () => created(await window.specRunner.rerunBatch(batch.id, 'all')))}>Rerun group</Button><Button small disabled={pending || !Object.values(batch.statuses).includes('failed')} onClick={() => void operation(async () => created(await window.specRunner.rerunBatch(batch.id, 'failed')))}>Rerun failed</Button></>}{!Object.values(batch.statuses).some(status => pendingRun({ status })) && <Button small kind="plain" disabled={pending} onClick={() => void operation(async () => { await window.specRunner.closeBatch(batch.id); })}>Close group</Button>}</div></div><p className="mt-2 text-xs text-zinc-300">{batch.profiles.length * batch.browsers.length === Object.keys(batch.statuses).length ? `${batch.profiles.length} profiles × ${batch.browsers.length} browsers = ${Object.keys(batch.statuses).length} runs` : `${Object.keys(batch.statuses).length} selected combinations · ${batch.profiles.length} profiles · ${batch.browsers.length} browsers`} · {batch.specCount} specs each</p><p className="mt-1 truncate text-xs text-zinc-400" title={`${batch.profiles.map(profile => profile.name).join(', ')} · ${batch.browsers.join(', ')}`}>Profiles: {batch.profiles.map(profile => profile.name).join(', ')} · Browsers: {batch.browsers.join(', ')}</p><p role="status" aria-label="Group results" className="mt-2 text-xs text-indigo-200">{summary(batch)}</p></div>}
                {!job ? <div className="card p-5 text-sm text-zinc-400">No runs remain in this group. Cancelled queued runs are removed immediately; their results remain in the group summary.</div> : <div role="tabpanel" id={`run-output-${job.id}`} aria-labelledby={`run-tab-${job.id}`} className="card flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="shrink-0 border-b border-white/10 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words text-sm font-semibold text-white">{job.name}</h4><p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-300"><span>{job.profileName}</span><span>{job.browser}</span><span className={statusColor(job.status)}>{runLabels[job.status]}</span><span>#{job.number}</span></p><p className="mt-1 text-xs text-zinc-400">{job.specs.length} specs · {job.headed ? 'headed' : 'headless'} · {Math.floor(elapsed / 60)}m {elapsed % 60}s{job.exitCode !== null ? ` · exit ${job.exitCode}` : ''}</p><p className="mt-1 text-xs text-zinc-500">{job.startedAt ? 'Started' : 'Created'} {new Date(job.startedAt ?? job.createdAt).toLocaleString()}</p></div><div className="flex flex-wrap items-center gap-2"><Button small disabled={pending} onClick={() => setEditing(job)}>Edit run details</Button>{!pendingRun(job) && <Button small disabled={pending} onClick={() => void operation(async () => created(await window.specRunner.rerun(job.id)))}>Rerun run</Button>}{pendingRun(job) && <Button small kind={job.status === 'queued' ? 'outline' : 'danger'} disabled={pending || job.status === 'stopping'} onClick={() => void operation(async () => { await window.specRunner.stop(job.id); })}>{job.status === 'queued' ? 'Cancel queued run' : job.status === 'stopping' ? 'Stopping…' : 'Stop run'}</Button>}</div></div>{job.notes && <p className="mt-2 max-h-20 overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-zinc-300">{job.notes}</p>}</div>
                    {job.waitReason && <p role="status" className="shrink-0 border-b border-white/10 bg-amber-500/10 p-3 text-xs text-amber-200">{job.waitReason}</p>}
                    <OutputSearch output={output} text={job.output} runId={job.id} open={findOpen} setOpen={setFindOpen} pause={() => setFollow(false)} jump={range => {
                        const element = output.current; if (!element) return;
                        setFollow(false); element.scrollTop += range.getBoundingClientRect().top - element.getBoundingClientRect().top - element.clientHeight / 2; previousScrollTop.current = element.scrollTop;
                    }} />
                    <pre ref={output} onScroll={event => {
                        const element = event.currentTarget;
                        const atBottom = element.scrollHeight - element.clientHeight - element.scrollTop <= 8;
                        if (follow && element.scrollTop < previousScrollTop.current - 1 && !atBottom) setFollow(false);
                        else if (!follow && !findOpen && atBottom && element.scrollTop > previousScrollTop.current + 1) setFollow(true);
                        previousScrollTop.current = element.scrollTop;
                    }} tabIndex={0} aria-label="Cypress terminal output" style={{ background: rgb(terminalBackground), color: rgb(terminalForeground) }} className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs/6 whitespace-pre-wrap">{job.output ? <AnsiOutput text={job.output} startLine={job.outputStartLine} /> : job.status === 'queued' ? 'This run will start automatically when its limits allow.' : 'Waiting for Cypress output…'}</pre>
                    <details className="shrink-0 border-t border-white/10 p-3"><summary className="cursor-pointer text-xs text-zinc-400">Run command and artifacts</summary><code className="mt-2 block text-xs leading-5 break-all text-zinc-300">{job.command}</code><p className="mt-2 break-all text-xs text-zinc-400">Artifacts: {job.artifactDirectory}</p></details>
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 p-3"><div className="min-w-0 text-xs text-zinc-400"><label className="mb-2 flex items-center gap-2"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Follow output</label>{!follow && <Button small className="mb-2" onClick={() => { const element = output.current; if (element) { element.scrollTop = element.scrollHeight; previousScrollTop.current = element.scrollTop; } setFollow(true); }}>Jump to latest</Button>}<p>{job.outputTruncated ? 'Showing the latest' : 'Showing all output, up to'} {outputCharacterLimit.toLocaleString('en-GB')} characters.<Help label="About output history">Each run saves a complete plain-text log automatically. Its visible history is limited to keep the interface responsive.</Help></p>{job.logPath && <p className="mt-1 break-all">Full log: {job.logPath}{pendingRun(job) ? ' (saving…)' : ''}</p>}{job.logError && <p role="alert" className="mt-1 text-red-300">{job.logError}</p>}</div><div className="flex items-center gap-2"><Button small title="Find in visible output (Ctrl/Cmd+F)" onClick={() => setFindOpen(true)}>Find output</Button><Button small title="Copies the complete plain-text log up to this point, including output beyond the visible history (up to 20 MiB)." disabled={pending || (!job.output && !job.logPath)} onClick={() => void operation(async () => { await window.specRunner.copyOutput(job.id); setCopied(true); })}>{copied ? 'Copied output' : 'Copy output'}</Button><Button small disabled={pendingRun(job) || pending || !job.logPath || !!job.logError} onClick={() => void operation(async () => { await window.specRunner.openLog(job.id); })}>Open log</Button></div></div>
                </div>}
            </div>
        </div>}
        {showMatrix && batch && <MatrixOverview batch={batch} runs={runs} onClose={() => setShowMatrix(false)} onSelect={run => { choose(run); setShowMatrix(false); }} />}
        {editing && <RunDetailsEditor key={editing.id} job={editing} onClose={() => setEditing(null)} />}
        {renaming && <GroupNameEditor key={renaming.id} batch={renaming} onClose={() => setRenaming(null)} />}
    </section>;
}
function RunDetailsEditor({ job, onClose }: { job: RunJob; onClose: () => void }) {
    const [details, setDetails] = useState<RunDetails>({ name: job.name, notes: job.notes });
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <Modal title="Edit run details" description="Names and notes are kept for this app session. The actual profile and browser stay visible, and the running command is unchanged." onClose={() => { if (!busy) onClose(); }} actions={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button kind="primary" disabled={busy || !details.name.trim()} onClick={() => { setBusy(true); setError(''); void window.specRunner.updateRun(job.id, details).then(onClose).catch(error => setError(String(error.message))).finally(() => setBusy(false)); }}>Save run details</Button></>}><label htmlFor="run-name" className="field-label">Run name</label><input id="run-name" autoFocus maxLength={100} disabled={busy} value={details.name} onChange={event => setDetails({ ...details, name: event.target.value })} /><label htmlFor="run-notes" className="field-label mt-4">Notes (optional)</label><textarea id="run-notes" rows={3} maxLength={2000} disabled={busy} value={details.notes} onChange={event => setDetails({ ...details, notes: event.target.value })} />{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}</Modal>;
}
function GroupNameEditor({ batch, onClose }: { batch: RunBatch; onClose: () => void }) {
    const [name, setName] = useState(batch.name), [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <Modal title="Rename run group" description="Give this group a name for this app session." onClose={() => { if (!busy) onClose(); }} actions={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button kind="primary" disabled={busy || !name.trim()} onClick={() => { setBusy(true); setError(''); void window.specRunner.renameBatch(batch.id, name).then(onClose).catch(error => setError(String(error.message))).finally(() => setBusy(false)); }}>Save group name</Button></>}><label htmlFor="group-name" className="field-label">Group name</label><input id="group-name" autoFocus maxLength={100} disabled={busy} value={name} onChange={event => setName(event.target.value)} />{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}</Modal>;
}
