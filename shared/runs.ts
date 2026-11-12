import type { RunJob } from './types';
export const maxOpenRuns = 50;
export function pendingRun(run: Pick<RunJob, 'status'>): boolean { return ['queued', 'running', 'stopping'].includes(run.status); }
export function mergeRun(runs: RunJob[], next: RunJob): RunJob[] {
    const current = runs.find(run => run.id === next.id);
    if (current && current.revision > next.revision) return runs;
    return current ? runs.map(run => run.id === next.id ? next : run) : [...runs, next];
}
