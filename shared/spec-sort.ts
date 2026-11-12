export const specSortOrders = ['name-asc', 'name-desc', 'modified-desc', 'modified-asc'] as const;
export type SpecSort = typeof specSortOrders[number];
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const filename = (spec: string) => spec.slice(spec.lastIndexOf('/') + 1);
const byName = (a: string, b: string) => collator.compare(filename(a), filename(b)) || collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

export function sortSpecs(specs: readonly string[], order: SpecSort, modifiedTimes: Record<string, number> = {}): string[] {
    return [...specs].sort((a, b) => {
        if (order === 'name-asc' || order === 'name-desc') return byName(a, b) * (order === 'name-desc' ? -1 : 1);
        const left = modifiedTimes[a], right = modifiedTimes[b];
        const hasLeft = Number.isFinite(left) && left > 0, hasRight = Number.isFinite(right) && right > 0;
        if (hasLeft !== hasRight) return hasLeft ? -1 : 1;
        return (hasLeft && hasRight ? (left - right) * (order === 'modified-desc' ? -1 : 1) : 0) || byName(a, b);
    });
}
