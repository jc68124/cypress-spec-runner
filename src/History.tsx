import { formatDuration } from '../shared/duration';
import { useEffect, useRef, useState } from 'react';
import type { HistoryDetail, HistoryList, MatrixResult } from '../shared/types';
import { Button, Modal, Spinner } from './ui';
import { ResultsContent } from './Results';
import { IconButton } from './IconButton';
import { failedSpecSelection } from '../shared/results';

const statusClasses = { failed: 'border-red-400/25 bg-red-500/10 text-red-300', passed: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300', stopped: 'border-amber-400/25 bg-amber-500/10 text-amber-200' };
const statusNames = { failed: 'Failed', passed: 'Passed', stopped: 'Stopped' };

export function History({ revision, created }: { revision: string; created: (result: MatrixResult) => void }) {
    const [list, setList] = useState<HistoryList>({ entries: [] }), [detail, setDetail] = useState<HistoryDetail | null>(null);
    const [clear, setClear] = useState(false), [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [opening, setOpening] = useState(''), [refreshing, setRefreshing] = useState(false);
    const request = useRef(0);
    async function refresh() {
        const current = ++request.current;
        setRefreshing(true); setError('');
        try { const value = await window.specRunner.history(); if (current === request.current) setList(value); }
        catch (error) { if (current === request.current) { setError((error as Error).message); throw error; } }
        finally { if (current === request.current) setRefreshing(false); }
    }
    useEffect(() => { void refresh().catch(() => {}); return () => { request.current++; }; }, [revision]);
    async function action(run: () => Promise<void>) {
        setBusy(true); setError('');
        try { await run(); } catch (error) { setError((error as Error).message); throw error; } finally { setBusy(false); }
    }
    const failed = detail ? failedSpecSelection(detail.results, detail.specs) : { specs: [], problem: 'No history item selected.' };
    const entries = list.entries.filter(entry => (status === 'all' || entry.status === status) && `${entry.name} ${entry.groupName} ${entry.profileName} ${entry.browserName}`.toLowerCase().includes(search.toLowerCase()));
    return <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">Recent runs</h2><p className="mt-1 text-xs text-zinc-400">Last 100 completed, failed or stopped runs in this checkout. Saved locally across app restarts.</p></div><div className="flex gap-2"><Button small aria-label="Refresh history" disabled={busy || refreshing} successLabel="History refreshed" onClick={refresh}>Refresh history</Button><Button small disabled={busy || refreshing || (!list.entries.length && !list.error)} onClick={() => setClear(true)}>Clear history</Button></div></div>
        <div className="flex gap-3"><input aria-label="Search recent runs" type="search" placeholder="Search names, profiles or browsers…" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filter recent run status" className="max-w-40" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All results</option><option value="failed">Failed</option><option value="passed">Passed</option><option value="stopped">Stopped</option></select></div>
        {(error || list.error) && <p role="alert" className="text-sm text-red-300">{error || list.error}</p>}
        {refreshing && <p role="status" className="flex items-center gap-2 text-xs text-zinc-400"><Spinner />Refreshing history…</p>}
        <div className="card max-h-[calc(100vh_-_17rem)] overflow-auto" aria-busy={refreshing}>
            <table aria-label="Recent runs" className="w-full min-w-[64rem] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-400"><tr>{['Run', 'Profile', 'Browser', 'Status', 'Tests', 'Specs', 'Duration', 'Started'].map(name => <th key={name} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{name}</th>)}<th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{entries.map(entry => { const started = new Date(entry.createdAt); return <tr key={entry.id} data-history-id={entry.id} className={`border-t border-white/10 ${entry.status === 'failed' ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-white/5'}`}>
                    <td className="max-w-64 px-3 py-1"><Button small kind="plain" aria-label={`View recent run ${entry.name}`} title={`${entry.name} · ${entry.groupName}`} disabled={busy} className="w-full !justify-start !p-0 text-left !font-medium !text-white" onClick={() => action(async () => { setOpening(entry.id); try { setDetail(await window.specRunner.historyDetail(entry.id)); } finally { setOpening(''); } })}><span className="block truncate">{entry.name}{opening === entry.id ? ' · Opening…' : ''}</span></Button></td>
                    <td className="max-w-40 truncate whitespace-nowrap px-3 py-1 text-zinc-300" title={entry.profileName}>{entry.profileName}</td>
                    <td className="max-w-32 truncate whitespace-nowrap px-3 py-1 text-zinc-300" title={entry.browserName}>{entry.browserName}</td>
                    <td className="whitespace-nowrap px-3 py-1"><span data-history-status={entry.status} className={`inline-flex items-center rounded border px-2 py-0.5 font-medium ${statusClasses[entry.status]}`}>{statusNames[entry.status]}</span></td>
                    <td className="whitespace-nowrap px-3 py-1 tabular-nums" title={entry.counts ? `${entry.counts.pending} pending · ${entry.counts.skipped} skipped` : 'Structured test results are unavailable'}>{entry.counts ? <><span className="text-emerald-300">{entry.counts.passed} passed</span><span className="text-zinc-500"> · </span><span className={entry.counts.failed ? 'text-red-300' : 'text-zinc-400'}>{entry.counts.failed} failed</span></> : <span className="text-zinc-500">—</span>}</td>
                    <td className="px-3 py-1 tabular-nums text-zinc-400">{entry.specCount}</td>
                    <td className="whitespace-nowrap px-3 py-1 tabular-nums text-zinc-300">{formatDuration(entry.duration)}</td>
                    <td className="whitespace-nowrap px-3 py-1 text-zinc-400"><time dateTime={Number.isNaN(started.valueOf()) ? undefined : started.toISOString()} title={started.toLocaleString()}>{started.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></td>
                    <td className="px-2 py-1 text-right"><IconButton icon="trash" label={`Remove ${entry.name} from history`} title="Remove this entry from history. Saved logs, results and artifacts are kept." className="hover:!text-red-300" disabled={busy || refreshing} onClick={() => action(async () => { await window.specRunner.forgetHistory(entry.id); await refresh(); })} /></td>
                </tr>; })}</tbody>
            </table>
            {!refreshing && !entries.length && <p className="p-5 text-sm text-zinc-400">{list.entries.length ? 'No matching runs.' : 'Completed runs will appear here. Logs from older runner versions remain on disk.'}</p>}
        </div>
        {detail && <Modal title={detail.name} description={`${detail.profileName} · ${detail.browserName} · ${detail.status} · ${detail.specCount} specs · ${formatDuration(detail.duration)}`} onClose={() => { if (!busy) setDetail(null); }} actions={<><Button small disabled={busy || !!failed.problem} title={failed.problem ?? `Rerun ${failed.specs.length} failed files using current settings`} onClick={() => action(async () => { created(await window.specRunner.rerunHistory(detail.id, 'failed-specs')); setDetail(null); })}>Rerun failed specs</Button><Button small disabled={busy} title="Rerun these specs using current project settings and local browser paths" onClick={() => action(async () => { created(await window.specRunner.rerunHistory(detail.id)); setDetail(null); })}>Rerun</Button><Button disabled={busy} onClick={() => setDetail(null)}>Done</Button></>}>
            <ResultsContent key={detail.id} id={detail.id} name={detail.name} results={detail.results} error={detail.resultsError} historical />
            <div className="mt-4 flex flex-wrap gap-2"><Button small successLabel="Opened log" disabled={busy || !detail.logPath || !!detail.logError} onClick={() => window.specRunner.historyLog(detail.id)}>Open log</Button><Button small successLabel="Opened log location" disabled={busy || !detail.logPath || !!detail.logError} onClick={() => window.specRunner.historyLog(detail.id, true)}>Open log location</Button></div>
            {detail.logError && <p role="alert" className="mt-3 text-xs text-red-300">{detail.logError}</p>}
            <details className="mt-4 text-xs text-zinc-400"><summary className="cursor-pointer">Run details and spec files</summary><p className="mt-2">{detail.groupName} · {new Date(detail.createdAt).toLocaleString()}</p>{detail.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{detail.notes}</p>}<ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">{detail.specs.map(spec => <li key={spec} className="break-all">{spec}</li>)}</ul><p className="mt-3">Reruns use current project settings and local browser paths. Missing profiles, browsers or specs must be repaired first.</p></details>
            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        </Modal>}
        {clear && <Modal title="Clear recent history?" description="This removes the recent-run list only. Saved logs, results and artifacts stay on disk." onClose={() => { if (!busy) setClear(false); }} actions={<><Button disabled={busy} onClick={() => setClear(false)}>Cancel</Button><Button kind="danger" disabled={busy} onClick={() => action(async () => { await window.specRunner.forgetHistory(); setClear(false); await refresh(); })}>Clear history</Button></>}><p className="text-sm text-zinc-400">Future completed runs will be recorded normally.</p></Modal>}
    </div>;
}
