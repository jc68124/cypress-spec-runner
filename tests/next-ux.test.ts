import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { defaults, loadProject, saveConfig, validateConfig, validateRun, runArguments } from '../electron/project';
import { loadLocal, saveLocal, writeJsonFile } from '../electron/local-state';
import { validatePresets, presetProblems } from '../shared/presets';
import { normalizeResults } from '../shared/results';
import { Runner } from '../electron/runner';
import { RunManager } from '../electron/run-manager';
import { RunHistory } from '../electron/history';
import { randomUUID } from 'node:crypto';
import type { MatrixOptions, RunJob } from '../shared/types';
const spec = 'cypress/e2e/features/Example.cy.ts';
const plan: MatrixOptions = { specs: [spec], profiles: ['default'], browsers: ['electron'], headed: false, executionMode: 'split', isolateArtifacts: false };
async function until(check: () => boolean) { const until = Date.now() + 10000; while (!check()) { if (Date.now() > until) throw Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 10)); } }
const raw = { totalTests: 4, totalPassed: 1, totalFailed: 1, totalPending: 1, totalSkipped: 1, totalDuration: 1234, config: { env: { API_TOKEN: 'never-persist-this-value' } }, runs: [{ spec: { relative: spec }, stats: { passes: 1, failures: 1, pending: 1, skipped: 1, wallClockDuration: 1234 }, tests: [{ title: ['Checkout', 'retries then passes'], state: 'passed', attempts: [{ state: 'failed', wallClockDuration: 100 }, { state: 'passed', wallClockDuration: 50 }] }, { title: ['Checkout', 'fails'], state: 'failed', displayError: 'Expected confirmation', attempts: [{ state: 'failed', wallClockDuration: 200 }] }], screenshots: [{ path: '/example-project/failure.png' }], video: '/example-project/example.mp4' }] };
async function moduleFixture(root: string, value: unknown) {
    await writeFile(path.join(root, 'node_modules/cypress/package.json'), JSON.stringify({ name: 'cypress', version: '16.0.0', main: 'index.js', bin: { cypress: 'bin/cypress' } }));
    await writeFile(path.join(root, 'node_modules/cypress/index.js'), `exports.cli={parseRunArguments:async args=>{if(args[0]!=='cypress'||args[1]!=='run')throw Error('Invalid module arguments');return {args};}};exports.run=async options=>{if(options.project!==process.cwd())throw Error('Project root missing');setInterval(()=>{},1000);console.log(JSON.stringify(options.args));return ${JSON.stringify(value)};};`);
}
test('custom channels and local executable bindings validate and keep machine paths out of shared configuration', async t => {
    const root = await fixture(t), config = await defaults(root);
    config.customBrowsers = [{ id: 'beta', name: 'Chrome Beta', channel: 'chrome:beta' }, { id: 'portable', name: 'Portable Chromium' }]; config.browsers = ['beta', 'portable'];
    await saveConfig(root, config, 'missing');
    const beta = await validateRun(root, { specs: [spec], profile: 'default', browser: 'beta', headed: false });
    assert.equal(beta.browserTarget, 'chrome:beta'); assert.equal(runArguments(beta, config).at(-3), 'chrome:beta');
    await assert.rejects(validateRun(root, { ...beta, browser: 'portable' }), /Set a local executable path/);
    const executable = path.join(root, 'browser executable'); await writeFile(executable, 'fixture');
    const local = await loadLocal(root);
    const saved = await saveLocal(root, { ...local, browserPaths: { portable: executable } });
    assert.deepEqual(saved.changedFiles, ['.gitignore']); assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /\.spec-runner\/local.json/);
    const portable = await validateRun(root, { ...beta, browser: 'portable', browserTarget: '/ignored-spoof' });
    assert.equal(portable.browserTarget, executable); assert.equal((await loadProject(root)).local!.browserPaths.portable, executable);
    assert.ok(!(await readFile(path.join(root, 'spec-runner.config.json'), 'utf8')).includes(executable));
    await assert.rejects(saveLocal(root, local), /changed/);
    assert.throws(() => validateConfig({ ...config, customBrowsers: [{ id: 'chrome', name: 'Clash' }] }), /Custom browsers/);
    assert.throws(() => validateConfig({ ...config, customBrowsers: [{ id: 'bad', name: 'Bad', channel: '/absolute/path' }] }), /Custom browsers/);
});
test('presets retain exact options, reject unsafe paths, and flag stale targets without substituting them', async t => {
    const root = await fixture(t), config = await defaults(root), preset = { id: 'smoke', name: 'Smoke checks', options: plan };
    const valid = validatePresets([preset]); assert.deepEqual(valid[0].options, plan);
    assert.deepEqual(presetProblems(preset, config, [spec]), []);
    assert.equal(presetProblems({ ...preset, options: { ...plan, profiles: ['removed'], browsers: ['removed'], specs: ['removed.cy.ts'] } }, config, [spec]).length, 3);
    assert.throws(() => validatePresets([{ ...preset, options: { ...plan, specs: ['../outside.cy.ts'] } }]), /Invalid preset/);
    assert.throws(() => validatePresets([preset, preset]), /unique/);
    const coveragePresets = (['per-browser', 'per-profile'] as const).map(mode => ({
        id: mode, name: mode, options: { ...plan, executionMode: mode, splitRuns: mode === 'per-browser' ? 4 : 'per-spec' as const },
    }));
    const presets = [preset, ...coveragePresets];
    await saveConfig(root, { ...config, presets }, 'missing');
    assert.deepEqual((await loadProject(root)).config.presets, presets);
    await saveLocal(root, { ...await loadLocal(root), presets });
    assert.deepEqual((await loadLocal(root)).presets, presets);
});
test('structured results preserve final outcomes, retries and artifacts without storing Cypress configuration', () => {
    const summary = normalizeResults(raw)!;
    assert.deepEqual([summary.total, summary.passed, summary.failed, summary.pending, summary.skipped], [4, 1, 1, 1, 1]);
    assert.equal(normalizeResults({ ...raw, runs: [{...raw.runs[0],tests:[{...raw.runs[0].tests[0],duration:80}]}] })!.specs[0].tests[0].duration, 80);
    assert.equal(summary.specs[0].tests[0].attempts, 2); assert.equal(summary.specs[0].tests[0].duration, 150); assert.equal(summary.specs[0].screenshots[0], '/example-project/failure.png');
    assert.ok(!JSON.stringify(summary).includes('never-persist'));
    assert.equal(normalizeResults({ failures: 1, message: 'Could not start' }), undefined);
    const huge = normalizeResults({ ...raw, runs: Array.from({ length: 600 }, () => ({ ...raw.runs[0], tests: Array.from({ length: 10 }, () => ({ title: ['X'.repeat(10000)], state: 'failed', displayError: 'X'.repeat(10000), attempts: [] })) })) })!;
    assert.equal(huge.truncated, true); assert.equal(huge.failed, 1); assert.ok(Buffer.byteLength(JSON.stringify(huge)) < 5 * 1024 * 1024);
});
test('the Cypress module adapter preserves parsed arguments and returns accurate failures rather than interpreting exit codes', async t => {
    const runner = new Runner(() => {}); t.after(() => runner.stop());
    const root = await fixture(t);
    await moduleFixture(root, raw);
    const config = await defaults(root); config.profiles[0].args = ['--reporter', 'custom-reporter', '--reporter-options', 'setting=kept'];
    await runner.run(root, { specs: [spec], profile: 'default', browser: 'electron', headed: false }, config);
    await until(() => !runner.active);
    assert.equal(runner.state.status, 'failed'); assert.equal(runner.state.exitCode, 1); assert.equal(runner.state.results!.failed, 1);
    const args = JSON.parse(runner.state.output); assert.ok(args.includes('custom-reporter')); assert.ok(args.includes('setting=kept')); assert.ok(args.includes('--e2e'));
    await moduleFixture(root, { ...raw, totalFailed: 0, runs: [{ ...raw.runs[0], error: 'Spec could not compile' }] });
    await runner.run(root, { specs: [spec], profile: 'default', browser: 'electron', headed: false }, config); await until(() => !runner.active);
    assert.equal(runner.state.status, 'failed'); assert.equal(runner.state.results!.specs[0].error, 'Spec could not compile');
    await moduleFixture(root, { failures: 1, message: 'Configuration could not run' });
    await runner.run(root, { specs: [spec], profile: 'default', browser: 'electron', headed: false }, config); await until(() => !runner.active);
    assert.equal(runner.state.status, 'failed'); assert.equal(runner.state.results, undefined); assert.match(runner.state.resultsError!, /Configuration could not run/);
});
test('recent history survives reopening and closing groups, preserves results and excludes output, commands and environment values', async t => {
    let manager: RunManager | undefined;
    t.after(() => manager?.stopAll() ?? Promise.resolve());
    const root = await fixture(t), history = new RunHistory(root);
    await moduleFixture(root, raw);
    manager = new RunManager(root, job => history.observe(job, manager!.batches().find(batch => batch.id === job.batchId)));
    const job = await manager.enqueue({ specs: [spec], profile: 'default', browser: 'electron', headed: false });
    await until(() => !manager.active); await history.flush();
    manager.update(job.id, { name: 'Investigate checkout', notes: 'Saved note' }); await history.flush(); manager.close(job.id);
    assert.equal(manager.list().length, 0);
    const reopened = new RunHistory(root), entries = (await reopened.list()).entries;
    assert.equal(entries.length, 1); assert.equal(entries[0].name, 'Investigate checkout'); assert.equal(entries[0].counts!.failed, 1);
    const detail = await reopened.detail(job.id); assert.equal(detail.results!.specs[0].tests[0].attempts, 2); assert.equal(detail.notes, 'Saved note');
    const text = await readFile(path.join(root, 'spec-runner-logs', job.id, 'run.json'), 'utf8');
    assert.ok(!text.includes('never-persist')); assert.ok(!text.includes('"command"')); assert.ok(!text.includes('"output"'));
    await assert.rejects(reopened.detail('../outside'), /no longer/);
    await reopened.forget(job.id); assert.equal((await reopened.list()).entries.length, 0); await access(detail.logPath!);
});
test('local writes reject symlink escapes and history errors do not change a run outcome', async t => {
    if (process.platform === 'win32') { t.skip('Creating unprivileged symlinks is not guaranteed on Windows.'); return; }
    const root = await fixture(t), outside = await fixture(t); await symlink(outside, path.join(root, '.spec-runner'), 'dir');
    await assert.rejects(saveLocal(root, { ...await loadLocal(root), presets: [] }), /inside this checkout/);
    await assert.rejects(access(path.join(outside, 'local.json')));
    await assert.rejects(writeJsonFile(root, path.join(root, '.spec-runner', 'child/file.json'), {}), /inside this checkout/);
    await assert.rejects(access(path.join(outside, 'child')));
    const history = new RunHistory(root); await mkdir(path.join(root, 'spec-runner-logs'), { recursive: true }); await writeFile(path.join(root, 'spec-runner-logs/history.json'), 'invalid');
    assert.match((await history.list()).error!, /Unexpected|JSON/);
    await history.forget(); assert.equal((await history.list()).entries.length, 0);
});

