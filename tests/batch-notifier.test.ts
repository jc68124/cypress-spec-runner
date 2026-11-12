import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BatchNotifier, type CompletionNotice } from '../electron/batch-notifier';
import type { RunBatch } from '../shared/types';
const batch = (statuses: RunBatch['statuses']): RunBatch => ({ id: 'batch', revision: 1, name: 'Cross-browser checks', createdAt: 1, profiles: [], browsers: [], specCount: 2, targets: [], statuses });
test('batch notifications default off, do not replay old results, and deliver one summary after all targets finish', () => {
    const notices: CompletionNotice[] = [], notifier = new BatchNotifier(notice => notices.push(notice));
    notifier.observe(batch({ a: 'running', b: 'queued' }));notifier.observe(batch({ a: 'passed', b: 'failed' }));
    assert.equal(notices.length, 0);
    notifier.enabled = true;notifier.observe(batch({ a: 'passed', b: 'failed' }));assert.equal(notices.length, 0);
    notifier.observe({ ...batch({ a: 'passed', b: 'failed' }), removed: true });
    notifier.observe(batch({ a: 'running', b: 'queued' }));notifier.observe(batch({ a: 'passed', b: 'running' }));assert.equal(notices.length, 0);
    notifier.observe(batch({ a: 'passed', b: 'failed' }));notifier.observe({ ...batch({ a: 'passed', b: 'failed' }), name: 'Renamed' });
    assert.equal(notices.length, 1);assert.match(notices[0].body, /1 passed, 1 failed/);
});
test('cancellation-only groups, shutdown and notification delivery errors do not disturb execution', () => {
    const notices: CompletionNotice[] = [], errors: unknown[] = [], notifier = new BatchNotifier(notice => notices.push(notice));notifier.enabled = true;
    notifier.observe(batch({ a: 'queued' }));notifier.observe(batch({ a: 'cancelled' }));assert.equal(notices.length, 0);
    notifier.observe({ ...batch({ a: 'running' }), id: 'shutdown' });notifier.suspended = true;notifier.observe({ ...batch({ a: 'passed' }), id: 'shutdown' });assert.equal(notices.length, 0);
    const failed = new BatchNotifier(() => { throw Error('OS unavailable'); }, error => errors.push(error));failed.enabled = true;
    failed.observe(batch({ a: 'running' }));assert.doesNotThrow(() => failed.observe(batch({ a: 'passed' })));assert.equal(errors.length, 1);
});
