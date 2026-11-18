import { useState } from 'react';
import type { MatrixOptions, ProjectConfig } from '../shared/types';
import { availableBrowsers, browserName } from '../shared/types';
import { maxOpenRuns } from '../shared/runs';
import { Button, Checkbox, Help, Modal } from './ui';
import { RunPlanSummary } from './RunPlanSummary';
const distributions = [
    ['repeat', 'Repeat all specs on every target', 'Run the full suite on every profile and browser pair.'],
    ['split', 'Split specs across targets', 'Run each spec once across all selected pairs.'],
    ['per-browser', 'Full suite per browser', 'Run every spec in each browser. Profiles share the work.'],
    ['per-profile', 'Full suite per profile', 'Run every spec on each profile. Browsers share the work.'],
] as const;

export type RunTargets = Omit<MatrixOptions, 'specs'>;
export function RunSetup({ config, targets, specCount, onApply, onClose }: { config: ProjectConfig; targets: RunTargets; specCount: number; onApply: (targets: RunTargets) => void; onClose: () => void }) {
    const [draft, setDraft] = useState(targets);
    const targetsCount = draft.profiles.length * draft.browsers.length;
    const mode = draft.executionMode ?? 'repeat';
    return <Modal title="Configure run" description="Choose where you need full coverage and which targets can share the work." onClose={onClose} actions={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" disabled={!targetsCount || targetsCount > maxOpenRuns} onClick={() => onApply(draft)}>Apply configuration</Button></>}>
        <fieldset className="mb-5">
            <legend className="field-label">Spec distribution</legend>
            <div className="grid gap-3 sm:grid-cols-2">
                {distributions.map(([value, title, description]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${mode === value ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/15'}`}>
                    <input type="radio" name="spec-distribution" aria-label={title} checked={mode === value} onChange={() => setDraft({ ...draft, executionMode: value })} />
                    <span>{title}<span className="mt-1 block text-xs leading-5 text-zinc-400">{description}</span></span>
                </label>)}
            </div>
            {mode !== 'repeat' && <p className="mt-2 text-xs leading-5 text-zinc-400">
                Whole spec files are balanced by file count. Pairs with no assigned files are skipped.
                {(mode === 'split' || mode === 'per-browser') && ' Choose profiles that can run the same specs.'}
            </p>}
        </fieldset>
        <div className="grid gap-6 sm:grid-cols-2"><fieldset><legend className="field-label">Run profiles</legend><div id="run-profiles" className="max-h-64 space-y-3 overflow-y-auto">{config.profiles.map(profile => <label key={profile.id} className="flex items-start gap-3 text-sm"><Checkbox label={`Run on profile ${profile.name}`} checked={draft.profiles.includes(profile.id)} onChange={checked => setDraft(current => ({ ...current, profiles: checked ? [...current.profiles, profile.id] : current.profiles.filter(id => id !== profile.id) }))} /><span className="min-w-0"><span className="block break-words text-zinc-100">{profile.name}</span><span className="mt-1 block text-xs text-zinc-400">Up to {profile.maxConcurrentRuns ?? 1} at once{profile.concurrencyGroup ? ` · ${config.concurrencyGroups?.find(group => group.id === profile.concurrencyGroup)?.name}` : ''}</span></span></label>)}</div></fieldset>
            <fieldset><legend className="field-label">Browsers</legend><div id="run-browsers" className="space-y-3">{availableBrowsers(config).map(browser => <label key={browser} className="flex items-center gap-3 text-sm"><Checkbox label={`Run in ${browserName(config, browser)}`} checked={draft.browsers.includes(browser)} onChange={checked => setDraft(current => ({ ...current, browsers: checked ? [...current.browsers, browser] : current.browsers.filter(value => value !== browser) }))} />{browserName(config, browser)}</label>)}</div></fieldset></div>
        <label className="mt-6 flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.headed} onChange={event => setDraft({ ...draft, headed: event.target.checked })} />Show browsers <Help label="About showing the browser">Opens a browser window for each active run. Leave off for headless runs.</Help></label>
        <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" aria-label="Use separate artifact folders per run" checked={draft.isolateArtifacts !== false} onChange={event => setDraft({ ...draft, isolateArtifacts: event.target.checked })} /><span>Use separate artifact folders per run<span className="mt-1 block text-xs leading-5 text-zinc-400">Overrides Cypress screenshot, video and download folders. Turn off to use your Cypress/profile paths; concurrent runs may overwrite shared files. Logs always stay separate.</span></span></label>
        <div aria-label="Run configuration summary" className="mt-5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 p-3 text-sm text-indigo-100">
            <RunPlanSummary specCount={specCount} targets={draft} detailed />
            <p className="mt-1 text-xs text-indigo-200">Up to {config.maxConcurrentRuns ?? 2} runs at once overall, subject to profile and shared environment limits.</p>
        </div>
        {!targetsCount && <p role="status" className="mt-3 text-sm text-amber-200">Choose at least one profile and browser.</p>}{targetsCount > maxOpenRuns && <p role="alert" className="mt-3 text-sm text-amber-200">Choose at most {maxOpenRuns} combinations per batch.</p>}
    </Modal>;
}
