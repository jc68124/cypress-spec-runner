import type { Project } from '../shared/types';
type Snapshot = Pick<Project, 'specs' | 'specModifiedTimes' | 'discovery'>;
function fingerprint(project: Snapshot): string {
    return JSON.stringify({ files: [...project.specs].sort().map(spec => [spec, project.specModifiedTimes[spec]]), discovery: project.discovery });
}
// Poll metadata through the same discovery path as Refresh. No project code is executed.
// Stop scanning once dirty until the next successful project load resets the baseline.
export class SpecChanges {
    private baseline: string | undefined;
    private generation = 0;
    private checking = false;
    private changed = false;
    constructor(private readonly read: () => Promise<Snapshot>, private readonly publish: (changed: boolean) => void) {}
    accept(project: Snapshot): void {
        this.generation++; this.baseline = fingerprint(project);
        this.changed = false; this.publish(false);
    }
    async check(): Promise<void> {
        if (this.checking || this.changed || this.baseline === undefined) return;
        this.checking = true;
        const generation = this.generation;
        try {
            const current = await this.read();
            if (generation === this.generation && fingerprint(current) !== this.baseline) { this.changed = true; this.publish(true); }
        } catch {
            // An unreadable/deleted config or transient edit also needs attention at Refresh.
            if (generation === this.generation) { this.changed = true; this.publish(true); }
        } finally { this.checking = false; }
    }
    start(): () => void {
        const timer = setInterval(() => { void this.check(); }, 5000);
        timer.unref();
        return () => { clearInterval(timer); this.generation++; };
    }
}
