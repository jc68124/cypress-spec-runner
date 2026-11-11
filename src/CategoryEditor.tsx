import { useState } from 'react';
import type { Category } from '../shared/types';
import { Button, Checkbox, Modal } from './ui';
export function CategoryEditor({ category, specs, existing, onClose, onSave }: { category: Category; specs: string[]; existing: boolean; onClose: () => void; onSave: (category: Category | null) => Promise<void> }) {
    const [name, setName] = useState(category.name);
    const [assigned, setAssigned] = useState(category.specs);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(false);
    const visible = [...new Set([...specs, ...category.specs])].sort().filter(spec => spec.toLowerCase().includes(search.toLowerCase()));
    async function save(remove = false) {
        setBusy(true); setError('');
        try { await onSave(remove ? null : { ...category, name: name.trim(), specs: assigned }); }
        catch (error) { setError(String((error as Error).message)); } finally { setBusy(false); }
    }
    return <Modal title={existing ? 'Edit category' : 'New category'} description="Categories are shared project configuration. Saving changes updates the category file in your repository." onClose={() => { if (!busy) onClose(); }} actions={<>
        {existing && <Button kind="danger" disabled={busy} onClick={() => { if (deleting) void save(true); else setDeleting(true); }}>{deleting ? 'Confirm delete' : 'Delete category'}</Button>}
        <Button kind="plain" disabled={busy} onClick={onClose}>Cancel</Button><Button kind="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save category'}</Button>
    </>}>
        <label className="field-label" htmlFor="category-name">Category name</label><input id="category-name" autoFocus value={name} maxLength={100} onChange={event => setName(event.target.value)} />
        <label className="field-label mt-4" htmlFor="category-search">Find specs to assign</label><input id="category-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by file or folder…" />
        <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400"><span>{assigned.length} assigned</span><div className="flex gap-2"><Button small onClick={() => setAssigned([...new Set([...assigned, ...visible.filter(spec => specs.includes(spec))])])}>Assign shown</Button><Button small kind="plain" onClick={() => setAssigned([])}>Clear assignments</Button></div></div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-white/10">{visible.map(spec => <label key={spec} className="spec-row"><Checkbox label={`Assign ${spec}`} checked={assigned.includes(spec)} onChange={checked => setAssigned(current => checked ? [...current, spec] : current.filter(value => value !== spec))} /><span className="break-all text-sm">{spec}{!specs.includes(spec) && <span className="ml-2 text-amber-300">Missing file</span>}</span></label>)}</div>
        <p className="mt-3 text-xs text-zinc-400">Commit the saved category file to share these changes with your team. Deleting a category keeps its spec files.</p>
        {deleting && <p className="mt-3 text-sm text-amber-300">Confirm to remove this category from the shared configuration.</p>}{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    </Modal>;
}
