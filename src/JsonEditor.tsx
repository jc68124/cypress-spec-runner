import { useMemo, useRef, useState } from 'react';
import { indentSelection, parseEditorJson, type JsonKind } from '../shared/json-editor';
import { Button } from './ui';
export function JsonEditor({ id, name, kind, value, disabled, onChange }: { id: string; name: string; kind: JsonKind; value: string; disabled: boolean; onChange: (value: string) => void }) {
    const input = useRef<HTMLTextAreaElement>(null), leaveOnTab = useRef(false);
    const [touched, setTouched] = useState(false);
    const parsed = useMemo(() => { try { return { formatted: parseEditorJson(value, kind).formatted, error: '' }; } catch (error) { return { formatted: '', error: (error as Error).message }; } }, [value, kind]);
    const error = touched ? parsed.error : '';
    function format() {
        setTouched(true);
        try { const formatted = parseEditorJson(input.current?.value ?? value, kind).formatted; if (formatted !== value) onChange(formatted); } catch { /* Keep malformed text intact for repair. */ }
    }
    return <div className="space-y-2"><div className="flex items-center justify-between gap-3"><span className="text-xs text-zinc-500">{kind === 'args' ? 'JSON array' : 'JSON object'} · 4-space indentation</span><Button small aria-label={`Format ${name}`} disabled={disabled} onClick={format}>Format JSON</Button></div>
        <textarea ref={input} id={id} rows={6} wrap="off" disabled={disabled} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-invalid={!!error} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" value={value} onBlur={() => { leaveOnTab.current = false; format(); }} onChange={event => onChange(event.target.value)} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '.8rem', lineHeight: 1.6, tabSize: 4, ...(error ? { borderColor: '#f87171' } : {}) }} onKeyDown={event => {
            if (event.key === 'Escape') { leaveOnTab.current = true; event.stopPropagation(); return; }
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); event.stopPropagation(); format(); return; }
            if (event.key !== 'Tab') { leaveOnTab.current = false; return; }
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (leaveOnTab.current) { leaveOnTab.current = false; return; }
            event.preventDefault();
            const element = event.currentTarget, edited = indentSelection(value, element.selectionStart, element.selectionEnd, event.shiftKey);
            onChange(edited.value);
            requestAnimationFrame(() => { if (input.current?.value === edited.value) input.current.setSelectionRange(edited.start, edited.end); });
        }} />
        <p id={`${id}-hint`} className="text-xs leading-5 text-zinc-500">Formats on leaving the field and saving. Tab indents; Shift+Tab outdents. Escape then Tab moves focus. Ctrl/Cmd+Shift+F formats.</p>
        {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-300">{error}</p>}
    </div>;
}