test('queued custom-browser paths stay captured while reruns resolve the current local binding', async t => {
    // Hooks run in registration order. Stop children before fixture() removes
    // their working directory, which remains locked while they run on Windows.
    let manager: RunManager | undefined;
    t.after(() => manager?.stopAll() ?? Promise.resolve());
    const root = await fixture(t), config = await defaults(root);
    config.profiles[0].name = 'P'.repeat(100); config.customBrowsers = [{ id: 'portable', name: 'B'.repeat(100) }]; config.browsers = ['portable'];
    await saveConfig(root, config, 'missing');
    const firstPath = path.join(root, 'first browser'), nextPath = path.join(root, 'next browser');
    await writeFile(firstPath, ''); await writeFile(nextPath, '');
    await saveLocal(root, { ...await loadLocal(root), browserPaths: { portable: firstPath } });
    await writeFile(path.join(root, 'node_modules/cypress/bin/cypress'), "console.log(JSON.stringify(process.argv.slice(2)));setInterval(()=>{},1000);");
    manager = new RunManager(root, () => {});
    const options = { specs: [spec], profile: 'default', browser: 'portable', headed: false };
    const first = await manager.enqueue(options), queued = await manager.enqueue(options);
    assert.equal(first.name.length, 100); manager.update(first.id, { name: first.name, notes: '' });
    assert.equal(queued.status, 'queued');
    await saveLocal(root, { ...await loadLocal(root), browserPaths: { portable: nextPath } });
    await manager.stop(first.id); await until(() => !!manager.get(queued.id).output);
    assert.ok(JSON.parse(manager.get(queued.id).output).includes(firstPath));
    await manager.stop(queued.id);
    const repeated = await manager.rerun(queued.id); await until(() => !!manager.get(repeated.runs[0].id).output);
    assert.ok(JSON.parse(manager.get(repeated.runs[0].id).output).includes(nextPath));
});
test('history retains 100 summaries, tolerates save failures and clearing prevents open runs from reappearing on edits', async t => {
    let manager: RunManager | undefined;
    t.after(() => manager?.stopAll() ?? Promise.resolve());
    const root = await fixture(t), history = new RunHistory(root);
    await moduleFixture(root, { ...raw, totalFailed: 0, totalPassed: 2 });
    await mkdir(path.join(root, 'spec-runner-logs'), { recursive: true });
    await writeFile(path.join(root, 'spec-runner-logs/history.json'), 'invalid');
    manager = new RunManager(root, job => history.observe(job));
    const job = await manager.enqueue({ specs: [spec], profile: 'default', browser: 'electron', headed: false });
    await until(() => !manager.active); await history.flush();
    assert.equal(manager.get(job.id).status, 'passed'); assert.ok((await history.list()).error);
    await history.forget(); manager.update(job.id, { name: 'Renamed after clearing', notes: '' }); await history.flush();
    assert.equal((await history.list()).entries.length, 0); assert.equal((await history.list()).error, undefined);
    const base = manager.get(job.id);
    for (let index = 0; index < 105; index++) history.observe({ ...base, id: randomUUID(), createdAt: index, startedAt: index, finishedAt: index + 1, logPath: null });
    await history.flush(); const entries = (await new RunHistory(root).list()).entries;
    assert.equal(entries.length, 100); assert.equal(entries[0].createdAt, 104); assert.equal(entries.at(-1)!.createdAt, 5);
});
