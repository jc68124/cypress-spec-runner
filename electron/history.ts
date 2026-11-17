import path from 'node:path';
import { realpath } from 'node:fs/promises';
import type { HistoryDetail, HistoryEntry, HistoryList, RunBatch, RunJob } from '../shared/types';
import { isRunResults } from '../shared/results';
import { readJsonFile, writeJsonFile } from './local-state';
const idValid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
export class RunHistory {
    private queue: Promise<void> = Promise.resolve();
    private signatures = new Map<string, { key: string; results: RunJob['results'] }>();
    private forgotten = new Set<string>();
    private observed = new Set<string>();
    private error: string | undefined;
    constructor(private readonly root: string) {}
    private get index() { return path.join(this.root, 'spec-runner-logs/history.json'); }
    private async entries(): Promise<HistoryEntry[]> {
        const value = await readJsonFile(this.index, [], this.root);
        if (!Array.isArray(value) || value.length > 100 || value.some(entry => !idValid(entry?.id) || typeof entry.name !== 'string' || !['groupName', 'profileId', 'profileName', 'browser', 'browserName'].every(key => typeof entry[key] === 'string') || !['passed', 'failed', 'stopped'].includes(entry.status) || !['createdAt', 'finishedAt', 'duration', 'specCount'].every(key => Number.isFinite(entry[key])) || (entry.counts && !['total','passed','failed','pending','skipped'].every(key => Number.isFinite(entry.counts[key]))))) throw Error('Recent run history is invalid. Rename spec-runner-logs/history.json to repair it; log files are retained.');
        return value;
    }
    observe(job: RunJob, batch?: RunBatch): void {
        if (job.removed) { this.signatures.delete(job.id); this.forgotten.delete(job.id); this.observed.delete(job.id); return; }
        if (!['passed', 'failed', 'stopped'].includes(job.status)) return;
        this.observed.add(job.id); if (this.forgotten.has(job.id)) return;
        const key = JSON.stringify([job.name, job.notes, batch?.name, job.status, job.finishedAt, job.logPath, job.logError, job.resultsError]);
        const previous = this.signatures.get(job.id);
        if (previous?.key === key && previous.results === job.results) return;
        const signature = { key, results: job.results };
        this.signatures.set(job.id, signature);
        const detail: HistoryDetail = { id: job.id, name: job.name, groupName: batch?.name ?? 'Run', profileId: job.profileId, profileName: job.profileName, browser: job.browser, browserName: job.browserName ?? job.browser, status: job.status as HistoryDetail['status'], createdAt: job.createdAt, finishedAt: job.finishedAt ?? Date.now(), duration: Math.max(0, (job.finishedAt ?? Date.now()) - (job.startedAt ?? job.createdAt)), specCount: job.specs.length, specs: job.specs, headed: job.headed, isolateArtifacts: job.isolateArtifacts !== false, notes: job.notes, logPath: job.logPath, logError: job.logError, results: job.results, resultsError: job.resultsError,
            ...(job.results ? { counts: { total: job.results.total, passed: job.results.passed, failed: job.results.failed, pending: job.results.pending, skipped: job.results.skipped } } : {}) };
        // Results, labels and paths only. No commands, profile environment values or raw output.
        this.queue = this.queue.then(async () => {
            if (this.forgotten.has(job.id)) return;
            await writeJsonFile(this.root, path.join(this.root, 'spec-runner-logs', job.id, 'run.json'), detail);
            const { specs: _specs, headed: _headed, isolateArtifacts: _isolate, notes: _notes, logPath: _log, logError: _logError, results: _results, resultsError: _error, ...entry } = detail;
            const entries = [entry, ...(await this.entries()).filter(item => item.id !== job.id)].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
            await writeJsonFile(this.root, this.index, entries); this.error = undefined;
        }).catch(error => { this.error = `Recent run history could not be saved: ${error.message}`; if (this.signatures.get(job.id) === signature) this.signatures.delete(job.id); });
    }
    async flush(): Promise<void> { await this.queue; }
    async list(): Promise<HistoryList> { await this.flush(); try { return { entries: await this.entries(), ...(this.error ? { error: this.error } : {}) }; } catch (error) { return { entries: [], error: (error as Error).message }; } }
    async detail(id: string): Promise<HistoryDetail> {
        await this.flush();
        if (!idValid(id) || !(await this.entries()).some(entry => entry.id === id)) throw Error('This run is no longer in recent history.');
        const directory = path.join(this.root, 'spec-runner-logs', id);
        const canonical = await realpath(directory); if (!canonical.startsWith(await realpath(this.root) + path.sep)) throw Error('Saved run is outside this checkout.');
        const detail = await readJsonFile(path.join(directory, 'run.json'), null, this.root) as HistoryDetail | null;
        if (!detail || detail.id !== id || !Array.isArray(detail.specs) || !detail.specs.every(spec => typeof spec === 'string') || (detail.results !== undefined && !isRunResults(detail.results)) || typeof detail.name !== 'string' || typeof detail.notes !== 'string') throw Error('Saved run details are missing or invalid.');
        if (detail.logPath && !path.resolve(detail.logPath).startsWith(path.resolve(directory) + path.sep)) throw Error('Saved log is outside this run folder.');
        return detail;
    }
    async forget(id?: string): Promise<void> {
        const action = this.queue.then(async () => {
            const current = id === undefined ? await this.entries().catch(() => []) : await this.entries();
            if (id === undefined) for (const key of this.observed) this.forgotten.add(key);
            for (const entry of current) if ((id === undefined || entry.id === id) && this.observed.has(entry.id)) this.forgotten.add(entry.id);
            const entries = id === undefined ? [] : current.filter(entry => entry.id !== id);
            await writeJsonFile(this.root, this.index, entries); this.error = undefined;
        });
        this.queue = action.catch(() => {}); await action;
    }
}
