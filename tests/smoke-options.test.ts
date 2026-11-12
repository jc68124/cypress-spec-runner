import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
const { archiveFilename, installArguments } = require(path.resolve(__dirname, '../../scripts/package-smoke.cjs'));

test('npm smoke installs use npm flags while pnpm smoke installs use pnpm flags', () => {
    const npm = '/tools/npm/bin/npm-cli.js';
    const pnpm = '/tools/pnpm/bin/pnpm.cjs';
    assert.deepEqual(installArguments(npm, 'npm/11 node/v24'), [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false']);
    assert.deepEqual(installArguments(pnpm, 'pnpm/11.25.0 npm/? node/v24'), [pnpm, 'install', '--ignore-scripts', '--no-lockfile', '--no-frozen-lockfile']);
});
test('Windows launcher paths work even when no package-manager user agent is supplied', () => {
    const pnpm = 'C:\\tools\\pnpm\\bin\\pnpm.cjs';
    const npm = 'C:\\tools\\node\\node_modules\\npm\\bin\\npm-cli.js';
    assert.ok(installArguments(pnpm).includes('--no-lockfile'));
    assert.ok(installArguments(npm).includes('--package-lock=false'));
    assert.throws(() => installArguments(undefined), /npm run smoke or pnpm run smoke/);
    assert.throws(() => installArguments('/tools/yarn.js', 'yarn/4'), /supports npm and pnpm/);
});
test('archive names follow npm conventions for both scoped and unscoped packages', () => {
    assert.equal(archiveFilename({ name: 'example-runner', version: '1.2.3' }), 'example-runner-1.2.3.tgz');
    assert.equal(archiveFilename({ name: '@example/runner', version: '1.2.3' }), 'example-runner-1.2.3.tgz');
});
