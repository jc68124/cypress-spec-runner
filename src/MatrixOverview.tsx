import type { RunBatch, RunJob } from '../shared/types';
import { executionModeLabels, runLabels } from '../shared/runs';
import { Button, Modal } from './ui';
export function MatrixOverview({ batch, runs, onSelect, onClose }: { batch: RunBatch; runs: RunJob[]; onSelect: (run: RunJob) => void; onClose: () => void }) {
    return <Modal title={`Matrix: ${batch.name}`} description={`${executionModeLabels[batch.executionMode ?? 'repeat']} · Choose a cell to open that run. Cells show assigned spec counts.`} onClose={onClose} actions={<Button onClick={onClose}>Done</Button>}>
        <div className="max-h-80 overflow-auto rounded-lg border border-white/10"><table className="w-full border-collapse text-left text-xs"><caption className="sr-only">Profile and browser results for {batch.name}</caption><thead className="sticky top-0 bg-zinc-900"><tr><th scope="col" className="p-3">Profile</th>{batch.browsers.map(browser => <th key={browser} scope="col" className="p-3 capitalize">{batch.browserNames?.[browser] ?? browser}</th>)}</tr></thead><tbody>{batch.profiles.map(profile => <tr key={profile.id} className="border-t border-white/10"><th scope="row" className="max-w-48 break-words p-3 font-medium text-zinc-100">{profile.name}</th>{batch.browsers.map(browser => {
            const target = batch.targets.find(target => target.profileId === profile.id && target.browser === browser);
            const status = target && batch.statuses[target.id];
            const job = target && runs.find(run => run.id === target.id);
            const label = status ? runLabels[status] : 'Not included';
            const color = status === 'failed' ? 'text-red-300' : status === 'passed' ? 'text-emerald-300' : status === 'queued' ? 'text-amber-200' : 'text-zinc-300';
            return <td key={browser} className="p-2">{job ? <button type="button" aria-label={`${profile.name} on ${batch.browserNames?.[browser] ?? browser}: ${label}`} className={`w-full rounded border border-white/15 bg-zinc-950 px-3 py-2 text-left hover:border-indigo-400 ${color}`} onClick={() => onSelect(job)}>{label}{target?.specCount !== undefined && <span className="mt-1 block text-[10px] text-zinc-400">{target.specCount} specs</span>}</button> : <span title={target ? 'The output row was removed; the result is retained.' : 'This combination was not part of this submission.'} className={`block px-3 py-2 ${color}`}>{label}{target?.specCount !== undefined && <span className="mt-1 block text-[10px] text-zinc-400">{target.specCount} specs</span>}{target && <span className="mt-1 block text-[10px] text-zinc-500">Row removed</span>}</span>}</td>;
        })}</tr>)}</tbody></table></div>
        <p className="mt-3 text-xs leading-5 text-zinc-400">Cancelled and closed rows keep their results here. A failed-only rerun can contain just some profile/browser combinations.</p>
    </Modal>;
}
