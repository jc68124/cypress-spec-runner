import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration } from '../shared/duration';

test('durations keep useful short-run precision and carry rounded seconds into minutes and hours', () => {
    const cases: [number, string][] = [[0, '0s'], [1, '<0.1s'], [100, '0.1s'], [1250, '1.3s'], [10000, '10s'], [59900, '59.9s'], [59950, '1m'], [60000, '1m'], [61000, '1m 1s'], [119999, '2m'], [120000, '2m'], [125000, '2m 5s'], [3599999, '1h'], [3600000, '1h'], [3725000, '1h 2m 5s'], [86400000, '24h'], [-1, '0s'], [NaN, '0s'], [Infinity, '0s']];
    for (const [milliseconds, expected] of cases) assert.equal(formatDuration(milliseconds), expected, String(milliseconds));
});
