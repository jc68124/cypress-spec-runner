import type { RunResults, SpecResult } from './types';
export function normalizeResults(raw: any): RunResults | undefined {
    if (!raw || !Number.isInteger(raw.totalTests) || raw.totalTests < 0 || !['totalPassed', 'totalFailed', 'totalPending', 'totalSkipped'].every(key => Number.isInteger(raw[key]) && raw[key] >= 0) || !Array.isArray(raw.runs) || raw.runs.some((run: unknown) => !run || typeof run !== 'object')) return undefined;
    let budget = 1024 * 1024, testsLeft = 2000, artifactsLeft = 1000, truncated = raw.runs.length > 500;
    const text = (value: unknown, max = 1000): string => {
        if (typeof value !== 'string') return '';
        const cut = value.slice(0, Math.max(0, Math.min(max, budget)));
        budget -= Buffer.byteLength(cut);
        if (cut.length < value.length || budget < 0) truncated = true;
        return budget < 0 ? '' : cut;
    };
    const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    const specs: SpecResult[] = raw.runs.slice(0, 500).map((run: any) => {
        const tests = (Array.isArray(run.tests) ? run.tests.filter((test: unknown) => test && typeof test === 'object') : []).slice(0, testsLeft); testsLeft -= tests.length;
        if (tests.length < (run.tests?.length ?? 0)) truncated = true;
        const screenshots = (Array.isArray(run.screenshots) ? run.screenshots : []).slice(0, artifactsLeft); artifactsLeft -= screenshots.length;
        if (screenshots.length < (run.screenshots?.length ?? 0)) truncated = true;
        return { spec: text(run.spec?.relative ?? run.spec?.name), passed: count(run.stats?.passes), failed: count(run.stats?.failures), pending: count(run.stats?.pending), skipped: count(run.stats?.skipped), duration: count(run.stats?.wallClockDuration ?? run.stats?.duration),
            tests: tests.map((test: any) => ({ title: text(Array.isArray(test.title) ? test.title.join(' › ') : test.title), state: ['passed', 'failed', 'pending', 'skipped'].includes(test.state) ? test.state : 'unknown', duration: typeof test.duration === 'number' ? count(test.duration) : (Array.isArray(test.attempts) ? test.attempts : []).reduce((sum: number, attempt: any) => sum + count(attempt?.wallClockDuration ?? attempt?.duration), 0), attempts: Array.isArray(test.attempts) ? test.attempts.length : 0, ...(test.displayError ? { error: text(test.displayError, 2000) } : {}) })),
            screenshots: screenshots.map((image: any) => text(image?.path, 2000)).filter(Boolean), ...(run.video ? { video: text(run.video, 2000) } : {}), ...(run.error ? { error: text(run.error, 2000) } : {}) };
    });
    return { total: raw.totalTests, passed: raw.totalPassed, failed: raw.totalFailed, pending: raw.totalPending, skipped: raw.totalSkipped, duration: count(raw.totalDuration), specs, ...(truncated ? { truncated: true } : {}), ...(raw.runs.some((run: any) => run.error) || (typeof raw.failures === 'number' && raw.failures > 0) ? { error: text(raw.message, 2000) || 'One or more specs could not run. See the spec errors or full log.' } : {}) };
}
export function resultArtifacts(results?: RunResults): string[] { return results?.specs.flatMap(spec => [...spec.screenshots, ...(spec.video ? [spec.video] : [])]) ?? []; }
export function isRunResults(value: any): value is RunResults {
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const counts = (value: any) => value && ['passed', 'failed', 'pending', 'skipped', 'duration'].every(key => number(value[key]));
    return !!value && (value.error === undefined || typeof value.error === 'string') && number(value.total) && counts(value) && Array.isArray(value.specs) && value.specs.length <= 500 && value.specs.every((spec: any) =>
        counts(spec) && typeof spec.spec === 'string' && Array.isArray(spec.screenshots) && spec.screenshots.every((file: unknown) => typeof file === 'string') && (spec.video === undefined || typeof spec.video === 'string') && (spec.error === undefined || typeof spec.error === 'string') && Array.isArray(spec.tests) && spec.tests.every((test: any) => test && typeof test.title === 'string' && typeof test.state === 'string' && number(test.attempts) && number(test.duration) && (test.error === undefined || typeof test.error === 'string')));
}
