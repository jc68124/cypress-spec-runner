import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { defaults, saveConfig, loadProject } from '../electron/project';
import { RunManager } from '../electron/run-manager';

const specs = ['A', 'B', 'C', 'D'].map(name => `cypress/e2e/features/${name}.cy.ts`);
async function until(check: () => boolean) { const limit = Date.now() + 10000; while (!check()) { if (Date.now() > limit) throw Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 10)); } }
async function setup(t: TestContext, missingResults = false) {
    let manager: RunManager | undefined; t.after(() => manager?.stopAll() ?? Promise.resolve());
    const root = await fixture(t), config = await defaults(root);
    for (const spec of specs) await writeFile(path.join(root, spec), '');
    config.profiles = ['a', 'b'].map(id => ({ id, name: id, args: [], env: { EXAMPLE_PROFILE: id, ...(missingResults && id === 'b' ? { NO_RESULTS: 'true' } : {}) }, maxConcurrentRuns: 1 }));
    config.defaultProfile = 'a'; await saveConfig(root, config, 'missing');
    await writeFile(path.join(root, 'node_modules/cypress/package.json'), JSON.stringify({ name: 'cypress', version: '16.1.0', main: 'index.cjs' }));
    await writeFile(path.join(root, 'node_modules/cypress/index.cjs'), `exports.cli={parseRunArguments:async args=>({args})};exports.run=async options=>{if(process.env.NO_RESULTS)return {failures:1,message:'No completed results'};const args=options.args,specs=args[args.indexOf('--spec')+1].split(','),browser=args[args.indexOf('--browser')+1],profile=process.env.EXAMPLE_PROFILE,index=(profile==='a'?0:2)+(browser==='chrome'?0:1),failed=specs[index%specs.length];return {totalTests:specs.length,totalPassed:specs.length-1,totalFailed:1,totalPending:0,totalSkipped:0,totalDuration:1,runs:specs.map(spec=>({spec:{relative:spec},stats:{passes:spec===failed?0:1,failures:spec===failed?1:0,pending:0,skipped:0},tests:[]}))};};`);
    manager = new RunManager(root, () => {}); return { root, manager };
}
test('failed-spec matrix reruns preserve exact pairs and labels after closing rows, and validate missing files atomically', async t => {
    const { root, manager } = await setup(t);
    const initial = await manager.enqueueMatrix({ specs, profiles: ['a', 'b'], browsers: ['chrome', 'electron'], headed: false, isolateArtifacts: false });
    await until(() => !manager.active);
    const original = initial.runs.map(run => manager.get(run.id));
    manager.update(original[0].id, { name: 'Keep this name', notes: 'Keep these notes' }); manager.close(original[0].id);
    const repeated = await manager.rerunBatch(initial.batch.id, 'failed-specs');
    assert.equal(repeated.runs.length, 4);
    for (const run of repeated.runs) {
        const source = original.find(item => item.profileId === run.profileId && item.browser === run.browser)!;
        assert.deepEqual(run.specs, source.results!.failedSpecs); assert.equal(run.isolateArtifacts, false);
    }
    assert.equal(repeated.runs[0].name, 'Keep this name'); assert.equal(repeated.runs[0].notes, 'Keep these notes');
    await until(() => !manager.active);
    const single = await manager.rerun(original[1].id, 'failed-specs'); assert.equal(single.runs.length, 1); assert.deepEqual(single.runs[0].specs, original[1].results!.failedSpecs);
    await until(() => !manager.active);
    const count = manager.list().length, groups = manager.batches().length;
    await unlink(path.join(root, original[3].results!.failedSpecs![0]));
    await assert.rejects(manager.rerunBatch(initial.batch.id, 'failed-specs'), /no longer exists|configured patterns/);
    assert.equal(manager.list().length, count); assert.equal(manager.batches().length, groups);
});
test('split failed-spec reruns retain their own subsets instead of redistributing files across targets', async t => {
    const { manager } = await setup(t);
    const initial = await manager.enqueueMatrix({ specs, profiles: ['a', 'b'], browsers: ['chrome'], headed: true, executionMode: 'split' });
    await until(() => !manager.active);
    const original = initial.runs.map(run => manager.get(run.id));
    const retry = await manager.rerunBatch(initial.batch.id, 'failed-specs');
    assert.equal(retry.batch.executionMode, 'split'); assert.equal(retry.runs.length, 2);
    for (const run of retry.runs) { const source = original.find(item => item.profileId === run.profileId)!; assert.deepEqual(run.specs, source.results!.failedSpecs); assert.equal(run.headed, true); }
});
test('missing summaries prevent partial failed-spec submissions, while full failed-run reruns remain available', async t => {
    const { root, manager } = await setup(t, true);
    const initial = await manager.enqueueMatrix({ specs, profiles: ['a', 'b'], browsers: ['chrome'], headed: false });
    await until(() => !manager.active);
    const count = manager.list().length;
    assert.match(manager.batches().find(batch => batch.id === initial.batch.id)!.failedSpecsProblem!, /Completed test results/);
    await assert.rejects(manager.rerunBatch(initial.batch.id, 'failed-specs'), /Completed test results/);
    assert.equal(manager.list().length, count);
    const unknown = initial.runs.find(run => run.profileId === 'b')!;
    await assert.rejects(manager.rerun(unknown.id, 'failed-specs'), /Completed test results/);
    const project = await loadProject(root); assert.equal(project.config.defaultProfile, 'a');
    const all = await manager.rerunBatch(initial.batch.id, 'failed'); assert.equal(all.runs.length, 2); assert.ok(all.runs.every(run => run.specs.length === specs.length));
});
