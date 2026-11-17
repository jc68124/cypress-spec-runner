import type { ProgressSpec, RunProgress, RunResults } from './types';

export type ProgressEvent = { type: 'ready' | 'before:run' | 'before:spec' | 'after:spec' | 'after:run' | 'unavailable'; specs?: string[]; spec?: string; result?: Omit<ProgressSpec, 'state' | 'spec'>; message?: string };
const empty = { passed: 0, failed: 0, pending: 0, skipped: 0, duration: 0 };
const path = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '');
export class ProgressTracker {
    private allowed: Set<string>;
    private planned: string[];
    private visible: Set<string>;
    private finished = new Map<string, ProgressSpec>();
    private counts = { passed: 0, failed: 0, pending: 0, skipped: 0 };
    private phase: RunProgress['phase'] = 'starting';
    private currentSpec: string | undefined;
    private message: string | undefined;
    private finalCompleted: number | undefined;
    constructor(specs: string[]) { this.planned = [...new Set(specs)]; this.allowed = new Set(this.planned); this.visible = new Set(this.planned.slice(0, 500)); }
    apply(value: unknown): boolean {
        const event = value as ProgressEvent;
        if (!event || typeof event !== 'object') return false;
        if (event.type === 'unavailable') { this.phase = 'unavailable'; this.message = typeof event.message === 'string' ? event.message.slice(0, 1000) : 'Live progress is unavailable. Open Raw output for details.'; return true; }
        if (event.type === 'ready') return true;
        if (event.type === 'before:run') {
            if (!Array.isArray(event.specs) || event.specs.some(spec => typeof spec !== 'string')) return false;
            this.planned = [...new Set(event.specs.map(path).filter(spec => this.allowed.has(spec)))]; this.visible = new Set(this.planned.slice(0, 500)); this.phase = 'running'; return true;
        }
        if (event.type === 'after:run') { this.phase = 'finishing'; this.currentSpec = undefined; return true; }
        if (event.type !== 'before:spec' && event.type !== 'after:spec') return false;
        if (typeof event.spec !== 'string') return false;
        const spec = path(event.spec);
        if (!this.allowed.has(spec)) return false;
        if (event.type === 'before:spec') { this.currentSpec = spec; this.phase = 'running'; return true; }
        const raw = event.result;
        if (raw && ['passed', 'failed', 'pending', 'skipped', 'duration'].some(key => typeof raw[key as keyof typeof raw] !== 'number' || !Number.isFinite(raw[key as keyof typeof raw]) || (raw[key as keyof typeof raw] as number) < 0)) return false;
        const result: ProgressSpec = { ...empty, ...(raw ? { passed: raw.passed, failed: raw.failed, pending: raw.pending, skipped: raw.skipped, duration: raw.duration } : {}), spec, state: !raw ? 'unknown' : raw.failed || raw.error ? 'failed' : raw.passed ? 'passed' : 'skipped', ...(raw?.error && this.visible.has(spec) ? { error: String(raw.error).slice(0, 1000) } : {}) };
        const old = this.finished.get(spec);
        for (const key of ['passed', 'failed', 'pending', 'skipped'] as const) this.counts[key] += result[key] - (old?.[key] ?? 0);
        this.finished.set(spec, result); if (this.currentSpec === spec) this.currentSpec = undefined; return true;
    }
    complete(results: RunResults, completedSpecs?: number): void {
        this.phase = 'complete'; this.currentSpec = undefined;
        if (Number.isInteger(completedSpecs) && completedSpecs! >= 0) this.finalCompleted = Math.min(completedSpecs!, this.planned.length);
        for (const result of results.specs) if (this.allowed.has(result.spec)) this.finished.set(result.spec, { ...empty, spec: result.spec, state: result.failed || result.error ? 'failed' : result.passed ? 'passed' : 'skipped', passed: result.passed, failed: result.failed, pending: result.pending, skipped: result.skipped, duration: result.duration, error: result.error });
        for (const key of ['passed', 'failed', 'pending', 'skipped'] as const) this.counts[key] = results[key];
    }
    get state(): RunProgress {
        return { phase: this.phase, total: this.planned.length, completed: this.finalCompleted ?? this.finished.size, currentSpec: this.currentSpec, ...this.counts, message: this.message,
            specs: this.planned.slice(0, 500).map(spec => this.finished.get(spec) ?? { ...empty, spec, state: spec === this.currentSpec ? 'running' : 'waiting' }), ...(this.planned.length > 500 ? { truncated: true } : {}) };
    }
}
