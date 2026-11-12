import { pendingRun } from '../shared/runs';
import type { RunBatch } from '../shared/types';
export interface CompletionNotice { batchId: string; title: string; body: string }
export class BatchNotifier {
    enabled = false;
    suspended = false;
    private pending = new Set<string>();
    private completed = new Set<string>();
    constructor(private readonly deliver: (notice: CompletionNotice) => void, private readonly failed: (error: unknown) => void = () => {}) {}
    observe(batch: RunBatch): void {
        if (batch.removed) { this.pending.delete(batch.id); this.completed.delete(batch.id); return; }
        const statuses = Object.values(batch.statuses);
        if (statuses.some(status => pendingRun({ status }))) { this.pending.add(batch.id); return; }
        if (!this.pending.delete(batch.id) || this.completed.has(batch.id)) return;
        this.completed.add(batch.id);
        if (!this.enabled || this.suspended || !statuses.some(status => status === 'passed' || status === 'failed')) return;
        const count = (status: string) => statuses.filter(value => value === status).length;
        const body = `${statuses.length} runs: ${count('passed')} passed, ${count('failed')} failed` + (count('stopped') ? `, ${count('stopped')} stopped` : '') + (count('cancelled') ? `, ${count('cancelled')} cancelled` : '');
        try { this.deliver({ batchId: batch.id, title: `${batch.name} finished`, body }); } catch (error) { this.failed(error); }
    }
}
