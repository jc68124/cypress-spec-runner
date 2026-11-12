import type { MatrixOptions, RunBatch, RunDetails, RunJob, RunOptions } from './types';
export const maxOpenRuns = 50;
export const maxOpenBatches = 50;
export function matrixRuns(input: MatrixOptions): RunOptions[] {
    if (!input || !Array.isArray(input.profiles) || !input.profiles.length || input.profiles.some(id => typeof id !== 'string')
        || !Array.isArray(input.browsers) || !input.browsers.length || input.browsers.some(browser => typeof browser !== 'string')
        || new Set(input.profiles).size !== input.profiles.length || new Set(input.browsers).size !== input.browsers.length) throw Error('Choose at least one profile and browser, without duplicates.');
    if (input.profiles.length * input.browsers.length > maxOpenRuns) throw Error(`A batch can contain at most ${maxOpenRuns} runs.`);
    return input.profiles.flatMap(profile => input.browsers.map(browser => ({ specs: input.specs, profile, browser, headed: input.headed })));
}
export function validateRunDetails(value: RunDetails): RunDetails {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 100 || /[\x00\r\n]/.test(value.name)
        || typeof value.notes !== 'string' || value.notes.length > 2000 || value.notes.includes('\x00')) throw Error('Use a run name of 1–100 characters and notes of up to 2,000 characters.');
    return { name: value.name.trim(), notes: value.notes };
}
export function mergeBatch(batches: RunBatch[], next: RunBatch): RunBatch[] {
    const current = batches.find(batch => batch.id === next.id);
    if (current && current.revision > next.revision) return batches;
    return current ? batches.map(batch => batch.id === next.id ? next : batch) : [...batches, next];
}
export function pendingRun(run: Pick<RunJob, 'status'>): boolean { return ['queued', 'running', 'stopping'].includes(run.status); }
export function mergeRun(runs: RunJob[], next: RunJob): RunJob[] {
    const current = runs.find(run => run.id === next.id);
    if (current && current.revision > next.revision) return runs;
    return current ? runs.map(run => run.id === next.id ? next : run) : [...runs, next];
}
