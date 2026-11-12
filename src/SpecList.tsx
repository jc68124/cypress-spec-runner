import { Checkbox } from './ui';
export function SpecList({ specs, selected, onToggle }: { specs: string[]; selected: string[]; onToggle: (specs: string[], checked: boolean) => void }) {
    return <div className="spec-list">{specs.map(spec => <label key={spec} className="spec-row">
        <Checkbox label={`Select ${spec}`} checked={selected.includes(spec)} onChange={checked => onToggle([spec], checked)} />
        <span className="min-w-0"><span className="block truncate text-sm font-medium text-zinc-100">{spec.slice(spec.lastIndexOf('/') + 1)}</span><span title={spec} className="mt-1 block truncate text-xs text-zinc-400">{spec}</span></span>
    </label>)}{!specs.length && <p className="p-6 text-center text-sm text-zinc-400">No specs match this view.</p>}</div>;
}
