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

// Preserve the current line's whitespace; indent JSON containers without formatting incomplete input.
export function insertNewline(value: string, start: number, end: number): { value: string; start: number; end: number } {
    const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    const before = value.slice(lineStart, start), after = value.slice(end);
    const indent = /^[ \t]*/.exec(before)![0];
    // Only structural brackets count, never braces inside a JSON string.
    let quoted = false, escaped = false;
    for (const char of value.slice(0, start)) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\' && quoted) { escaped = true; continue; }
        if (char === '"') quoted = !quoted;
    }
    const opener = !quoted && /[\[{]$/.test(before.trimEnd());
    const padding = indent + (opener ? '    ' : '');
    const closing = opener && /^([ \t]*)([\]}])/.exec(after);
    const paired = closing && ((before.trimEnd().endsWith('{') && closing[2] === '}') || (before.trimEnd().endsWith('[') && closing[2] === ']'));
    const inserted = '\n' + padding + (paired ? '\n' + indent : '');
    const rest = paired ? after.slice(closing![1].length) : after;
    const caret = start + 1 + padding.length;
    return { value: value.slice(0, start) + inserted + rest, start: caret, end: caret };
}
