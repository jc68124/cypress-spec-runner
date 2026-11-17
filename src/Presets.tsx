import { useState } from 'react';
import type { LocalState, MatrixOptions, Project, ProjectConfig, RunPreset } from '../shared/types';
import { browserName } from '../shared/types';
import { presetProblems } from '../shared/presets';
import { Button, Modal } from './ui';

type PresetItem = { preset: RunPreset; scope: 'local' | 'shared'; key: string };
export function Presets({ project, options, locked, apply, saveShared, saveLocal }: { project: Project; options: MatrixOptions; locked: boolean; apply: (options: MatrixOptions) => void; saveShared: (config: ProjectConfig) => Promise<void>; saveLocal: (state: LocalState) => Promise<void> }) {
    const [open, setOpen] = useState(false), [selected, setSelected] = useState(''), [editing, setEditing] = useState(''), [name, setName] = useState(''), [scope, setScope] = useState('local'), [replace, setReplace] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [search, setSearch] = useState(''), [scopeFilter, setScopeFilter] = useState('all'), [loaded, setLoaded] = useState(''), [deleting, setDeleting] = useState<PresetItem | null>(null);
    const presets: PresetItem[] = [...(project.local?.presets ?? []).map(preset => ({ preset, scope: 'local' as const, key: `local:${preset.id}` })), ...(project.config.presets ?? []).map(preset => ({ preset, scope: 'shared' as const, key: `shared:${preset.id}` }))];
    const existing = presets.find(item => item.key === editing), chosen = presets.find(item => item.key === selected);
    const problems = chosen ? presetProblems(chosen.preset, project.config, project.specs) : [];
    const visible = presets.filter(item => (scopeFilter === 'all' || item.scope === scopeFilter) && `${item.preset.name} ${item.preset.options.profiles.map(id => project.config.profiles.find(profile => profile.id === id)?.name ?? id).join(' ')} ${item.preset.options.browsers.map(id => browserName(project.config, id)).join(' ')}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.preset.name.localeCompare(b.preset.name, undefined, { numeric: true }) || a.key.localeCompare(b.key));
    function usePreset() {
        setError('');
        if (!chosen) return;
        if (problems.length) { setError(`Preset needs updating: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '…' : ''}`); return; }
        apply(structuredClone(chosen.preset.options)); setLoaded(chosen.preset.name);
    }
    async function persist(target: string, next: RunPreset[]) {
        if (target === 'shared') { if (locked) throw Error('Shared presets are locked while runs are active or queued.'); await saveShared({ ...project.config, presets: next }); }
        else await saveLocal({ revision: project.local?.revision ?? '', browserPaths: project.local?.browserPaths ?? {}, presets: next });
    }
    async function save() {
        setBusy(true); setError('');
        try {
            const target = existing?.scope ?? scope, preset = { id: existing?.preset.id ?? crypto.randomUUID(), name: name.trim(), options: structuredClone(existing && !replace ? existing.preset.options : options) };
            const current = target === 'shared' ? project.config.presets ?? [] : project.local?.presets ?? [];
            await persist(target, [...current.filter(item => item.id !== preset.id), preset]); setSelected(`${target}:${preset.id}`); setSearch(''); setScopeFilter('all'); setOpen(false); setEditing(''); setName(''); setLoaded('');
        } catch (error) { setError((error as Error).message); throw error; } finally { setBusy(false); }
    }
    async function remove() {
        if (!deleting) return;
        setBusy(true); setError('');
        try {
            const current = deleting.scope === 'shared' ? project.config.presets ?? [] : project.local?.presets ?? [];
            await persist(deleting.scope, current.filter(preset => preset.id !== deleting.preset.id));
            if (selected === deleting.key) setSelected('');
            setDeleting(null); setLoaded('');
        } catch (error) { setError((error as Error).message); throw error; } finally { setBusy(false); }
    }
    function edit(item?: PresetItem) { setEditing(item?.key ?? ''); setName(item?.preset.name ?? ''); setScope(item?.scope ?? 'local'); setReplace(!item); setError(''); setOpen(true); }
    const lockReason = 'Shared presets cannot be changed while runs are active or queued. Local presets remain editable.';
    return <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">Run presets</h2><p className="mt-2 text-sm text-zinc-400">Save selections and run targets for reuse. Loading a preset prepares your next run.</p></div><Button kind="primary" disabled={busy || !options.specs.length} title={!options.specs.length ? 'Select specs in Categories or Individual specs first' : 'Save the current selection and run configuration'} onClick={() => edit()}>New preset</Button></div>
        <div className="flex gap-3"><input id="preset-search" type="search" aria-label="Search presets" placeholder="Find a preset, profile or browser…" value={search} onChange={event => setSearch(event.target.value)} /><select id="preset-filter" aria-label="Filter preset scope" className="max-w-40" value={scopeFilter} onChange={event => setScopeFilter(event.target.value)}><option value="all">All presets</option><option value="local">This checkout</option><option value="shared">Shared</option></select></div>
        <div className="card max-h-[60vh] overflow-auto"><table aria-label="Run presets" className="w-full min-w-[38rem] text-left text-xs"><thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-400"><tr><th className="p-3">Preset</th><th className="p-3">Specs</th><th className="p-3">Targets</th><th className="p-3">Mode</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {visible.map(item => {
                const invalid = presetProblems(item.preset, project.config, project.specs), targets = item.preset.options;
                return <tr key={item.key} data-preset-key={item.key} className={`border-t border-white/10 ${selected === item.key ? 'bg-indigo-500/15' : 'hover:bg-white/5'}`}>
                    <td className="p-3"><label className="flex cursor-pointer items-start gap-3"><input type="radio" name="selected-preset" aria-label={`Select preset ${item.preset.name} (${item.scope})`} checked={selected === item.key} onChange={() => { setSelected(item.key); setError(''); setLoaded(''); }} /><span className="min-w-0"><span className="block max-w-64 break-words font-medium text-white">{item.preset.name}</span><span className="mt-1 block text-zinc-400">{item.scope === 'shared' ? 'Shared through Git' : 'This checkout'}</span>{!!invalid.length && <span className="mt-1 block text-amber-200">Needs updating</span>}</span></label></td>
                    <td className="p-3">{targets.specs.length}</td><td className="max-w-64 p-3"><span className="block break-words text-zinc-300">{targets.profiles.map(id => project.config.profiles.find(profile => profile.id === id)?.name ?? id).join(', ')}</span><span className="mt-1 block break-words text-zinc-400">{targets.browsers.map(id => browserName(project.config, id)).join(', ')} · {targets.headed ? 'headed' : 'headless'}</span></td><td className="p-3">{targets.executionMode === 'split' ? 'Split' : 'Repeat'}</td>
                    <td className="p-3"><div className="flex justify-end gap-1"><Button small title={item.scope === 'shared' && locked ? lockReason : `Edit ${item.preset.name}`} disabled={busy || (item.scope === 'shared' && locked)} onClick={() => edit(item)}>Edit</Button><Button small kind="plain" title={item.scope === 'shared' && locked ? lockReason : `Delete ${item.preset.name}`} disabled={busy || (item.scope === 'shared' && locked)} onClick={() => { setError(''); setDeleting(item); }}>Delete</Button></div></td>
                </tr>;
            })}
        </tbody></table>{!visible.length && <p className="p-6 text-sm text-zinc-400">{presets.length ? 'No matching presets.' : 'Choose specs and configure run targets, then save your first preset.'}</p>}</div>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-zinc-400">{visible.length} of {presets.length} presets · Loading never starts tests.</p><Button kind="primary" disabled={busy || !chosen} onClick={usePreset}>Load preset</Button></div>
        {chosen && <details className="rounded-lg border border-white/10 p-3 text-xs text-zinc-400"><summary className="cursor-pointer">Selected preset: {chosen.preset.name}</summary><p className="mt-2">{chosen.preset.options.isolateArtifacts === false ? 'Uses project artifact paths' : 'Separate artifact folders per run'}</p><ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">{chosen.preset.options.specs.map(spec => <li className="break-all" key={spec}>{spec}</li>)}</ul>{!!problems.length && <p className="mt-3 text-amber-200">{problems.slice(0, 5).join('; ')}</p>}</details>}
        {loaded && <p role="status" className="text-sm text-indigo-200">Loaded “{loaded}”. Review the next-run controls, then start when ready.</p>}
        {error && !open && !deleting && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {open && <Modal title={existing ? 'Edit preset' : 'New preset'} description="Save specs, profiles, browsers and run mode for reuse." onClose={() => { if (!busy) setOpen(false); }} actions={<><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button kind="primary" disabled={busy || !name.trim() || (replace && !options.specs.length) || ((existing?.scope ?? scope) === 'shared' && locked)} onClick={save}>{existing ? 'Save preset changes' : 'Save current selection'}</Button></>}>
            <div className="space-y-3"><label htmlFor="preset-name" className="field-label">Preset name</label><input id="preset-name" autoFocus maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} /><label htmlFor="preset-scope" className="field-label">Save to</label><select id="preset-scope" disabled={busy || !!existing} value={scope} onChange={event => setScope(event.target.value)}><option value="local">This checkout only</option><option value="shared">Project configuration (commit to Git)</option></select>{existing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} disabled={busy} onChange={event => setReplace(event.target.checked)} />Replace settings with the current selection</label>}<p className="text-xs leading-5 text-zinc-400">{replace ? `${options.specs.length} specs · ${options.profiles.length} profiles · ${options.browsers.length} browsers · ${options.executionMode ?? 'repeat'} mode` : 'Existing run settings will be retained.'}</p>{(existing?.scope ?? scope) === 'shared' && <p className="text-xs text-indigo-200">Commit spec-runner.config.json after saving to share this preset.</p>}{locked && <p className="text-xs text-zinc-400">{lockReason}</p>}</div>
            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        </Modal>}
        {deleting && <Modal title={`Delete “${deleting.preset.name}”?`} description="This removes the saved preset. Your current selection, saved runs and spec files stay available." onClose={() => { if (!busy) setDeleting(null); }} actions={<><Button disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button kind="danger" disabled={busy || (deleting.scope === 'shared' && locked)} onClick={remove}>Delete preset</Button></>}><p className="text-sm text-zinc-400">{deleting.scope === 'shared' ? 'Commit spec-runner.config.json after deleting to share the change.' : 'This preset is saved only in this checkout.'}</p>{error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}</Modal>}
    </div>;
}
