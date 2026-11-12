import { useEffect, useRef, useState, type RefObject } from 'react';
import { findText } from '../shared/search';
import { Button } from './ui';

function textRanges(element: HTMLElement, starts: number[], length: number): Range[] {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), nodes: Text[] = [], ends: number[] = [];
    let total = 0, node: Node | null;
    while ((node = walker.nextNode())) { nodes.push(node as Text); total += node.textContent?.length ?? 0; ends.push(total); }
    if (!nodes.length) return [];
    function location(offset: number): [Text, number] {
        let low = 0, high = ends.length - 1;
        while (low < high) { const middle = Math.floor((low + high) / 2); if (ends[middle] <= offset) low = middle + 1; else high = middle; }
        return [nodes[low], offset - (low ? ends[low - 1] : 0)];
    }
    return starts.map(start => { const range = document.createRange(); range.setStart(...location(start)); range.setEnd(...location(start + length)); return range; });
}
export function OutputSearch({ output, text, runId, open, setOpen, pause, jump }: {
    output: RefObject<HTMLPreElement | null>; text: string; runId: string; open: boolean; setOpen: (open: boolean) => void; pause: () => void; jump: (range: Range) => void;
}) {
    const [query, setQuery] = useState(''), [info, setInfo] = useState({ count: 0, active: 0, more: false });
    const input = useRef<HTMLInputElement>(null), ranges = useRef<Range[]>([]), active = useRef(0), previous = useRef('');
    const callbacks = useRef({ pause, jump }); callbacks.current = { pause, jump };
    function highlight() {
        CSS.highlights.set('runner-find', new Highlight(...ranges.current));
        CSS.highlights.set('runner-find-current', new Highlight(...(ranges.current[active.current] ? [ranges.current[active.current]] : [])));
    }
    function navigate(delta: number) {
        if (!ranges.current.length) return;
        active.current = (active.current + delta + ranges.current.length) % ranges.current.length;
        highlight(); setInfo(current => ({ ...current, active: active.current })); callbacks.current.jump(ranges.current[active.current]);
    }
    function close() { setOpen(false); output.current?.focus(); }
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !document.querySelector('[role=dialog]')) {
                event.preventDefault(); callbacks.current.pause(); setOpen(true); input.current?.focus(); input.current?.select();
            }
        };
        window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
    }, [setOpen]);
    useEffect(() => { if (open) { callbacks.current.pause(); input.current?.focus(); input.current?.select(); } }, [open]);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!open || !output.current) return;
            const result = findText(output.current.textContent ?? '', query);
            ranges.current = textRanges(output.current, result.starts, query.length);
            const changed = previous.current !== `${runId}:${query}`;
            previous.current = `${runId}:${query}`;
            active.current = changed ? 0 : Math.min(active.current, Math.max(0, ranges.current.length - 1));
            highlight(); setInfo({ count: ranges.current.length, active: active.current, more: result.more });
            if (changed && ranges.current[0]) callbacks.current.jump(ranges.current[0]);
        }, 100);
        return () => { clearTimeout(timer); CSS.highlights.delete('runner-find'); CSS.highlights.delete('runner-find-current'); };
    }, [open, query, runId, text, output]);
    if (!open) return null;
    return <div className="shrink-0 space-y-2 border-b border-white/10 bg-zinc-900 p-3"><div className="flex flex-wrap items-center gap-2"><input ref={input} id="output-find" type="search" aria-label="Find in output" className="min-w-0 flex-1" style={{ width: 'auto' }} maxLength={200} placeholder="Find in visible output…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); navigate(event.shiftKey ? -1 : 1); } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }} /><span role="status" aria-label="Find matches" className="text-xs text-zinc-400">{query ? info.count ? `${info.active + 1} of ${info.count}${info.more ? '+' : ''}` : 'No matches' : 'Enter text'}</span><Button small aria-label="Previous match" disabled={!info.count} onClick={() => navigate(-1)}>↑</Button><Button small aria-label="Next match" disabled={!info.count} onClick={() => navigate(1)}>↓</Button><Button small aria-label="Close search" onClick={close}>×</Button></div><p className="text-xs text-zinc-500">Searches visible history; use the full log for older output. Enter/Shift+Enter moves between matches. Highlights show the first 1,000 matches.</p></div>;
}
