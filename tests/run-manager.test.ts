import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { defaults, saveConfig, loadProject, validateConfig, runArguments } from '../electron/project';
import { RunManager } from '../electron/run-manager';
import { pendingRun, maxOpenRuns } from '../shared/runs';
import type { ProjectConfig, RunOptions } from '../shared/types';

const options: RunOptions = { specs: ['cypress/e2e/features/Example.cy.ts'], profile: 'a', browser: 'chrome', headed: false };
async function until(check: () => boolean) {
    const limit = Date.now() + 10000;
    while (!check()) { if (Date.now() > limit) throw Error('Timed out waiting for queued runs.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
async function setup(t: TestContext, edit: (config: ProjectConfig) => void = () => {}) {
    let manager: RunManager;
    t.after(async () => { await manager?.stopAll(); });
    const root = await fixture(t);
    const config = await defaults(root);
    config.profiles = ['a', 'b', 'c'].map(id => ({ id, name: id.toUpperCase(), args: [], env: { EXAMPLE_PROFILE: id }, maxConcurrentRuns: 1 }));
    config.defaultProfile = 'a'; edit(config);
    await saveConfig(root, config, 'missing');
    await writeFile(path.join(root, 'node_modules/cypress/bin/cypress'), "console.log(JSON.stringify({profile:process.env.EXAMPLE_PROFILE,id:process.env.SPEC_RUNNER_RUN_ID,artifacts:process.env.SPEC_RUNNER_ARTIFACTS_DIR,args:process.argv.slice(2)}));setInterval(()=>{},1000);");
    manager = new RunManager(root, () => {});
    return { root, config, manager };
}
test('per-profile caps queue duplicate targets while another profile can use the free slot', async t => {
    const { manager } = await setup(t);
    const first = await manager.enqueue(options);
    const queued = await manager.enqueue(options);
    const other = await manager.enqueue({ ...options, profile: 'b' });
    assert.equal(manager.get(first.id).status, 'running');
    assert.equal(manager.get(queued.id).status, 'queued');
    assert.equal(manager.get(queued.id).waitReason, 'Waiting for A');
    assert.equal(manager.get(other.id).status, 'running');
    await manager.stop(first.id);
    await until(() => manager.get(queued.id).status === 'running');
    assert.equal(manager.get(first.id).status, 'stopped');
    assert.equal(manager.get(other.id).status, 'running');
});
test('shared environment caps count different profiles together without blocking unrelated systems', async t => {
    const { manager } = await setup(t, config => {
        config.concurrencyGroups = [{ id: 'shared', name: 'Shared staging', maxConcurrentRuns: 1 }];
        config.profiles[0].concurrencyGroup = 'shared'; config.profiles[1].concurrencyGroup = 'shared';
    });
    const first = await manager.enqueue(options);
    const shared = await manager.enqueue({ ...options, profile: 'b' });
    const other = await manager.enqueue({ ...options, profile: 'c' });
    assert.equal(shared.status, 'queued');
    assert.equal(shared.waitReason, 'Waiting for Shared staging');
    assert.equal(other.status, 'running');
    await manager.stop(first.id);
    await until(() => manager.get(shared.id).status === 'running');
    assert.equal(manager.get(other.id).status, 'running');
});
test('the overall cap reserves startup slots even when requests arrive concurrently', async t => {
    const { manager } = await setup(t, config => { config.maxConcurrentRuns = 1; });
    const jobs = await Promise.all(['a', 'b', 'c'].map(profile => manager.enqueue({ ...options, profile })));
    assert.equal(manager.list().filter(run => run.status === 'running').length, 1);
    assert.equal(manager.list().filter(run => run.status === 'queued').length, 2);
    const first = manager.list().find(run => run.status === 'running')!;
    await manager.stop(first.id);
    await until(() => manager.list().filter(run => run.status === 'running').length === 1);
    assert.equal(jobs.length, 3);
    assert.equal(manager.list().filter(run => run.status === 'queued').length, 1);
});
test('runs keep snapshots and independent output, logs and standard artifact directories', async t => {
    const { root, manager } = await setup(t, config => { config.profiles[0].maxConcurrentRuns = 2; });
    const first = await manager.enqueue(options);
    const second = await manager.enqueue({ ...options, profile: 'b', browser: 'electron' });
    await until(() => !!manager.get(first.id).output && !!manager.get(second.id).output);
    assert.notEqual(first.artifactDirectory, second.artifactDirectory);
    for (const job of [first, second]) {
        const output = JSON.parse(manager.get(job.id).output);
        assert.equal(output.id, job.id); assert.equal(output.artifacts, job.artifactDirectory);
        const index = output.args.indexOf('--config');
        const config = JSON.parse(output.args[index + 1]);
        for (const folder of ['screenshots', 'videos', 'downloads']) assert.equal(config[folder + 'Folder'], path.join(job.artifactDirectory, folder));
    }
    await manager.stop(first.id);
    assert.equal(manager.get(second.id).status, 'running');
    assert.equal(await readFile(manager.get(first.id).logPath!, 'utf8'), manager.get(first.id).output);
    const queued = await manager.enqueue({ ...options, profile: 'b' });
    const current = await loadProject(root);
    await saveConfig(root, { ...current.config, profiles: current.config.profiles.map(profile => ({ ...profile, name: 'Changed ' + profile.name, env: { EXAMPLE_PROFILE: 'changed' } })) }, current.configRevision);
    await manager.stop(second.id);
    await until(() => !!manager.get(queued.id).output);
    assert.equal(manager.get(queued.id).profileName, 'B');
    assert.equal(JSON.parse(manager.get(queued.id).output).profile, 'b');
    assert.equal(manager.get(queued.id).browser, 'chrome');
});
test('queued cancellation never spawns a process and completed tabs can close independently', async t => {
    const { manager } = await setup(t);
    const first = await manager.enqueue(options);
    const queued = await manager.enqueue(options);
    assert.throws(() => manager.close(first.id), /Stop or cancel/);
    await manager.stop(queued.id);
    assert.equal(manager.get(queued.id).status, 'cancelled');
    await assert.rejects(access(queued.artifactDirectory));
    manager.close(queued.id);
    assert.throws(() => manager.get(queued.id), /no longer exists/);
    assert.equal(manager.get(first.id).status, 'running');
    await assert.rejects(manager.stop('unknown'), /no longer exists/);
});
test('startup failure releases capacity for the next eligible job', async t => {
    const { manager } = await setup(t, config => {
        config.maxConcurrentRuns = 1; config.profiles[0].args = ['--env', 'value=${SPEC_RUNNER_MISSING_TEST_VALUE}'];
    });
    const failed = await manager.enqueue(options);
    const next = await manager.enqueue({ ...options, profile: 'b' });
    await until(() => manager.get(failed.id).status === 'failed' && manager.get(next.id).status === 'running');
    assert.match(manager.get(failed.id).output, /is missing/);
    assert.equal(manager.get(next.id).profileId, 'b');
});
test('shutdown cancels queued runs, stops every active process, and rejects an in-flight submission', async t => {
    const { manager } = await setup(t);
    await manager.enqueue(options); await manager.enqueue({ ...options, profile: 'b' }); await manager.enqueue(options);
    const preparing = manager.enqueue({ ...options, profile: 'c' });
    const rejected = assert.rejects(preparing, /stopping its runs/);
    await manager.stopAll(); await rejected;
    assert.equal(manager.active, false);
    assert.ok(manager.list().every(run => !pendingRun(run)));
    assert.equal(manager.list().filter(run => run.status === 'cancelled').length, 1);
});
test('retained tabs and queued submissions have a fixed memory bound until a completed tab is closed', async t => {
    const { manager } = await setup(t, config => { config.maxConcurrentRuns = 1; });
    const first = await manager.enqueue(options);
    for (let index = 1; index < maxOpenRuns; index++) await manager.enqueue(options);
    await assert.rejects(manager.enqueue(options), /Close completed run tabs/);
    await manager.stop(manager.list()[1].id); manager.close(manager.list()[1].id);
    await manager.enqueue(options);
    assert.equal(manager.list().length, maxOpenRuns);
    assert.equal(manager.get(first.id).status, 'running');
});
test('legacy configurations get conservative limits and invalid references or limits are rejected', async t => {
    const root = await fixture(t), config = await defaults(root);
    delete config.maxConcurrentRuns; delete config.concurrencyGroups;
    const normalized = validateConfig(config);
    assert.equal(normalized.maxConcurrentRuns, 2); assert.equal(normalized.profiles[0].maxConcurrentRuns, 1);
    for (const maxConcurrentRuns of [0, 9, 1.5, null, '2']) assert.throws(() => validateConfig({ ...config, maxConcurrentRuns }), /concurrency limit/);
    assert.throws(() => validateConfig({ ...config, concurrencyGroups: null }), /must be a list/);
    assert.throws(() => validateConfig({ ...config, profiles: [{ ...config.profiles[0], concurrencyGroup: 'unknown' }] }), /existing concurrency group/);
    const group = { id: 'shared', name: 'Shared', maxConcurrentRuns: 1 };
    assert.throws(() => validateConfig({ ...config, concurrencyGroups: [group, group] }), /unique IDs/);
    assert.throws(() => validateConfig({ ...config, profiles: [{ ...config.profiles[0], maxConcurrentRuns: 0 }] }), /Profile concurrency/);
});
test('artifact overrides preserve profile config options, JSON, glob braces and base URL references', async t => {
    const root = await fixture(t), config = await defaults(root);
    config.profiles[0].args = ['--config', 'video=false,specPattern=cypress/**/*.{ts,js}', '--config={"viewportWidth":1440}'];
    config.profiles[0].baseUrl = '${EXAMPLE_BASE}';
    const args = runArguments({ ...options, profile: 'default' }, config, { EXAMPLE_BASE: 'https://app.example.test' }, path.join(root, 'artifacts'));
    assert.equal(args.filter(arg => arg === '--config').length, 1);
    const values = JSON.parse(args[args.indexOf('--config') + 1]);
    assert.equal(values.video, false); assert.equal(values.viewportWidth, 1440);
    assert.equal(values.specPattern, 'cypress/**/*.{ts,js}'); assert.equal(values.baseUrl, 'https://app.example.test');
    assert.equal(values.downloadsFolder, path.join(root, 'artifacts/downloads'));
});
