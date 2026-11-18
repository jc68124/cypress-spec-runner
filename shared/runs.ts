import { availableBrowsers, type ExecutionMode, type MatrixOptions, type ProjectConfig, type RunBatch, type RunDetails, type RunJob, type RunOptions } from './types';
export const maxOpenRuns = 50;
export const maxOpenBatches = 50;
export const schedulingLockMessage = 'Run limits, environment group assignments and adding or removing profiles or groups are locked while runs are active or queued.';

export function schedulingChanged(previous: ProjectConfig, next: ProjectConfig): boolean {
    if ((previous.maxConcurrentRuns ?? 2) !== (next.maxConcurrentRuns ?? 2)) return true;
    const groups = new Map((previous.concurrencyGroups ?? []).map(group => [group.id, group.maxConcurrentRuns]));
    const nextGroups = next.concurrencyGroups ?? [];
    if (groups.size !== nextGroups.length || nextGroups.some(group => groups.get(group.id) !== group.maxConcurrentRuns)) return true;

    const profiles = new Map(previous.profiles.map(profile => [profile.id, profile]));
    return profiles.size !== next.profiles.length || next.profiles.some(profile => {
        const original = profiles.get(profile.id);
        return !original || (original.maxConcurrentRuns ?? 1) !== (profile.maxConcurrentRuns ?? 1) || original.concurrencyGroup !== profile.concurrencyGroup;
    });
}

export const executionModeLabels: Record<ExecutionMode, string> = {
    repeat: 'Repeat suite',
    split: 'Split specs',
    'per-browser': 'Full suite per browser',
    'per-profile': 'Full suite per profile',
};

export function isExecutionMode(value: unknown): value is ExecutionMode {
    return typeof value === 'string' && Object.hasOwn(executionModeLabels, value);
}

export function planCoverage(profileCount: number, browserCount: number, mode: ExecutionMode = 'repeat') {
    if (!profileCount || !browserCount) return { copies: 0, workers: 0 };
    switch (mode) {
        case 'split': return { copies: 1, workers: profileCount * browserCount };
        case 'per-browser': return { copies: browserCount, workers: profileCount };
        case 'per-profile': return { copies: profileCount, workers: browserCount };
        case 'repeat': return { copies: profileCount * browserCount, workers: 1 };
    }
}

export function plannedRunCount(specCount: number, profileCount: number, browserCount: number, mode?: ExecutionMode): number {
    const { copies, workers } = planCoverage(profileCount, browserCount, mode);
    return copies * Math.min(specCount, workers);
}
export function validateMatrixTargets(input: MatrixOptions, config: ProjectConfig): void {
    if (input.profiles.some(id => !config.profiles.some(profile => profile.id === id)) || input.browsers.some(browser => !availableBrowsers(config).includes(browser))) throw Error('Invalid profile or browser in the selected targets.');
}
export function matrixRuns(input: MatrixOptions): RunOptions[] {
    if (!input || !Array.isArray(input.profiles) || !input.profiles.length || input.profiles.some(id => typeof id !== 'string')
        || !Array.isArray(input.browsers) || !input.browsers.length || input.browsers.some(browser => typeof browser !== 'string')
        || new Set(input.profiles).size !== input.profiles.length || new Set(input.browsers).size !== input.browsers.length) throw Error('Choose at least one profile and browser, without duplicates.');
    if (input.executionMode !== undefined && !isExecutionMode(input.executionMode)) throw Error('Choose a supported spec distribution.');
    if (!Array.isArray(input.specs) || !input.specs.length || input.specs.some(spec => typeof spec !== 'string')) throw Error('Select at least one valid spec file.');
    if (input.profiles.length * input.browsers.length > maxOpenRuns) throw Error(`A batch can contain at most ${maxOpenRuns} targets.`);
    const specs = [...new Set(input.specs)].sort();
    const { profiles, browsers, headed, isolateArtifacts, executionMode = 'repeat' } = input;
    const byProfile = () => profiles.map(profile => browsers.map(browser => ({ profile, browser })));
    if (executionMode === 'repeat') {
        return byProfile().flat().map(target => ({ ...target, specs, headed, isolateArtifacts }));
    }

    // Browser-first order lets a short split use independent profile slots first.
    const byBrowser = () => browsers.map(browser => profiles.map(profile => ({ profile, browser })));
    const groups = executionMode === 'per-browser' ? byBrowser() :
        executionMode === 'per-profile' ? byProfile() : [byBrowser().flat()];
    let offset = 0;
    return groups.flatMap(workers => {
        const runs = Array.from({ length: Math.min(specs.length, workers.length) }, (_, index) => ({
            ...workers[(offset + index) % workers.length], specs: [] as string[], headed, isolateArtifacts,
        }));
        // Carry the remainder to the next group so the same worker does not always get the extra file.
        offset = (offset + specs.length) % workers.length;
        specs.forEach((spec, index) => runs[index % runs.length].specs.push(spec));
        return runs;
    });
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

export const runLabels: Record<RunJob['status'], string> = { idle: 'Ready', queued: 'Queued', running: 'Running', stopping: 'Stopping', passed: 'Passed', failed: 'Failed', stopped: 'Stopped', cancelled: 'Cancelled' };
