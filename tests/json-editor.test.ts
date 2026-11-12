import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indentSelection, parseEditorJson } from '../shared/json-editor';
test('profile JSON is pretty-printed with four spaces and enforces array/object shapes', () => {
    assert.equal(parseEditorJson('["--config","video=false"]', 'args').formatted, '[\n    "--config",\n    "video=false"\n]');
    assert.deepEqual(parseEditorJson('{"API_TOKEN":"${LOCAL_TOKEN}"}', 'env').value, { API_TOKEN: '${LOCAL_TOKEN}' });
    assert.throws(() => parseEditorJson('{bad', 'env'), /Invalid JSON/);
    assert.throws(() => parseEditorJson('[true]', 'args'), /argument strings/);
    assert.throws(() => parseEditorJson('{"VALUE":123}', 'env'), /values are strings/);
});
test('tab indentation supports a caret, multiple selected lines, outdent and selection boundaries', () => {
    assert.deepEqual(indentSelection('[]', 1, 1, false), { value: '[    ]', start: 5, end: 5 });
    const original = '{\n    "a": "one",\n    "b": "two"\n}';
    const start = original.indexOf('    '), end = original.lastIndexOf('\n');
    const indented = indentSelection(original, start, end, false);
    assert.match(indented.value, /\n        "a"/); assert.match(indented.value, /\n        "b"/);
    const restored = indentSelection(indented.value, indented.start, indented.end, true);
    assert.equal(restored.value, original);
    assert.equal(indentSelection('    value', 2, 2, true).start, 0);
    assert.equal(indentSelection('a\nb\nc', 0, 2, false).value, '    a\nb\nc');
});
