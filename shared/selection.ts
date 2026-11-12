export function toggleSpecs(selected: string[], paths: string[], checked: boolean): string[] {
    const next = new Set(selected);
    for (const path of paths) {
        if (checked) next.add(path);
        else next.delete(path);
    }
    return [...next].sort();
}

export function selectionState(selected: string[], paths: string[]): 'all' | 'some' | 'none' {
    const set = new Set(selected);
    const count = paths.filter(path => set.has(path)).length;
    return count === 0 ? 'none' : count === paths.length ? 'all' : 'some';
}
