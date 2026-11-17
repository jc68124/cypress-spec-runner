import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { fixture } from './helpers';
import { ProgressTracker, type ProgressEvent } from '../shared/progress';
import { normalizeResults, failedSpecSelection, requireFailedSpecs } from '../shared/results';
import { progressConfig } from '../electron/cypress-progress';
import { withProgress } from '../electron/cypress-progress-plugin';
import { Runner } from '../electron/runner';
import { defaults, discoverSpecs } from '../electron/project';

const spec = 'cypress/e2e/features/Example.cy.ts', other = 'cypress/e2e/features/Other.cy.ts';
const done = { passed: 1, failed: 0, pending: 0, skipped: 0, duration: 40 };
async function until(check: () => boolean) { const limit = Date.now() + 10000; while (!check()) { if (Date.now() > limit) throw Error('Timed out waiting for progress'); await new Promise(resolve => setTimeout(resolve, 10)); } }

test('progress tracks actual spec order, bounded rows, current work and idempotent totals without guessing test outcomes', () => {
    const tracker = new ProgressTracker([spec, other]);
    assert.equal(tracker.state.phase, 'starting');
    tracker.apply({ type: 'before:run', specs: [other, spec] });
    tracker.apply({ type: 'before:spec', spec: other.replaceAll('/', '\\') });
    assert.equal(tracker.state.currentSpec, other);
    tracker.apply({ type: 'after:spec', spec: other, result: done });
    tracker.apply({ type: 'after:spec', spec: other, result: done });
    assert.equal(tracker.state.completed, 1); assert.equal(tracker.state.passed, 1);
    assert.equal(tracker.apply({ type: 'after:spec', spec: '../outside', result: done }), false);
    assert.equal(tracker.apply({ type: 'after:spec', spec, result: { ...done, failed: -1 } }), false);
    tracker.apply({ type: 'after:spec', spec });
    assert.equal(tracker.state.specs[1].state, 'unknown');
    const many = new ProgressTracker(Array.from({ length: 1000 }, (_, index) => `${index}.cy.ts`));
    for (let index = 0; index < 1000; index++) many.apply({ type: 'after:spec', spec: `${index}.cy.ts`, result: done });
    assert.equal(many.state.specs.length, 500); assert.equal(many.state.completed, 1000); assert.equal(many.state.passed, 1000); assert.equal(many.state.truncated, true);
});

test('failed-spec selection includes compile errors, preserves original order, survives detail truncation and rejects incomplete or unowned paths', () => {
    const raw = { totalTests: 2, totalPassed: 1, totalFailed: 1, totalPending: 0, totalSkipped: 0, totalDuration: 1, runs: [{ spec: { relative: other }, stats: { failures: 1 } }, { spec: { relative: spec }, stats: { failures: 0 }, error: 'Compilation failed' }] };
    const result = normalizeResults(raw)!;
    assert.deepEqual(requireFailedSpecs(result, [spec, other]), [spec, other]);
    assert.match(failedSpecSelection({ ...result, failedSpecs: ['../outside'] }, [spec]).problem!, /original selection/);
    assert.match(failedSpecSelection({ ...result, failedSpecsComplete: false }, [spec, other]).problem!, /incomplete/);
    const many = normalizeResults({ ...raw, runs: Array.from({ length: 600 }, (_, index) => ({ spec: { relative: `${index}.cy.ts` }, stats: { failures: index === 599 ? 1 : 0 } })) })!;
    assert.equal(many.truncated, true); assert.deepEqual(requireFailedSpecs(many, Array.from({ length: 600 }, (_, index) => `${index}.cy.ts`)), ['599.cy.ts']);
    assert.match(failedSpecSelection({ ...many, failedSpecs: undefined, failedSpecsComplete: undefined }, ['599.cy.ts']).problem!, /incomplete/);
    assert.match(failedSpecSelection(undefined, [spec]).problem!, /Completed test results/);
});

