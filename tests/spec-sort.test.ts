import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortSpecs } from '../shared/spec-sort';

test('alphabetical sorting uses file names across folders, natural numbers and path tie-breaks without changing the source', () => {
    const specs = ['z/Alpha 10.cy.ts', 'b/alpha 2.cy.ts', 'a/alpha 2.cy.ts', 'a/Zebra.cy.ts'];
    const original = [...specs];
    const expected = ['a/alpha 2.cy.ts', 'b/alpha 2.cy.ts', 'z/Alpha 10.cy.ts', 'a/Zebra.cy.ts'];
    assert.deepEqual(sortSpecs(specs, 'name-asc'), expected);
    assert.deepEqual(sortSpecs(specs, 'name-desc'), [...expected].reverse());
    assert.deepEqual(specs, original);
});

test('date sorts put unknown dates last in either direction and break matching dates alphabetically', () => {
    const specs = ['d/Unknown.cy.ts', 'c/Recent.cy.ts', 'b/Beta.cy.ts', 'a/Alpha.cy.ts', 'e/Unavailable.cy.ts'];
    const dates = { 'c/Recent.cy.ts': 3000, 'b/Beta.cy.ts': 1000, 'a/Alpha.cy.ts': 1000, 'e/Unavailable.cy.ts': 0 };
    assert.deepEqual(sortSpecs(specs, 'modified-desc', dates), ['c/Recent.cy.ts', 'a/Alpha.cy.ts', 'b/Beta.cy.ts', 'e/Unavailable.cy.ts', 'd/Unknown.cy.ts']);
    assert.deepEqual(sortSpecs(specs, 'modified-asc', dates), ['a/Alpha.cy.ts', 'b/Beta.cy.ts', 'c/Recent.cy.ts', 'e/Unavailable.cy.ts', 'd/Unknown.cy.ts']);
    assert.deepEqual(sortSpecs(specs, 'modified-desc'), ['a/Alpha.cy.ts', 'b/Beta.cy.ts', 'c/Recent.cy.ts', 'e/Unavailable.cy.ts', 'd/Unknown.cy.ts']);
});
