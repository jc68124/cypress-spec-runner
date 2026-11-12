import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { isAppDocumentUrl } from '../electron/app-url';

test('the app document is recognized using canonical paths and equivalent file-URL encodings', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'app-url-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const document = path.join(root, 'index with space.html');
    await writeFile(document, 'application');
    const canonical = await realpath(document);
    const url = pathToFileURL(document).href;
    assert.equal(isAppDocumentUrl(url, canonical), true);
    assert.equal(isAppDocumentUrl(pathToFileURL(canonical).href, document), true);
    assert.equal(isAppDocumentUrl(url.replace(/%20/g, ' '), document), true);
    assert.equal(isAppDocumentUrl(url.toUpperCase(), document), process.platform === 'win32');
});

test('a directory alias can refer to the same app document without trusting other documents', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'app-alias-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const actual = path.join(root, 'actual');
    const alias = path.join(root, 'alias');
    await mkdir(actual);
    await writeFile(path.join(actual, 'index.html'), 'application');
    await writeFile(path.join(actual, 'other.html'), 'other');
    await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(isAppDocumentUrl(pathToFileURL(path.join(alias, 'index.html')).href, path.join(actual, 'index.html')), true);
    assert.equal(isAppDocumentUrl(pathToFileURL(path.join(alias, 'other.html')).href, path.join(actual, 'index.html')), false);
});

test('external, malformed, modified and missing document URLs are rejected', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'app-reject-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const document = path.join(root, 'index.html');
    await writeFile(document, 'application');
    const url = pathToFileURL(document).href;
    for (const candidate of [undefined, '', 'invalid', 'about:blank', 'https://example.test/index.html', 'file://example.test/index.html', url + '?other=1', url + '#other', url + '%00', pathToFileURL(path.join(root, 'missing.html')).href]) {
        assert.equal(isAppDocumentUrl(candidate, document), false, candidate);
    }
});
