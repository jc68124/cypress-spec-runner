import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlainText, readLogForClipboard, RunLog } from '../electron/run-log';
import { open } from 'node:fs/promises';
import { clipboardLogByteLimit } from '../shared/output';
import { fixture } from './helpers';

const terminal = '\x1b[31mFailure\x1b[0m\n\x1b]0;Window title\x07\x1b]8;;https://example.com\x1b\\Link\x1b]8;;\x1b\\\n日本語 🎲\n';

test('plain logs preserve text and Unicode while stripping split ANSI colours, titles and hyperlinks', () => {
    for (let split = 0; split <= terminal.length; split++) {
        const parser = new PlainText();
        assert.equal(parser.write(terminal.slice(0, split)) + parser.write(terminal.slice(split)), 'Failure\nLink\n日本語 🎲\n');
    }
    const parser = new PlainText();
    assert.equal([...terminal].map(char => parser.write(char)).join(''), 'Failure\nLink\n日本語 🎲\n');
});

test('live log snapshots flush complete plain text and oversized clipboard reads fail before loading the file', async t => {
    const root = await fixture(t);
    const log = await RunLog.create(root, 'default');
    log.write('\x1b[31m日本語\x1b[0m\n');
    await log.flush();
    assert.equal(await readLogForClipboard(log.path), '日本語\n');
    await log.finish();
    const file = await open(log.path, 'r+');
    await file.truncate(clipboardLogByteLimit + 1); await file.close();
    await assert.rejects(readLogForClipboard(log.path), /20 MiB clipboard limit/);
});
