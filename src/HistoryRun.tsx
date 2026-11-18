import { useLayoutEffect, useRef, useState } from 'react';
import { formatDuration } from '../shared/duration';
import { failedSpecSelection } from '../shared/results';
import { runLabels } from '../shared/runs';
import type { HistoryDetail, MatrixResult } from '../shared/types';
import { IconButton } from './IconButton';
import { ResultsContent } from './Results';
import { Button } from './ui';

export function HistoryRun({ detail, back, created }: {
    detail: HistoryDetail;
    back: () => void;
    created: (result: MatrixResult) => void;
}) {
    const [view, setView] = useState<'results' | 'details'>('results');
    const [rerunning, setRerunning] = useState(false);
    const heading = useRef<HTMLHeadingElement>(null);
    const failed = failedSpecSelection(detail.results, detail.specs);
    const hasLog = !!detail.logPath && !detail.logError;

    useLayoutEffect(() => { heading.current?.focus(); }, []);

    async function rerun(mode?: 'failed-specs') {
        setRerunning(true);
        try {
            created(await window.specRunner.rerunHistory(detail.id, mode));
        } finally {
            setRerunning(false);
        }
    }

    return <section aria-label="Saved run" className="flex min-h-80 flex-1 flex-col gap-2">
        <div className="shrink-0">
            <Button small kind="plain" aria-label="Back to History" onClick={back}>← Back to History</Button>
        </div>
        <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                <div className="min-w-0">
                    <h2 ref={heading} tabIndex={-1} className="break-words text-sm font-medium text-white">{detail.name}</h2>
                    <p className="break-words text-xs text-zinc-400">
                        {detail.profileName} · {detail.browserName} · {runLabels[detail.status]} · {detail.specCount} specs · {formatDuration(detail.duration)}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <IconButton icon="file" label="Open log" successLabel="Opened log" disabled={!hasLog} onClick={() => window.specRunner.historyLog(detail.id)} />
                    <IconButton icon="folder" label="Open log location" successLabel="Opened log location" disabled={!hasLog} onClick={() => window.specRunner.historyLog(detail.id, true)} />
                    <Button small disabled={rerunning || !!failed.problem} title={failed.problem ?? `Rerun ${failed.specs.length} failed files using current settings`} onClick={() => rerun('failed-specs')}>Rerun failed specs</Button>
                    <Button small disabled={rerunning} title="Rerun these specs using current project settings and local browser paths" onClick={() => rerun()}>Rerun</Button>
                </div>
            </div>
            {detail.logError && <p role="alert" className="shrink-0 border-b border-white/10 px-3 py-1 text-xs text-red-300">{detail.logError}</p>}
            <nav aria-label="Saved run display" className="flex shrink-0 gap-5 border-b border-white/10 px-3">
                {([{ id: 'results', label: 'Results' }, { id: 'details', label: 'Run details' }] as const).map(tab =>
                    <button key={tab.id} type="button" aria-current={view === tab.id ? 'page' : undefined} onClick={() => setView(tab.id)} className={`border-b-2 py-2 text-xs font-medium ${view === tab.id ? 'border-indigo-400 text-indigo-200' : 'border-transparent text-zinc-400 hover:text-white'}`}>
                        {tab.label}
                    </button>
                )}
            </nav>
            <div hidden={view !== 'results'} aria-label="Saved run results" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-4">
                <ResultsContent id={detail.id} name={detail.name} results={detail.results} error={detail.resultsError} historical scrollable={false} />
            </div>
            {view === 'details' && <div tabIndex={0} aria-label="Saved run details" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm text-zinc-300">
                <p>{detail.groupName} · {new Date(detail.createdAt).toLocaleString()}</p>
                {detail.notes && <p className="whitespace-pre-wrap break-words">{detail.notes}</p>}
                <div>
                    <h3 className="mb-2 font-semibold text-white">Spec files</h3>
                    <ul className="space-y-1 text-xs">{detail.specs.map(spec => <li key={spec} className="break-all">{spec}</li>)}</ul>
                </div>
                <p className="text-xs text-zinc-400">Reruns use current project settings and local browser paths. Missing profiles, browsers or specs must be repaired first.</p>
            </div>}
        </div>
    </section>;
}