test('progress wrapper loads CommonJS and ESM configs, preserves original hooks, async config, reporter options, tasks and hook errors', async t => {
    let close: (() => Promise<void>) | undefined;
    t.after(async () => { await close?.(); });
    const root = await fixture(t), events: ProgressEvent[] = [];
    const file = path.join(root, 'cypress.config.cjs');
    await writeFile(file, `module.exports={reporter:'custom-reporter',reporterOptions:{kept:true},e2e:{async setupNodeEvents(on,config){if(config.configFile!==${JSON.stringify(file)})throw Error('Original configFile lost');on('task',{example:()=>42});on('before:spec',async spec=>{await new Promise(r=>setTimeout(r,5));return spec.relative;});on('after:spec',()=>{throw Error('User hook failure');});config.env.KEPT='value';return config;}}};`);
    const directory = path.join(root, 'bridge'); await mkdir(directory);
    const bridge = await progressConfig(root, { configFile: file }, directory, event => events.push(event)); close = bridge.close;
    const endpoint = /"port":(\d+),"token":"([a-f0-9]+)"/.exec(await readFile(bridge.configFile, 'utf8'))!;
    const denied = await new Promise<number>(resolve => { const request = http.request({ host: '127.0.0.1', port: Number(endpoint[1]), method: 'POST', headers: { authorization: 'wrong-token' } }, response => { response.resume(); resolve(response.statusCode!); }); request.end(JSON.stringify({ type: 'after:run' })); });
    assert.equal(denied, 403); assert.equal(events.length, 0);
    const config = createRequire(path.join(root, 'package.json'))(bridge.configFile);
    assert.equal(config.reporter, 'custom-reporter'); assert.equal(config.reporterOptions.kept, true);
    const handlers = new Map<string, any>();
    const returned = await config.e2e.setupNodeEvents((event: string, handler: any) => handlers.set(event, handler), { configFile: bridge.configFile, env: {} });
    assert.equal(returned.configFile, bridge.configFile); assert.equal(returned.env.KEPT, 'value'); assert.equal(handlers.get('task').example(), 42);
    await handlers.get('before:run')({ specs: [{ relative: spec }] });
    assert.equal(await handlers.get('before:spec')({ relative: spec }), spec);
    await assert.rejects(handlers.get('after:spec')({ relative: spec }, { stats: { passes: 1 } }), /User hook failure/);
    assert.deepEqual(events.map(event => event.type), ['ready', 'before:run', 'before:spec', 'after:spec']);
    await close(); close = undefined;
    const esm = path.join(root, 'cypress.config.mjs'); await writeFile(esm, 'export default {reporter:"junit",e2e:{}}');
    const second = await progressConfig(root, { configFile: esm }, directory, () => {}); close = second.close;
    // Preserve native dynamic import in the CommonJS-compiled test.
    const loaded = await (new Function('url', 'return import(url)'))(pathToFileURL(second.configFile).href);
    assert.equal(loaded.default.reporter, 'junit'); assert.equal(typeof loaded.default.e2e.setupNodeEvents, 'function');
    assert.equal(await readFile(esm, 'utf8'), 'export default {reporter:"junit",e2e:{}}');
});

test('generated progress config files never enter discovery even with broad project overrides', async t => {
    const root = await fixture(t), directory = path.join(root, 'spec-runner-logs/run/.progress');
    await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, 'cypress.config.ts'), 'export default {};');
    const config = { ...await defaults(root), specPattern: ['**/*.ts'], excludeSpecPattern: [] };
    const specs = await discoverSpecs(root, config);
    assert.ok(specs.includes(spec)); assert.ok(!specs.some(file => file.startsWith('spec-runner-logs/')));
});

test('a missing progress connection does not fail an existing hook', async () => {
    const config = withProgress({ e2e: { setupNodeEvents(on: any) { on('before:spec', () => 'preserved'); } } }, { port: 1, token: 'unavailable' }, false);
    const handlers = new Map<string, any>();
    await config.e2e.setupNodeEvents((event: string, handler: any) => handlers.set(event, handler), {});
    assert.equal(await handlers.get('before:spec')({ relative: spec }), 'preserved');
});

test('runner receives progress before final results, preserves stdout and cleans its temporary config after completion', async t => {
    const runner = new Runner(() => {}); t.after(() => runner.stop());
    const root = await fixture(t);
    await writeFile(path.join(root, 'cypress.config.cjs'), 'module.exports={e2e:{}}');
    await writeFile(path.join(root, 'node_modules/cypress/package.json'), JSON.stringify({ name: 'cypress', version: '16.1.0', main: 'index.cjs' }));
    await writeFile(path.join(root, 'node_modules/cypress/index.cjs'), `exports.cli={parseRunArguments:async()=>({configFile:'cypress.config.cjs'})};exports.run=async options=>{const config=require(options.configFile),handlers={};await config.e2e.setupNodeEvents((name,fn)=>handlers[name]=fn,{env:{},configFile:options.configFile});const spec={relative:${JSON.stringify(spec)}};await handlers['before:run']({specs:[spec]});await handlers['before:spec'](spec);console.log('project reporter output');await handlers['after:spec'](spec,{stats:{passes:1,failures:0,pending:0,skipped:0,wallClockDuration:20}});await new Promise(r=>setTimeout(r,200));await handlers['after:run']({});return {totalTests:1,totalPassed:1,totalFailed:0,totalPending:0,totalSkipped:0,totalDuration:20,runs:[{spec,stats:{passes:1,failures:0,pending:0,skipped:0}}]};};`);
    const config = { ...await defaults(root), configFile: 'cypress.config.cjs' };
    await runner.run(root, { specs: [spec], browser: 'electron', profile: 'default', headed: false }, config);
    await until(() => runner.state.progress?.completed === 1);
    assert.equal(runner.active, true); assert.equal(runner.state.results, undefined); assert.equal(runner.state.progress!.passed, 1);
    await until(() => !runner.active);
    assert.equal(runner.state.status, 'passed'); assert.equal(runner.state.progress!.phase, 'complete'); assert.equal(runner.state.results!.passed, 1);
    assert.equal(await readFile(runner.state.logPath!, 'utf8'), 'project reporter output\n');
    assert.ok(!(await readdir(path.dirname(runner.state.logPath!))).some(name => name.startsWith('.progress-')));
});
