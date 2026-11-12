export function findText(text: string, query: string, limit = 1000): { starts: number[]; more: boolean } {
    if (!query) return { starts: [], more: false };
    const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    const starts: number[] = [];
    for (const match of text.matchAll(expression)) {
        if (starts.length === limit) return { starts, more: true };
        starts.push(match.index);
    }
    return { starts, more: false };
}
