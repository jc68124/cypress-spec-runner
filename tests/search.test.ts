import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findText } from '../shared/search';
test('output search is literal, case-insensitive and keeps original Unicode offsets', () => {
    assert.deepEqual(findText('A+B a+b aab', 'a+b'), { starts: [0,4], more: false });
    assert.deepEqual(findText('🎲 Äpfel äPFEL', 'äpfel').starts, [3,9]);
    assert.deepEqual(findText('anything', ''), { starts: [], more: false });
});
test('output search bounds highlight work without claiming an exact count beyond the limit', () => {
    const result = findText('match '.repeat(1001), 'match');
    assert.equal(result.starts.length, 1000); assert.equal(result.more, true);
    assert.equal(findText('match '.repeat(1000), 'match').more, false);
});
