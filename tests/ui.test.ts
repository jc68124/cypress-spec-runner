import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';

test('desktop setup, settings, help, shared save reminders, selections and run controls work together', { timeout: 60000 }, async t => {
    const root = path.resolve(__dirname, '../..');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const electron = require('electron') as string;
    const child = spawn(electron, [
        ...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless'] : []),
        '--disable-gpu', path.join(root, 'tests/fixtures/ui-main.cjs'), root,
    ], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 0, output);
    assert.match(output, /1080p density passed/);
});
