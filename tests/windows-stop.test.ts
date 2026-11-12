import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { stopWindowsProcess } from '../electron/windows-stop';

function child() { return Object.assign(new EventEmitter(), { pid: 123 }) as ChildProcess; }

test('taskkill 128 succeeds if Cypress closes just after taskkill returns', async () => {
    const process = child();
    const stop = stopWindowsProcess(process, async () => ({ code: 128, output: 'Process not found.' }), 100);
    setTimeout(() => process.emit('close', 0), 10);
    await stop;
    assert.equal(process.listenerCount('close'), 0);
});

test('taskkill 128 does not report success while Cypress is still active', async () => {
    const process = child();
    await assert.rejects(stopWindowsProcess(process, async () => ({ code: 128, output: 'Native Windows diagnostic' }), 20), /128: Native Windows diagnostic/);
    assert.equal(process.listenerCount('close'), 0);
});

test('closure during taskkill succeeds even if taskkill later returns an error', async () => {
    const process = child();
    await stopWindowsProcess(process, async () => { process.emit('close', 1); return { code: 128, output: '' }; }, 100);
    assert.equal(process.listenerCount('close'), 0);
});

test('successful taskkill still waits for closure, and a launch failure retains its diagnostic', async () => {
    const process = child();
    let closed = false;
    const stop = stopWindowsProcess(process, async () => ({ code: 0, output: '' }), 100);
    setTimeout(() => { closed = true; process.emit('close', 1); }, 10);
    await stop;
    assert.equal(closed, true);
    const active = child();
    await assert.rejects(stopWindowsProcess(active, async () => { throw new Error('Access denied'); }, 20), /Access denied/);
    assert.equal(active.listenerCount('close'), 0);
});
