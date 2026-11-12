import { useState } from 'react';
import type { Project, ProjectConfig, RunProfile, RunOptions } from '../shared/types';
import { availableBrowsers, browsers } from '../shared/types';
import { Button, Help } from './ui';

export function Settings({ project, disabled, onSave, browser, setBrowser, follow, setFollow }: {
    project: Project; disabled: boolean; onSave: (config: ProjectConfig) => Promise<void>;
    browser: RunOptions['browser']; setBrowser: (browser: RunOptions['browser']) => void; follow: boolean; setFollow: (follow: boolean) => void;
}) {
    const [draft, setDraft] = useState(project.config);
    const [patterns, setPatterns] = useState(project.config.specPattern.join('\n'));
    const [exclusions, setExclusions] = useState(project.config.excludeSpecPattern.join('\n'));
    const [advanced, setAdvanced] = useState<Record<string, { args: string; env: string }>>(() => Object.fromEntries(project.config.profiles.map(profile => [profile.id, { args: JSON.stringify(profile.args, null, 2), env: JSON.stringify(profile.env, null, 2) }])));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const busy = saving || disabled;
    const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    function updateProfile(id: string, patch: Partial<RunProfile>) { setDraft(current => ({ ...current, profiles: current.profiles.map(profile => profile.id === id ? { ...profile, ...patch } : profile) })); }
    function addGroup() {
        setDraft(current => ({ ...current, concurrencyGroups: [...(current.concurrencyGroups ?? []), { id: crypto.randomUUID(), name: `Environment ${(current.concurrencyGroups?.length ?? 0) + 1}`, maxConcurrentRuns: 1 }] }));
    }
    function addProfile() {
        const id = crypto.randomUUID();
        setDraft(current => ({ ...current, profiles: [...current.profiles, { id, name: `Profile ${current.profiles.length + 1}`, args: [], env: {} }] }));
        setAdvanced(current => ({ ...current, [id]: { args: '[]', env: '{}' } }));
    }
    async function save() {
        setError(''); setSaving(true);
        try {
            const profiles = draft.profiles.map(profile => {
                try { return { ...profile, args: JSON.parse(advanced[profile.id].args), env: JSON.parse(advanced[profile.id].env) }; }
                catch { throw Error(`Check the advanced argument/environment JSON for ${profile.name}.`); }
            });
            await onSave({ ...draft, specPattern: lines(patterns), excludeSpecPattern: lines(exclusions), profiles });
        } catch (error) { setError((error as Error).message); } finally { setSaving(false); }
    }
    return <div className="mx-auto max-w-5xl space-y-5">
        <div><h2 className="text-xl font-semibold text-white">{project.initialized ? 'Settings' : 'Set up this project'}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Shared settings are saved to your project. Commit configuration and categories so everyone uses the same setup.</p></div>
        {!project.initialized && <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 p-4 text-sm leading-6 text-indigo-200">Cypress has been detected. Review the defaults, then save to create the runner configuration, initial folder categories, launch script, and Git ignore entries.</div>}
        <section className="settings-section space-y-4" aria-labelledby="project-settings-title">
            <h3 id="project-settings-title" className="font-semibold text-white">Project settings <span className="ml-2 text-xs font-normal text-indigo-300">Shared through Git</span></h3>
            <div><label htmlFor="project-name" className="field-label">Project display name</label><input id="project-name" disabled={busy} value={draft.name} maxLength={100} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div>
            <div className="grid gap-4 md:grid-cols-2"><div><label htmlFor="config-file" className="field-label">Cypress configuration file</label><input id="config-file" disabled={busy} value={draft.configFile ?? ''} placeholder="Automatic" onChange={event => setDraft({ ...draft, configFile: event.target.value || null })} /><p className="field-description mt-2">Relative to the project root. Leave blank for Cypress’s default discovery.</p></div>
                <div><label htmlFor="env-file" className="field-label">Local environment file <Help label="About local environment files">The file is read only when a run starts. Its values stay local and are not shown in the interface. Existing process variables take priority.</Help></label><input id="env-file" disabled={busy} value={draft.envFile ?? ''} placeholder="Optional, e.g. .env" onChange={event => setDraft({ ...draft, envFile: event.target.value || null })} /><p className="field-description mt-2">Store credentials here or in your existing shell environment. Keep the environment file out of Git.</p></div></div>
        </section>
        <section className="settings-section space-y-4" aria-labelledby="browsers-title">
            <h3 id="browsers-title" className="font-semibold text-white">Available browsers <Help label="About available browsers">Choose which browsers people can select for this project. Browsers must be installed locally; this does not install or detect them. Save and commit the project configuration to share this list.</Help></h3>
            <p className="field-description">Enable at least one browser. Only enabled browsers appear in run controls and personal preferences.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-3">{browsers.map(value => <label key={value} className="flex items-center gap-3 text-sm"><input type="checkbox" aria-label={`Enable ${value}`} checked={availableBrowsers(draft).includes(value)} disabled={busy || (availableBrowsers(draft).length === 1 && availableBrowsers(draft).includes(value))} onChange={event => setDraft(current => ({ ...current, browsers: event.target.checked ? browsers.filter(browser => browser === value || availableBrowsers(current).includes(browser)) : availableBrowsers(current).filter(browser => browser !== value) }))} />{value}</label>)}</div>
        </section>
        <section className="settings-section space-y-4" aria-labelledby="scheduling-title">
            <h3 id="scheduling-title" className="font-semibold text-white">Run scheduling <Help label="About concurrency limits">Runs start only when the overall, profile, and shared environment group limits all allow it. Other profiles can start while a queued run waits. These limits apply to this app instance.</Help></h3>
            <div className="max-w-xs"><label htmlFor="max-runs" className="field-label">Maximum simultaneous runs</label><input id="max-runs" type="number" min={1} max={8} step={1} disabled={busy} value={draft.maxConcurrentRuns ?? 2} onChange={event => setDraft({ ...draft, maxConcurrentRuns: Number(event.target.value) })} /></div>
            <div className="flex items-center justify-between gap-4"><h4 className="text-sm font-semibold text-white">Shared environment groups</h4><Button small disabled={busy} onClick={addGroup}>Add group</Button></div>
            <p className="field-description">Assign profiles that target the same system to one group. Its limit applies to their combined runs.</p>
            {(draft.concurrencyGroups ?? []).map(group => <div key={group.id} className="grid items-end gap-3 rounded-lg border border-white/10 p-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
                <div><label htmlFor={`group-name-${group.id}`} className="field-label">Group name</label><input id={`group-name-${group.id}`} disabled={busy} value={group.name} onChange={event => setDraft(current => ({ ...current, concurrencyGroups: current.concurrencyGroups!.map(item => item.id === group.id ? { ...item, name: event.target.value } : item) }))} /></div>
                <div><label htmlFor={`group-limit-${group.id}`} className="field-label">Run limit</label><input id={`group-limit-${group.id}`} type="number" min={1} max={8} step={1} disabled={busy} value={group.maxConcurrentRuns} onChange={event => setDraft(current => ({ ...current, concurrencyGroups: current.concurrencyGroups!.map(item => item.id === group.id ? { ...item, maxConcurrentRuns: Number(event.target.value) } : item) }))} /></div>
                <Button small kind="plain" disabled={busy} onClick={() => setDraft(current => ({ ...current, concurrencyGroups: current.concurrencyGroups!.filter(item => item.id !== group.id), profiles: current.profiles.map(profile => profile.concurrencyGroup === group.id ? { ...profile, concurrencyGroup: undefined } : profile) }))}>Remove group</Button>
            </div>)}
        </section>
        <section className="settings-section space-y-4" aria-labelledby="profiles-title">
            <div className="flex items-center justify-between gap-4"><h3 id="profiles-title" className="font-semibold text-white">Run profiles <Help label="About run profiles">Profiles describe how Cypress starts: base URL, extra arguments, and environment variables. Create profiles for the environments your project uses.</Help></h3><Button small disabled={busy} onClick={addProfile}>Add profile</Button></div>
            {draft.profiles.map(profile => <div key={profile.id} className="space-y-4 rounded-lg border border-white/10 p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3"><div><label htmlFor={`name-${profile.id}`} className="field-label">Profile name</label><input id={`name-${profile.id}`} disabled={busy} value={profile.name} onChange={event => updateProfile(profile.id, { name: event.target.value })} /></div><Button small kind="plain" disabled={busy || draft.profiles.length === 1} onClick={() => setDraft(current => ({ ...current, profiles: current.profiles.filter(item => item.id !== profile.id), defaultProfile: current.defaultProfile === profile.id ? current.profiles.find(item => item.id !== profile.id)!.id : current.defaultProfile }))}>Remove profile</Button></div>
                <div className="grid gap-4 md:grid-cols-2"><div><label htmlFor={`profile-limit-${profile.id}`} className="field-label">Maximum simultaneous runs</label><input id={`profile-limit-${profile.id}`} type="number" min={1} max={8} step={1} disabled={busy} value={profile.maxConcurrentRuns ?? 1} onChange={event => updateProfile(profile.id, { maxConcurrentRuns: Number(event.target.value) })} /></div>
                <div><label htmlFor={`profile-group-${profile.id}`} className="field-label">Shared environment group</label><select id={`profile-group-${profile.id}`} disabled={busy} value={profile.concurrencyGroup ?? ''} onChange={event => updateProfile(profile.id, { concurrencyGroup: event.target.value || undefined })}><option value="">No shared group</option>{draft.concurrencyGroups?.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div></div>
                <div><label htmlFor={`url-${profile.id}`} className="field-label">Base URL <span className="font-normal text-zinc-500">(optional)</span></label><input id={`url-${profile.id}`} disabled={busy} value={profile.baseUrl ?? ''} placeholder="https://app.example.test or ${BASE_URL}" onChange={event => updateProfile(profile.id, { baseUrl: event.target.value })} /><p className="field-description mt-2">Leave blank to use the URL from the Cypress configuration. References such as {'${BASE_URL}'} use local environment values.</p></div>
                <details className="rounded-lg bg-zinc-950/60 p-3"><summary className="cursor-pointer text-sm text-zinc-300">Advanced arguments and environment variables</summary><div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div><label htmlFor={`args-${profile.id}`} className="field-label">Extra Cypress arguments <Help label={`Argument help for ${profile.name}`}>Enter a JSON list of separate arguments. These are passed directly to Cypress without a shell. The runner controls the selected files and project.</Help></label><textarea id={`args-${profile.id}`} rows={5} disabled={busy} spellCheck={false} value={advanced[profile.id].args} onChange={event => setAdvanced(current => ({ ...current, [profile.id]: { ...current[profile.id], args: event.target.value } }))} /></div>
                    <div><label htmlFor={`env-${profile.id}`} className="field-label">Environment variables</label><textarea id={`env-${profile.id}`} rows={5} disabled={busy} spellCheck={false} value={advanced[profile.id].env} onChange={event => setAdvanced(current => ({ ...current, [profile.id]: { ...current[profile.id], env: event.target.value } }))} /><p className="field-description mt-2">JSON name/value pairs are shared configuration. Use references such as {'"API_TOKEN": "${LOCAL_API_TOKEN}"'} for secrets.</p></div>
                </div></details>
            </div>)}
            <div><label htmlFor="default-profile" className="field-label">Default profile for new users</label><select id="default-profile" disabled={busy} value={draft.defaultProfile} onChange={event => setDraft({ ...draft, defaultProfile: event.target.value })}>{draft.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>
        </section>
        <section className="settings-section space-y-4"><h3 className="font-semibold text-white">Spec discovery</h3><p className="field-description">The standard Cypress folder works by default. For a custom layout, enter patterns that match your Cypress configuration. One pattern per line; paths are relative to this project.</p>
            <div className="grid gap-4 lg:grid-cols-2"><div><label htmlFor="spec-patterns" className="field-label">Include patterns</label><textarea id="spec-patterns" rows={4} disabled={busy} value={patterns} onChange={event => setPatterns(event.target.value)} /></div><div><label htmlFor="exclude-patterns" className="field-label">Exclude patterns</label><textarea id="exclude-patterns" rows={4} disabled={busy} value={exclusions} onChange={event => setExclusions(event.target.value)} /></div></div>
        </section>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4"><p className="max-w-xl text-xs leading-5 text-zinc-400">Save writes shared project files. Commit the files listed in the save reminder to share your changes.</p><Button kind="primary" disabled={busy} onClick={() => void save()}>{saving ? 'Saving…' : project.initialized ? 'Save project settings' : 'Save and finish setup'}</Button></div>
        <section className="settings-section space-y-4"><h3 className="font-semibold text-white">Personal preferences <span className="ml-2 text-xs font-normal text-zinc-400">Saved locally</span></h3><p className="field-description">These apply immediately for this checkout and do not need committing.</p>
            <div><label htmlFor="preferred-browser" className="field-label">Preferred browser</label><select id="preferred-browser" value={browser} onChange={event => setBrowser(event.target.value as RunOptions['browser'])}>{availableBrowsers(project.config).map(value => <option key={value} value={value}>{value}</option>)}</select></div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Follow new output automatically</label>
        </section>
    </div>;
}
