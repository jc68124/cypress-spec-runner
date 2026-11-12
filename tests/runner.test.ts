import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Runner } from '../electron/runner';
import { defaults, saveConfig } from '../electron/project';
import { fixture } from './helpers';
import { outputCharacterLimit } from '../shared/output';
import type { RunOptions } from '../shared/types';

const options: RunOptions = { specs: ['cypress/e2e/features/Example.cy.ts'], profile: 'default', browser: 'chrome', headed: false };
async function until(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 7000;
    while (!predicate()) { if (Date.now() > deadline) throw Error('Timed out waiting for the runner.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
test('runner uses the project Cypress CLI, custom environment and profile without leaking Electron Node mode', async t => {
    const root = await fixture(t);
    const config = await defaults(root);
    config.profiles[0].env = { EXAMPLE_SETTING: 'example-value' };
    await saveConfig(root, config, 'missing');
    const runner = new Runner(() => {});
    await runner.run(root, options);
    await until(() => !runner.active);
    assert.equal(runner.state.status, 'passed');
    const output = JSON.parse(runner.state.output);
    assert.equal(output.cwd, root);
    assert.equal(output.value, 'example-value');
    assert.equal(output.asNode, null);
    assert.ok(!output.args.includes('--expose'));
    assert.ok(!output.args.includes('--env'));
    assert.equal(await readFile(runner.state.logPath!, 'utf8'), runner.state.output);
});
test('large runs keep complete plain-text logs while visible history remains bounded, and each run has its own file', async t => {
    const root = await fixture(t);
    const cli = path.join(root, 'node_modules/cypress/bin/cypress');
    const text = 'output line\n'.repeat(100_000);
    await writeFile(cli, `process.stdout.write('\\x1b[31mEARLY FAILURE\\x1b[0m\\n' + ${JSON.stringify(text)} + 'FINAL LINE\\n');`);
    const runner = new Runner(() => {});
    await runner.run(root, options); await until(() => !runner.active);
    const first = runner.state;
    assert.equal(first.output.length, outputCharacterLimit);
    assert.equal(first.outputTruncated, true);
    assert.ok(first.outputStartLine > 0);
    assert.ok(!first.output.includes('EARLY FAILURE'));
    assert.equal(await runner.copyText(), 'EARLY FAILURE\n' + text + 'FINAL LINE\n');
    assert.equal(await readFile(first.logPath!, 'utf8'), 'EARLY FAILURE\n' + text + 'FINAL LINE\n');
    await writeFile(cli, "console.error('SECOND RUN'); process.exitCode=1;");
    await runner.run(root, options); await until(() => !runner.active);
    assert.equal(runner.state.status, 'failed');
    assert.equal(runner.state.outputTruncated, false);
    assert.notEqual(runner.state.logPath, first.logPath);
    assert.equal(await readFile(first.logPath!, 'utf8'), 'EARLY FAILURE\n' + text + 'FINAL LINE\n');
});
test('concurrent launches are blocked and stopping flushes the log and allows a later run', async t => {
    const root = await fixture(t);
    const cli = path.join(root, 'node_modules/cypress/bin/cypress');
    await writeFile(cli, "console.log('waiting'); setInterval(()=>{},1000);");
    const runner = new Runner(() => {});
    t.after(async () => { if (runner.active) await runner.stop(); });
    await runner.run(root, options);
    await assert.rejects(runner.run(root, options), /already active/);
    await until(() => runner.state.output.includes('waiting'));
    assert.equal(await runner.copyText(), 'waiting\n');
    await runner.stop();
    assert.equal(runner.active, false);
    assert.equal(runner.state.status, 'stopped');
    assert.equal(await readFile(runner.state.logPath!, 'utf8'), runner.state.output);
    await writeFile(cli, "console.log('next');");
    await runner.run(root, options); await until(() => !runner.active);
    assert.equal(runner.state.status, 'passed');
});
test('log errors do not strand a running process', async t => {
    const root = await fixture(t);
    await writeFile(path.join(root, 'node_modules/cypress/bin/cypress'), "console.log('waiting'); setInterval(()=>{},1000);");
    const runner = new Runner(() => {});
    t.after(async () => { if (runner.active) await runner.stop(); });
    await runner.run(root, options); await until(() => runner.state.output.includes('waiting'));
    const internal = runner as unknown as { log: { stream: import('node:fs').WriteStream } };
    internal.log.stream.destroy(new Error('Write failed'));
    await until(() => !!runner.state.logError);
    await runner.stop();
    assert.equal(runner.state.status, 'stopped');
    assert.match(runner.state.logError!, /Write failed/);
});
test('CLI initialization works from another working directory with --project and preserves files on repeat', async t => {
    const root = await fixture(t);
    const bin = path.resolve(__dirname, '../../bin/cypress-spec-runner.cjs');
    const execute = () => new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [bin, 'init', '--project', root], { cwd: path.dirname(root), stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
        child.once('error', reject); child.once('close', code => code === 0 ? resolve(output) : reject(Error(output)));
    });
    assert.match(await execute(), /Commit these files/);
    assert.match(await execute(), /already initialized/);
});

test('stopping while project configuration is loading waits for startup and then stops the child', async t => {
    const root = await fixture(t);
    await writeFile(path.join(root, 'node_modules/cypress/bin/cypress'), "console.log('waiting'); setInterval(()=>{},1000);");
    const runner = new Runner(() => {});
    t.after(async () => { if (runner.active) await runner.stop(); });
    const starting = runner.run(root, options);
    const stopping = runner.stop();
    await Promise.all([starting, stopping]);
    assert.equal(runner.active, false);
    assert.equal(runner.state.status, 'stopped');
    assert.ok(runner.state.logPath);
});
