import type { RunBatch, RunJob } from '../shared/types';
import { executionModeLabels, runLabels } from '../shared/runs';
import { Button, Modal } from './ui';

export function MatrixOverview({ batch, runs, onSelect, onClose }: {
    batch: RunBatch; runs: RunJob[]; onSelect: (run: RunJob) => void; onClose: () => void;
}) {
    const jobsById = new Map(runs.map(run => [run.id, run]));
    return <Modal title={`Matrix: ${batch.name}`} description={`${executionModeLabels[batch.executionMode ?? 'repeat']} · Choose a run to open its output.`} onClose={onClose} actions={<Button onClick={onClose}>Done</Button>}>
        <div className="max-h-80 overflow-auto rounded-lg border border-white/10">
            <table className="w-full border-collapse text-left text-xs">
                <caption className="sr-only">Profile and browser results for {batch.name}</caption>
                <thead className="sticky top-0 bg-zinc-900"><tr>
                    <th scope="col" className="p-3">Profile</th>
                    {batch.browsers.map(browser => <th key={browser} scope="col" className="p-3 capitalize">{batch.browserNames?.[browser] ?? browser}</th>)}
                </tr></thead>
                <tbody>{batch.profiles.map(profile => <tr key={profile.id} className="border-t border-white/10">
                    <th scope="row" className="max-w-48 break-words p-3 font-medium text-zinc-100">{profile.name}</th>
                    {batch.browsers.map(browser => {
                        const targets = batch.targets.filter(target => target.profileId === profile.id && target.browser === browser);
                        return <td key={browser} className="p-2 align-top">
                            {!targets.length && <span className="block px-3 py-2 text-zinc-400">Not included</span>}
                            <div className="space-y-1">{targets.map((target, index) => {
                                const status = batch.statuses[target.id];
                                const job = jobsById.get(target.id);
                                const label = runLabels[status];
                                const part = targets.length > 1 ? `Part ${index + 1} · ` : '';
                                const color = status === 'failed' ? 'text-red-300' : status === 'passed' ? 'text-emerald-300' : status === 'queued' ? 'text-amber-200' : 'text-zinc-300';
                                const contents = <>{part}{label}{target.specCount !== undefined && <span className="mt-1 block text-[10px] text-zinc-400">{target.specCount} specs</span>}</>;
                                return job
                                    ? <button key={target.id} type="button" aria-label={`${profile.name} on ${batch.browserNames?.[browser] ?? browser}: ${part}${label}`} title={job.name} className={`w-full rounded border border-white/15 bg-zinc-950 px-3 py-2 text-left hover:border-indigo-400 ${color}`} onClick={() => onSelect(job)}>{contents}</button>
                                    : <span key={target.id} className={`block px-3 py-2 ${color}`}>{contents}<span className="mt-1 block text-[10px] text-zinc-500">Row removed</span></span>;
                            })}</div>
                        </td>;
                    })}
                </tr>)}</tbody>
            </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-400">Cancelled and closed rows keep their results here. A failed-only rerun can contain just some runs.</p>
    </Modal>;
}
