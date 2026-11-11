import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlainText } from '../electron/run-log';

const terminal = '\x1b[31mFailure\x1b[0m\n\x1b]0;Window title\x07\x1b]8;;https://example.com\x1b\\Link\x1b]8;;\x1b\\\n日本語 🎲\n';

test('plain logs preserve text and Unicode while stripping split ANSI colours, titles and hyperlinks', () => {
    for (let split = 0; split <= terminal.length; split++) {
        const parser = new PlainText();
        assert.equal(parser.write(terminal.slice(0, split)) + parser.write(terminal.slice(split)), 'Failure\nLink\n日本語 🎲\n');
    }
    const parser = new PlainText();
    assert.equal([...terminal].map(char => parser.write(char)).join(''), 'Failure\nLink\n日本語 🎲\n');
});
