export type JsonKind = 'args' | 'env';
export function parseEditorJson(text: string, kind: JsonKind): { value: unknown; formatted: string } {
    let value: unknown;
    try { value = JSON.parse(text); } catch (error) { throw Error(`Invalid JSON: ${(error as Error).message}`); }
    if (kind === 'args' && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) throw Error('Use a JSON array of argument strings.');
    if (kind === 'env' && (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item => typeof item !== 'string'))) throw Error('Use a JSON object whose values are strings.');
    return { value, formatted: JSON.stringify(value, null, 4) };
}
export function indentSelection(value: string, start: number, end: number, outdent: boolean): { value: string; start: number; end: number } {
    if (!outdent && start === end) return { value: value.slice(0, start) + '    ' + value.slice(end), start: start + 4, end: start + 4 };
    const first = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const edits: { from: number; to: number; text: string }[] = [];
    for (let position = first; position <= last;) {
        const prefix = outdent ? /^(?: {1,4}|\t)/.exec(value.slice(position))?.[0].length ?? 0 : 0;
        edits.push({ from: position, to: position + prefix, text: outdent ? '' : '    ' });
        const next = value.indexOf('\n', position); if (next < 0) break; position = next + 1;
    }
    let result = '', cursor = 0;
    for (const edit of edits) { result += value.slice(cursor, edit.from) + edit.text; cursor = edit.to; }
    result += value.slice(cursor);
    function mapped(position: number): number {
        let delta = 0;
        for (const edit of edits) {
            if (position < edit.from) break;
            if (position < edit.to) return edit.from + delta + edit.text.length;
            delta += edit.text.length - (edit.to - edit.from);
        }
        return position + delta;
    }
    return { value: result, start: mapped(start), end: mapped(end) };
}
