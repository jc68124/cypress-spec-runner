import { formatDuration } from '../shared/duration';
import { useState } from 'react';
import type { RunResults } from '../shared/types';
import { Button, Modal } from './ui';

type ResultsProps = { id: string; name: string; results?: RunResults; error?: string; historical?: boolean };
export function ResultsContent({ id, name, results, error, historical = false, scrollable = true, showSummary = true }: ResultsProps & { scrollable?: boolean; showSummary?: boolean }) {
    const [failedOnly, setFailedOnly] = useState(!!results?.failed || !!results?.specs.some(spec => spec.error));
    const [actionError, setActionError] = useState('');
    async function open(filename: string) {
        setActionError('');
        try { await window.specRunner.openArtifact(id, filename, historical); }
        catch (error) { setActionError((error as Error).message); throw error; }
    }
    function copy() {
        if (!results) return;
        const text = `${name}\n${results.passed} passed · ${results.failed} failed · ${results.pending} pending · ${results.skipped} skipped · ${formatDuration(results.duration)}${results.error ? `\n${results.error}` : ''}\n` + results.specs.map(spec => `${spec.failed || spec.error ? 'FAIL' : spec.passed ? 'PASS' : spec.pending ? 'PENDING' : spec.skipped ? 'SKIPPED' : 'EMPTY'} ${spec.spec}: ${spec.passed} passed, ${spec.failed} failed, ${spec.pending + spec.skipped} pending/skipped`).join('\n');
        return window.specRunner.copy(text);
    }
    const specs = results?.specs.filter(spec => !failedOnly || spec.failed > 0 || spec.error) ?? [];
    return <section aria-label="Test results">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold text-white">Test results</h3><Button small disabled={!results} successLabel="Copied results" onClick={copy}>Copy results</Button></div>
        {!results ? <p className="text-sm text-zinc-400">{error ?? (historical ? 'This run has no structured results. Open its saved log for diagnostics.' : 'Structured results are available after Cypress finishes. The output and full log remain available.')}</p> : <>
            {showSummary && <p role="status" className="text-sm text-zinc-200"><span className="text-emerald-300">{results.passed} passed</span> · <span className="text-red-300">{results.failed} failed</span> · {results.pending} pending · {results.skipped} skipped · {formatDuration(results.duration)}</p>}
            {results.error && <p role="alert" className="mt-2 text-xs text-amber-200">{results.error}</p>}
            <label className="my-4 flex items-center gap-2 text-xs"><input type="checkbox" checked={failedOnly} onChange={event => setFailedOnly(event.target.checked)} />Failed specs only</label>
            <div className={scrollable ? 'max-h-[50vh] space-y-1 overflow-y-auto' : 'space-y-1'}>{specs.map((spec, index) => <details key={`${spec.spec}-${index}`} open={spec.failed > 0 || !!spec.error} className="group rounded-lg border border-white/10 bg-zinc-950 p-2">
                <summary className="flex min-w-0 cursor-pointer list-none items-center gap-3 text-xs"><span aria-hidden="true" className="shrink-0 text-zinc-500 group-open:rotate-90">›</span><span className="min-w-0 flex-1 truncate text-zinc-200" title={spec.spec}><span>{spec.spec.split('/').at(-1)}</span><span className="ml-2 text-zinc-500">{spec.spec.includes('/') ? spec.spec.slice(0, spec.spec.lastIndexOf('/')) : ''}</span></span><span className="shrink-0 whitespace-nowrap tabular-nums text-zinc-400"><span className="text-emerald-300">{spec.passed} passed</span> · <span className={spec.failed ? 'text-red-300' : ''}>{spec.failed} failed</span>{!!(spec.pending + spec.skipped) && ` · ${spec.pending + spec.skipped} pending/skipped`}</span><span className="w-14 shrink-0 whitespace-nowrap text-right tabular-nums text-zinc-400">{formatDuration(spec.duration)}</span><span className={`w-24 shrink-0 truncate whitespace-nowrap text-right ${spec.failed || spec.error ? 'text-red-300' : spec.passed ? 'text-emerald-300' : 'text-zinc-400'}`}>{spec.failed || spec.error ? 'Failed' : spec.passed ? 'Passed' : spec.pending ? 'Pending' : spec.skipped ? 'Skipped' : 'No tests'}</span></summary>
                <div className="mt-3 space-y-2">{spec.error && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-red-300">{spec.error}</pre>}
                    {spec.tests.map((test, index) => <div key={index} className="border-t border-white/10 pt-2 text-xs"><p className={test.state === 'failed' ? 'text-red-300' : 'text-zinc-300'}>{test.title} · {test.state}{test.attempts > 1 ? ` · ${test.attempts} attempts` : ''}{test.duration ? ` · ${formatDuration(test.duration)}` : ''}</p>{test.error && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-zinc-400">{test.error}</pre>}</div>)}
                    <div className="flex flex-wrap gap-2">{spec.screenshots.map((filename, index) => <Button key={filename} small successLabel="Opened screenshot" onClick={() => open(filename)}>Screenshot {index + 1}</Button>)}{spec.video && <Button small successLabel="Opened video" onClick={() => open(spec.video!)}>Video</Button>}</div>
                </div>
            </details>)}{!specs.length && <p className="text-sm text-zinc-400">{failedOnly ? 'No failed specs.' : 'No spec details were returned.'}</p>}</div>
            <p className="mt-3 text-xs text-zinc-500">Counts are final Cypress results after retries.</p>
            {results.truncated && <p className="mt-3 text-xs text-amber-200">Detailed results were limited to keep the app responsive. Totals are complete; use the log or your reporter for the full detail.</p>}
        </>}
        {actionError && <p role="alert" className="mt-3 text-xs text-red-300">{actionError}</p>}
    </section>;
}
export function Results({ onClose, ...props }: ResultsProps & { onClose: () => void }) {
    return <Modal title="Test results" description={props.name} onClose={onClose} actions={<Button onClick={onClose}>Done</Button>}><ResultsContent {...props} /></Modal>;
}
