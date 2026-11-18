import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matrixRuns, plannedRunCount } from '../shared/runs';
import type { MatrixOptions } from '../shared/types';
const selection: MatrixOptions = { specs: Array.from({length: 7}, (_, index) => `${index}.cy.ts`), profiles: ['a', 'b'], browsers: ['chrome', 'electron'], headed: false };
test('repeat remains default while split covers each unique spec exactly once with balanced nonempty partitions', () => {
    const repeated = matrixRuns(selection);
    assert.equal(repeated.length, 4); assert.ok(repeated.every(run => run.specs.length === 7));
    const input = structuredClone({ ...selection, specs: [...selection.specs].reverse().concat('0.cy.ts'), executionMode: 'split' as const });
    const before = structuredClone(input), split = matrixRuns(input);
    assert.deepEqual(input, before);
    assert.deepEqual(split.flatMap(run => run.specs).sort(), selection.specs);
    assert.deepEqual(split.map(run => run.specs.length), [2, 2, 2, 1]);
    assert.deepEqual(split.map(run => [run.profile, run.browser]), [['a', 'chrome'], ['b', 'chrome'], ['a', 'electron'], ['b', 'electron']]);
    assert.deepEqual(matrixRuns({ ...input, specs: selection.specs }), split);
});
test('small split selections use independent profiles first and omit empty workers', () => {
    const split = matrixRuns({ ...selection, specs: selection.specs.slice(0, 2), executionMode: 'split', isolateArtifacts: false });
    assert.equal(split.length, 2); assert.deepEqual(split.map(run => run.profile), ['a', 'b']);
    assert.ok(split.every(run => run.specs.length === 1 && run.isolateArtifacts === false));
    assert.equal(plannedRunCount(2, 2, 2, 'split'), 2);
    assert.equal(plannedRunCount(2, 2, 2, 'repeat'), 4);
    assert.throws(() => matrixRuns({ ...selection, executionMode: 'other' as 'split' }), /supported spec distribution/);
    assert.throws(() => matrixRuns({ ...selection, specs: [], executionMode: 'split' }), /Select at least/);
});


test('coverage modes assign every spec once per required browser or profile', () => {
    const input = { ...selection, specs: [...selection.specs].reverse().concat(selection.specs[0]), isolateArtifacts: false };
    for (const [executionMode, axis, values] of [
        ['per-browser', 'browser', input.browsers],
        ['per-profile', 'profile', input.profiles],
    ] as const) {
        const runs = matrixRuns({ ...input, executionMode });
        assert.equal(runs.length, 4);
        assert.equal(runs.length, plannedRunCount(selection.specs.length, 2, 2, executionMode));
        assert.equal(new Set(runs.map(run => `${run.profile}:${run.browser}`)).size, runs.length);
        for (const value of values) {
            const workers = runs.filter(run => run[axis] === value);
            assert.deepEqual(workers.flatMap(run => run.specs).sort(), selection.specs);
            assert.deepEqual(workers.map(run => run.specs.length), [4, 3]);
        }
        assert.ok(runs.every(run => run.isolateArtifacts === false));
    }
});

test('short coverage plans skip empty pairs and rotate which target does the work', () => {
    const input = { ...selection, specs: selection.specs.slice(0, 1) };
    for (const executionMode of ['per-browser', 'per-profile'] as const) {
        const runs = matrixRuns({ ...input, executionMode });
        assert.deepEqual(runs.map(run => [run.profile, run.browser]), [['a', 'chrome'], ['b', 'electron']]);
        assert.deepEqual(runs.map(run => run.specs), [input.specs, input.specs]);
        assert.equal(plannedRunCount(1, 2, 2, executionMode), 2);
        assert.equal(plannedRunCount(0, 2, 2, executionMode), 0);
    }
    assert.equal(plannedRunCount(4, 3, 2, 'per-browser'), 6);
    assert.equal(plannedRunCount(1, 3, 2, 'per-profile'), 3);
});
