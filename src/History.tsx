import { useEffect, useRef, useState } from 'react';
import type { HistoryDetail, HistoryList, MatrixResult } from '../shared/types';
import { Button, Modal, Spinner } from './ui';
import { ResultsContent } from './Results';
import { failedSpecSelection } from '../shared/results';

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
        <div className="space-y-2" aria-busy={refreshing}>{refreshing && <p role="status" className="flex items-center gap-2 text-xs text-zinc-400"><Spinner />Refreshing history…</p>}{entries.map(entry => <div key={entry.id} data-history-id={entry.id} className="card flex items-center gap-3 p-3">
            <Button kind="plain" aria-label={`View recent run ${entry.name}`} disabled={busy} className="min-w-0 flex-1 !justify-start !whitespace-normal !p-0 text-left !font-normal" onClick={() => action(async () => { setOpening(entry.id); try { setDetail(await window.specRunner.historyDetail(entry.id)); } finally { setOpening(''); } })}>
                <span className="min-w-0"><span className="block truncate text-sm text-white">{entry.name}{opening === entry.id ? ' · Opening…' : ''}</span><span className="mt-1 block truncate text-xs text-zinc-400">{entry.profileName} · {entry.browserName} · {entry.status} · {entry.specCount} specs · {(entry.duration / 1000).toFixed(1)}s</span><span className="mt-1 block text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString()}{entry.counts ? ` · ${entry.counts.passed} tests passed, ${entry.counts.failed} failed` : ''}</span></span>
            </Button><Button small disabled={busy || refreshing} onClick={() => action(async () => { await window.specRunner.forgetHistory(entry.id); await refresh(); })}>Forget</Button>
        </div>)}{!refreshing && !entries.length && <p className="text-sm text-zinc-400">{list.entries.length ? 'No matching runs.' : 'Completed runs will appear here. Logs from older runner versions remain on disk.'}</p>}</div>
        {detail && <Modal title={detail.name} description={`${detail.profileName} · ${detail.browserName} · ${detail.status} · ${detail.specCount} specs · ${(detail.duration / 1000).toFixed(1)}s`} onClose={() => { if (!busy) setDetail(null); }} actions={<><Button small disabled={busy || !!failed.problem} title={failed.problem ?? `Rerun ${failed.specs.length} failed files using current settings`} onClick={() => action(async () => { created(await window.specRunner.rerunHistory(detail.id, 'failed-specs')); setDetail(null); })}>Rerun failed specs</Button><Button small disabled={busy} title="Rerun these specs using current project settings and local browser paths" onClick={() => action(async () => { created(await window.specRunner.rerunHistory(detail.id)); setDetail(null); })}>Rerun</Button><Button disabled={busy} onClick={() => setDetail(null)}>Done</Button></>}>
            <ResultsContent key={detail.id} id={detail.id} name={detail.name} results={detail.results} error={detail.resultsError} historical />
            <div className="mt-4 flex flex-wrap gap-2"><Button small successLabel="Opened log" disabled={busy || !detail.logPath || !!detail.logError} onClick={() => window.specRunner.historyLog(detail.id)}>Open log</Button><Button small successLabel="Opened log location" disabled={busy || !detail.logPath || !!detail.logError} onClick={() => window.specRunner.historyLog(detail.id, true)}>Open log location</Button></div>
            {detail.logError && <p role="alert" className="mt-3 text-xs text-red-300">{detail.logError}</p>}
            <details className="mt-4 text-xs text-zinc-400"><summary className="cursor-pointer">Run details and spec files</summary><p className="mt-2">{detail.groupName} · {new Date(detail.createdAt).toLocaleString()}</p>{detail.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{detail.notes}</p>}<ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">{detail.specs.map(spec => <li key={spec} className="break-all">{spec}</li>)}</ul><p className="mt-3">Reruns use current project settings and local browser paths. Missing profiles, browsers or specs must be repaired first.</p></details>
            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        </Modal>}
        {clear && <Modal title="Clear recent history?" description="This removes the recent-run list only. Saved logs, results and artifacts stay on disk." onClose={() => { if (!busy) setClear(false); }} actions={<><Button disabled={busy} onClick={() => setClear(false)}>Cancel</Button><Button kind="danger" disabled={busy} onClick={() => action(async () => { await window.specRunner.forgetHistory(); setClear(false); await refresh(); })}>Clear history</Button></>}><p className="text-sm text-zinc-400">Future completed runs will be recorded normally.</p></Modal>}
    </div>;
}
