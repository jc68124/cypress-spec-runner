import type { LiveSpecDetails, RunResults, SpecResult, TestResult } from './types';

export function failedSpecSelection(results: RunResults | undefined, originalSpecs: string[]): { specs: string[]; problem?: string } {
    if (!results) return { specs: [], problem: 'Completed test results are required to identify failed specs. Rerun the whole run instead.' };
    const complete = (results.failedSpecsComplete === true && Array.isArray(results.failedSpecs)) || (!results.truncated && results.failedSpecsComplete !== false);
    if (!complete) return { specs: [], problem: 'Failed-spec details are incomplete. Rerun the whole run instead.' };
    const paths = results.failedSpecs ?? results.specs.filter(spec => spec.failed > 0 || spec.error).map(spec => spec.spec);
    const selected = [...new Set(paths.map(spec => spec.replaceAll('\\', '/').replace(/^\.\//, '')))];
    if (selected.some(spec => !originalSpecs.includes(spec))) return { specs: [], problem: 'Failed specs could not be matched to the original selection. Rerun the whole run instead.' };
    if (!selected.length) return { specs: [], problem: results.failed || results.error ? 'Cypress did not identify specific failed files. Rerun the whole run instead.' : 'There are no failed specs to rerun.' };
    return { specs: originalSpecs.filter(spec => selected.includes(spec)) };
}
export function requireFailedSpecs(results: RunResults | undefined, originalSpecs: string[]): string[] {
    const selection = failedSpecSelection(results, originalSpecs);
    if (selection.problem) throw Error(selection.problem);
    return selection.specs;
}
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function normalizeTest(test: any, text: (value: unknown, max?: number) => string): TestResult {
    const title = Array.isArray(test.title) ? test.title.join(' › ') : test.title;
    const attempts = Array.isArray(test.attempts) ? test.attempts : [];
    return {
        title: text(title),
        state: ['passed', 'failed', 'pending', 'skipped'].includes(test.state) ? test.state : 'unknown',
        duration: typeof test.duration === 'number' ? count(test.duration) : attempts.reduce((sum: number, attempt: any) => sum + count(attempt?.wallClockDuration ?? attempt?.duration), 0),
        attempts: attempts.length,
        ...(test.displayError ? { error: text(test.displayError, 2000) } : {}),
    };
}

const liveTestLimit = 200;
const liveScreenshotLimit = 25;
const liveSpecBytes = 48 * 1024;

export function normalizeLiveSpecDetails(run: any): LiveSpecDetails | undefined {
    if (!Array.isArray(run.tests) && !Array.isArray(run.screenshots)) return undefined;
    const details: LiveSpecDetails = { tests: [], screenshots: [] };
    let remaining = liveSpecBytes - 128; // Leave room for JSON keys and truncation metadata.
    function fits(value: string | TestResult) {
        remaining -= Buffer.byteLength(JSON.stringify(value)) + 1;
        if (remaining >= 0) return true;
        details.truncated = true;
        return false;
    }
    function text(value: unknown, max = 1000) {
        if (typeof value !== 'string') return '';
        if (value.length > max) details.truncated = true;
        return value.slice(0, max);
    }

    const screenshots = Array.isArray(run.screenshots) ? run.screenshots : [];
    const tests = Array.isArray(run.tests) ? run.tests : [];
    if (screenshots.length > liveScreenshotLimit || tests.length > liveTestLimit) details.truncated = true;
    for (const entry of screenshots.slice(0, liveScreenshotLimit)) {
        const filename = entry?.path;
        if (typeof filename !== 'string' || !filename) continue;
        if (filename.length > 4096) { details.truncated = true; continue; }
        if (!fits(filename)) break;
        if (!details.screenshots.includes(filename)) details.screenshots.push(filename);
    }
    for (const entry of tests.slice(0, liveTestLimit)) {
        if (!entry || typeof entry !== 'object') continue;
        const test = normalizeTest(entry, text);
        if (!fits(test)) break;
        details.tests.push(test);
    }
    return details;
}

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isTestResult = (test: any): test is TestResult => test && typeof test.title === 'string' && typeof test.state === 'string' && number(test.attempts) && number(test.duration) && (test.error === undefined || typeof test.error === 'string');

export function isLiveSpecDetails(value: any): value is LiveSpecDetails {
    return !!value && Array.isArray(value.tests) && value.tests.length <= liveTestLimit && value.tests.every(isTestResult) &&
        Array.isArray(value.screenshots) && value.screenshots.length <= liveScreenshotLimit &&
        value.screenshots.every((file: unknown) => typeof file === 'string' && file.length <= 4096) &&
        (value.truncated === undefined || typeof value.truncated === 'boolean') &&
        Buffer.byteLength(JSON.stringify(value)) <= liveSpecBytes;
}

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
    const specs: SpecResult[] = raw.runs.slice(0, 500).map((run: any) => {
        const tests = (Array.isArray(run.tests) ? run.tests.filter((test: unknown) => test && typeof test === 'object') : []).slice(0, testsLeft); testsLeft -= tests.length;
        if (tests.length < (run.tests?.length ?? 0)) truncated = true;
        const screenshots = (Array.isArray(run.screenshots) ? run.screenshots : []).slice(0, artifactsLeft); artifactsLeft -= screenshots.length;
        if (screenshots.length < (run.screenshots?.length ?? 0)) truncated = true;
        return { spec: text(run.spec?.relative ?? run.spec?.name), passed: count(run.stats?.passes), failed: count(run.stats?.failures), pending: count(run.stats?.pending), skipped: count(run.stats?.skipped), duration: count(run.stats?.wallClockDuration ?? run.stats?.duration),
            tests: tests.map((test: any) => normalizeTest(test, text)),
            screenshots: screenshots.map((image: any) => text(image?.path, 2000)).filter(Boolean), ...(run.video ? { video: text(run.video, 2000) } : {}), ...(run.error ? { error: text(run.error, 2000) } : {}) };
    });
    const failures = raw.runs.filter((run: any) => run.error || count(run.stats?.failures) > 0);
    let failedPathsBudget = 256 * 1024;
    const failedSpecs = [...new Set<string>(failures.slice(0, 10000).map((run: any) => {
        const spec = typeof run.spec?.relative === 'string' ? run.spec.relative.replaceAll('\\', '/').replace(/^\.\//, '') : '';
        failedPathsBudget -= Buffer.byteLength(spec); return failedPathsBudget >= 0 ? spec : '';
    }))];
    const failedSpecsComplete = failures.length <= 10000 && failedSpecs.every(spec => spec.length > 0 && spec.length <= 4096) && raw.runs.every((run: any) => run.error || (Number.isInteger(run.stats?.failures) && run.stats.failures >= 0)) && failures.reduce((sum: number, run: any) => sum + count(run.stats?.failures), 0) >= raw.totalFailed;
    return { total: raw.totalTests, passed: raw.totalPassed, failed: raw.totalFailed, pending: raw.totalPending, skipped: raw.totalSkipped, duration: count(raw.totalDuration), specs, failedSpecs: failedSpecs.filter(spec => spec.length > 0 && spec.length <= 4096), failedSpecsComplete, ...(truncated ? { truncated: true } : {}), ...(raw.runs.some((run: any) => run.error) || (typeof raw.failures === 'number' && raw.failures > 0) ? { error: text(raw.message, 2000) || 'One or more specs could not run. See the spec errors or full log.' } : {}) };
}
export function resultArtifacts(results?: RunResults): string[] { return results?.specs.flatMap(spec => [...spec.screenshots, ...(spec.video ? [spec.video] : [])]) ?? []; }
export function isRunResults(value: any): value is RunResults {
    const counts = (value: any) => value && ['passed', 'failed', 'pending', 'skipped', 'duration'].every(key => number(value[key]));
    return !!value && (value.error === undefined || typeof value.error === 'string') && (value.failedSpecsComplete === undefined || typeof value.failedSpecsComplete === 'boolean') && (value.failedSpecs === undefined || (Array.isArray(value.failedSpecs) && value.failedSpecs.length <= 10000 && value.failedSpecs.every((spec: unknown) => typeof spec === 'string' && spec.length <= 4096))) && number(value.total) && counts(value) && Array.isArray(value.specs) && value.specs.length <= 500 && value.specs.every((spec: any) =>
        counts(spec) && typeof spec.spec === 'string' && Array.isArray(spec.screenshots) && spec.screenshots.every((file: unknown) => typeof file === 'string') && (spec.video === undefined || typeof spec.video === 'string') && (spec.error === undefined || typeof spec.error === 'string') && Array.isArray(spec.tests) && spec.tests.every(isTestResult));
}
