import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Project, ProjectConfig, RunOptions, RunState, SaveResult } from '../shared/types';
import { availableBrowsers } from '../shared/types';
import { outputCharacterLimit } from '../shared/output';
import { selectionState, toggleSpecs } from '../shared/selection';
import { rgb, terminalBackground, terminalForeground } from '../shared/contrast';
import { Button, Checkbox, Help, Modal } from './ui';
import { SpecList } from './SpecList';
import { CategoryEditor } from './CategoryEditor';
import { Settings } from './Settings';
import { AnsiOutput } from './AnsiOutput';
type View = 'categories' | 'specs' | 'output' | 'settings';
type Preferences = { selected: string[]; profile: string; browser: RunOptions['browser']; headed: boolean; follow: boolean };
const idle: RunState = { status: 'idle', output: '', command: '', exitCode: null, outputTruncated: false, outputStartLine: 0, logPath: null, logError: null };
const labels = { idle: 'Ready', running: 'Running', stopping: 'Stopping', passed: 'Passed', failed: 'Failed', stopped: 'Stopped' };
const initialPreferences: Preferences = { selected: [], profile: '', browser: 'chrome', headed: false, follow: true };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function readPreferences(root: string): Preferences {
    try { return { ...initialPreferences, ...JSON.parse(localStorage.getItem(`spec-runner:${root}`) ?? '{}') }; } catch { return initialPreferences; }
}
export function App() {
    const [project, setProject] = useState<Project | null>(null);
    const [view, setView] = useState<View>('categories');
    const [preferences, setPreferences] = useState(initialPreferences);
    const [run, setRun] = useState(idle);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [commitFiles, setCommitFiles] = useState<string[]>([]);
    const [categorySearch, setCategorySearch] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [viewing, setViewing] = useState<string | null>(null);
    const [reviewing, setReviewing] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const [preview, setPreview] = useState('');
    const [previewError, setPreviewError] = useState('');
    const [copied, setCopied] = useState(false);
    const output = useRef<HTMLPreElement>(null);
    const currentRoot = useRef<string | null>(null);
    const active = run.status === 'running' || run.status === 'stopping';
    function acceptProject(next: Project) {
        const first = currentRoot.current !== next.root;
        currentRoot.current = next.root;
        setPreferences(current => {
            const saved = first ? readPreferences(next.root) : current;
            return { selected: Array.isArray(saved.selected) ? saved.selected.filter(spec => next.specs.includes(spec)) : [],
                profile: next.config.profiles.some(profile => profile.id === saved.profile) ? saved.profile : next.config.defaultProfile,
                browser: availableBrowsers(next.config).includes(saved.browser) ? saved.browser : availableBrowsers(next.config)[0], headed: !!saved.headed, follow: saved.follow !== false };
        });
        setProject(next);
        if (first && !next.initialized) setView('settings');
    }
    function acceptSave(result: SaveResult) { acceptProject(result.project); setCommitFiles(current => [...new Set([...current, ...result.changedFiles])]); }
    useEffect(() => {
        let alive = true;
        if (!window.specRunner) { setError('Start the app using the spec-runner command in a Cypress project.'); setLoading(false); return; }
        const unsubscribe = window.specRunner.onRunState(state => { if (alive) setRun(state); });
        void Promise.all([window.specRunner.project(), window.specRunner.state()]).then(([next, state]) => {
            if (alive) { acceptProject(next); setRun(state); }
        }).catch(error => { if (alive) setError(message(error)); }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; unsubscribe(); };
    }, []);
    useEffect(() => { if (project) { try { localStorage.setItem(`spec-runner:${project.root}`, JSON.stringify(preferences)); } catch { /* Optional local preferences. */ } } }, [preferences, project?.root]);
    const selected = preferences.selected;
    const available = useMemo(() => new Set(project?.specs ?? []), [project?.specs]);
    const selectedSpecs = useMemo(() => selected.filter(spec => available.has(spec)), [selected, available]);
    const options = useMemo<RunOptions>(() => ({ specs: selectedSpecs, profile: preferences.profile, browser: preferences.browser, headed: preferences.headed }), [selectedSpecs, preferences.profile, preferences.browser, preferences.headed]);
    useEffect(() => {
        let alive = true;
        setPreview(''); setPreviewError(''); setCopied(false);
        if (!project || !selectedSpecs.length) return;
        const timer = setTimeout(() => { void window.specRunner.preview(options).then(value => { if (alive) setPreview(value); }).catch(error => { if (alive) setPreviewError(message(error)); }); }, 120);
        return () => { alive = false; clearTimeout(timer); };
    }, [options, project?.configRevision, project?.specs]);
    useEffect(() => { if (preferences.follow && output.current) output.current.scrollTop = output.current.scrollHeight; }, [run.output, view, preferences.follow]);
    function toggle(paths: string[], checked: boolean) { setPreferences(current => ({ ...current, selected: toggleSpecs(current.selected, paths, checked) })); }
    async function operation(action: () => Promise<void>) { setPending(true); setError(''); try { await action(); } catch (error) { setError(message(error)); } finally { setPending(false); } }
    async function saveSettings(config: ProjectConfig) {
        if (!project) return;
        let revision = project.configRevision;
        if (!project.initialized) { acceptSave(await window.specRunner.initialize(config)); return; }
        acceptSave(await window.specRunner.saveConfig(config, revision));
    }
    async function saveCategory(next: Category | null) {
        if (!project || !editing) return;
        const categories = project.categories.filter(category => category.id !== editing.id);
        if (next) categories.push(next);
        acceptSave(await window.specRunner.saveCategories(categories.sort((a, b) => a.name.localeCompare(b.name)), project.revision)); setEditing(null);
    }
    const assigned = new Set(project?.categories.flatMap(category => category.specs) ?? []);
    const uncategorised = project?.specs.filter(spec => !assigned.has(spec)) ?? [];
    const filteredCategory = project?.categories.find(category => category.id === filter);
    const candidates = filter === 'selected' ? selectedSpecs : filter === 'uncategorised' ? uncategorised : filteredCategory ? filteredCategory.specs.filter(spec => available.has(spec)) : project?.specs ?? [];
    const visibleSpecs = candidates.filter(spec => spec.toLowerCase().includes(search.toLowerCase()));
    const viewedCategory = project?.categories.find(category => category.id === viewing);
    const viewedSpecs = viewedCategory?.specs.filter(spec => available.has(spec)) ?? [];
    const viewedCount = viewedSpecs.filter(spec => selected.includes(spec)).length;
    const profileName = project?.config.profiles.find(profile => profile.id === preferences.profile)?.name;
    return <main className="flex h-screen flex-col overflow-hidden bg-zinc-950">
        <header className="flex shrink-0 items-center justify-between gap-5 border-b border-white/10 bg-zinc-900 px-7 py-5"><div className="min-w-0"><div className="text-xs font-semibold tracking-widest text-indigo-400 uppercase">Cypress Spec Runner</div><h1 className="mt-1 truncate text-xl font-semibold text-white">{project?.config.name ?? 'Open your Cypress project'}</h1><p className="mt-1 truncate text-xs text-zinc-500" title={project?.root}>{project?.root ?? 'Loading project…'}</p></div><Button disabled={!project || pending || active} onClick={() => void operation(async () => acceptProject(await window.specRunner.refresh()))}>Refresh specs</Button></header>
        {error && <div role="alert" className="flex shrink-0 justify-between gap-4 border-b border-red-400/20 bg-red-500/10 px-7 py-3 text-sm text-red-300"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
        {!!commitFiles.length && <div role="status" className="flex shrink-0 justify-between gap-4 border-b border-indigo-400/20 bg-indigo-500/10 px-7 py-3 text-sm text-indigo-200"><div><strong>Saved locally.</strong> Commit these files to share the changes with your team.<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">{commitFiles.map(file => <code key={file}>{file}</code>)}</div></div><button aria-label="Dismiss commit reminder" onClick={() => setCommitFiles([])}>×</button></div>}
        {loading ? <p className="p-8 text-sm text-zinc-400">Loading specs…</p> : !project ? <div className="m-8 max-w-2xl space-y-3"><h2 className="text-lg font-semibold">Start from a Cypress project</h2><p className="text-zinc-400">Install the package in your project and run <code>cypress-spec-runner init</code> to create shared configuration.</p></div> : <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">
            <section className="flex min-h-0 min-w-0 flex-col"><nav aria-label="Runner views" className="flex shrink-0 gap-6 border-b border-white/10 px-7">{([{ id: 'categories', name: 'Categories' }, { id: 'specs', name: 'Individual specs' }, { id: 'output', name: 'Run output' }, { id: 'settings', name: 'Settings' }] as const).map(tab => <button key={tab.id} aria-current={view === tab.id ? 'page' : undefined} onClick={() => setView(tab.id)} className={`border-b-2 py-4 text-sm font-medium ${view === tab.id ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-zinc-400 hover:text-white'}`}>{tab.name}</button>)}</nav>
                <div className="min-h-0 flex-1 overflow-y-auto p-7">
                    {view === 'categories' && <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Choose categories</h2><p className="mt-2 text-sm text-zinc-400">Choose groups, then use View specs to adjust individual choices.<Help label="About category selection">Overlapping categories count each file once. A mixed checkbox means some files are selected. Unticking a category also removes files shared with other categories.</Help></p></div><Button kind="primary" disabled={active || pending} onClick={() => setEditing({ id: crypto.randomUUID(), name: '', specs: [] })}>New category</Button></div>
                        <input type="search" aria-label="Search categories" placeholder="Find a category…" value={categorySearch} onChange={event => setCategorySearch(event.target.value)} /><div className="flex flex-wrap items-center gap-3"><Button small disabled={selectedSpecs.length === project.specs.length} onClick={() => toggle(project.specs, true)}>Select all</Button><Button small kind="plain" disabled={!selectedSpecs.length} onClick={() => toggle(selectedSpecs, false)}>Deselect all</Button><span className="text-xs text-zinc-500">All specs, including uncategorised</span></div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-start gap-3">{project.categories.filter(category => category.name.toLowerCase().includes(categorySearch.toLowerCase())).map(category => {
                            const paths = category.specs.filter(spec => available.has(spec)), state = selectionState(selectedSpecs, paths), count = paths.filter(spec => selected.includes(spec)).length;
                            return <article key={category.id} aria-label={`Category ${category.name}`} className={`card ${state !== 'none' ? 'border-indigo-400/50' : ''}`}><div className="flex gap-3 p-3"><Checkbox label={`Select category ${category.name}`} checked={state === 'all'} partial={state === 'some'} disabled={!paths.length} onChange={checked => toggle(paths, checked)} /><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-white">{category.name}</h3><p className="mt-1 text-xs text-zinc-400">{count} of {paths.length} selected{paths.length < category.specs.length ? ` · ${category.specs.length - paths.length} missing` : ''}</p></div></div><div className="flex flex-wrap gap-2 px-3 pb-3"><Button small onClick={() => setViewing(category.id)}>View specs<span className="sr-only"> in {category.name}</span></Button><Button small kind="plain" disabled={active || pending} onClick={() => setEditing(category)}>Edit category<span className="sr-only"> {category.name}</span></Button></div></article>;
                        })}</div>{!project.categories.length && <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">Create a category to group specs, or select files in Individual specs.</div>}{!!uncategorised.length && <Button small kind="plain" onClick={() => { setFilter('uncategorised'); setSearch(''); setView('specs'); }}>{uncategorised.length} uncategorised specs · Review and select</Button>}
                    </div>}
                    {view === 'specs' && <div className="space-y-5"><h2 className="text-xl font-semibold text-white">Individual specs</h2><p className="text-sm text-zinc-400">Fine-tune the same selection used by your categories.</p><div className="grid grid-cols-[minmax(0,1fr)_12rem] gap-3"><div><label htmlFor="spec-search" className="field-label">Search specs</label><input id="spec-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by file or folder…" /></div><div><label htmlFor="spec-filter" className="field-label">Filter specs</label><select id="spec-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All specs</option><option value="selected">Selected only</option><option value="uncategorised">Uncategorised</option>{project.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div><div className="card overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-3"><label className="flex items-center gap-3 text-sm"><Checkbox label="Select shown specs" checked={selectionState(selectedSpecs, visibleSpecs) === 'all'} partial={selectionState(selectedSpecs, visibleSpecs) === 'some'} disabled={!visibleSpecs.length} onChange={checked => toggle(visibleSpecs, checked)} />Select shown</label><span className="text-xs text-zinc-400">{visibleSpecs.length} shown</span></div><SpecList specs={visibleSpecs} selected={selectedSpecs} onToggle={toggle} /></div></div>}
                    {view === 'settings' && <Settings key={project.configRevision} project={project} disabled={active || pending} onSave={saveSettings} browser={preferences.browser} setBrowser={browser => setPreferences(current => ({ ...current, browser }))} follow={preferences.follow} setFollow={follow => setPreferences(current => ({ ...current, follow }))} />}
                    {view === 'output' && <section aria-label="Run output" className="card flex h-full min-h-80 flex-col overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-3"><h2 className="text-sm font-semibold text-white">Run output <span className="ml-2 text-zinc-400">{labels[run.status]}</span></h2><label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={preferences.follow} onChange={event => setPreferences(current => ({ ...current, follow: event.target.checked }))} />Follow output</label></div><pre ref={output} tabIndex={0} aria-label="Cypress terminal output" style={{ background: rgb(terminalBackground), color: rgb(terminalForeground) }} className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs/6 whitespace-pre-wrap">{run.output ? <AnsiOutput text={run.output} startLine={run.outputStartLine} /> : 'Cypress output appears here when you start a run.'}</pre><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-3"><div className="min-w-0 text-xs text-zinc-400"><p>{run.outputTruncated ? 'Showing the latest' : 'Showing all output, up to'} {outputCharacterLimit.toLocaleString('en-GB')} characters.<Help label="About output history">The full plain-text log is saved automatically. Visible history is limited to keep the interface responsive.</Help></p>{run.logPath && <p className="mt-1 break-all">Full log: {run.logPath}{active ? ' (saving…)' : ''}</p>}{run.logError && <p role="alert" className="mt-1 text-red-300">{run.logError}</p>}</div><Button small title="Open the automatically saved full log in your default application" disabled={active || pending || !run.logPath || !!run.logError} onClick={() => void operation(async () => { await window.specRunner.openLog(); })}>Open log</Button></div></section>}
                </div>
            </section>
            <aside aria-label="Run controls" className="space-y-5 overflow-y-auto border-l border-white/10 bg-zinc-900/50 p-6"><div><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-white">Next run</h2><p className="mt-2 text-3xl font-semibold text-white">{selectedSpecs.length}<span className="ml-2 text-xs font-normal text-zinc-400">of {project.specs.length} specs</span></p></div><Button small kind="plain" disabled={!selectedSpecs.length} onClick={() => toggle(selectedSpecs, false)}>Clear</Button></div><Button small className="mt-3" disabled={!selectedSpecs.length} onClick={() => setReviewing(true)}>Review selected</Button></div><p className="text-xs leading-5 text-zinc-400">Shared specs count once. Each selected file runs all its tests.</p>
                <div className="space-y-4 border-t border-white/10 pt-5"><div><label htmlFor="run-profile" className="field-label">Run profile <Help label="About the selected profile">Profiles supply project-specific URLs, arguments, and variables. Configure shared profiles on the Settings page.</Help></label><select id="run-profile" disabled={active || pending} value={preferences.profile} onChange={event => setPreferences(current => ({ ...current, profile: event.target.value }))}>{project.config.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div><div><label htmlFor="browser" className="field-label">Browser</label><select id="browser" disabled={active || pending} value={preferences.browser} onChange={event => setPreferences(current => ({ ...current, browser: event.target.value as RunOptions['browser'] }))}>{availableBrowsers(project.config).map(browser => <option key={browser} value={browser}>{browser}</option>)}</select></div><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={preferences.headed} disabled={active || pending} onChange={event => setPreferences(current => ({ ...current, headed: event.target.checked }))} />Show browser <Help label="About showing the browser">Runs Cypress with a visible browser window. Leave off for a headless run.</Help></label></div>
                <div className="space-y-3">{active ? <Button kind="danger" className="w-full" disabled={run.status === 'stopping' || pending} onClick={() => void operation(async () => { await window.specRunner.stop(); })}>{run.status === 'stopping' ? 'Stopping…' : 'Stop run'}</Button> : <Button kind="primary" className="w-full whitespace-normal" disabled={!preview || pending || !project.initialized} onClick={() => void operation(async () => { setView('output'); setRun(await window.specRunner.run(options)); })}>Run {selectedSpecs.length} {selectedSpecs.length === 1 ? 'spec' : 'specs'} · {profileName}</Button>}<Button className="w-full" disabled={!preview || pending} onClick={() => void operation(async () => { await window.specRunner.copy(preview); setCopied(true); })}>{copied ? 'Copied command' : 'Copy command'}</Button>{previewError && <p role="alert" className="text-xs text-red-300">{previewError}</p>}</div>
                <details className="rounded-lg border border-white/10 bg-zinc-950 p-3"><summary className="cursor-pointer text-xs text-zinc-400">Command preview</summary><code className="mt-3 block max-h-48 overflow-y-auto text-xs leading-6 break-all text-zinc-300">{preview || 'Select specs to build a command.'}</code><p className="mt-2 text-xs leading-5 text-zinc-500">Local environment references are resolved by this app when a run starts.</p></details><div role="status" className="border-t border-white/10 pt-4 text-sm text-zinc-300">{labels[run.status]}{run.exitCode !== null ? ` · exit ${run.exitCode}` : ''}</div>
            </aside>
        </div>}
        {viewedCategory && <Modal title={viewedCategory.name} description="Tick specs for your next run. Edit category changes shared assignments." onClose={() => setViewing(null)} actions={<><Button disabled={active} onClick={() => { setEditing(viewedCategory); setViewing(null); }}>Edit category</Button><Button kind="primary" onClick={() => setViewing(null)}>Done</Button></>}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-400">{viewedCount} of {viewedSpecs.length} selected</p><div className="flex gap-2"><Button small disabled={viewedCount === viewedSpecs.length} onClick={() => toggle(viewedSpecs, true)}>Select all</Button><Button small kind="plain" disabled={!viewedCount} onClick={() => toggle(viewedSpecs, false)}>Deselect all</Button></div></div><div className="max-h-96 overflow-y-auto rounded-lg border border-white/10"><SpecList specs={viewedSpecs} selected={selectedSpecs} onToggle={toggle} /></div></Modal>}
        {reviewing && <Modal title="Review selected specs" description="These files are included in your next run. Untick a file to remove it." onClose={() => setReviewing(false)} actions={<Button kind="primary" onClick={() => setReviewing(false)}>Done</Button>}><p className="mb-3 text-sm text-zinc-400">{selectedSpecs.length} specs selected</p>{selectedSpecs.length ? <div className="max-h-96 overflow-y-auto"><SpecList specs={selectedSpecs} selected={selectedSpecs} onToggle={toggle} /></div> : <p className="text-sm text-zinc-400">No specs selected. Choose categories or individual specs to build your run.</p>}</Modal>}
        {editing && project && <CategoryEditor key={editing.id} category={editing} specs={project.specs} existing={project.categories.some(category => category.id === editing.id)} onClose={() => setEditing(null)} onSave={saveCategory} />}
    </main>;
}
