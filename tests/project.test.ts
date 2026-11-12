import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, utimes } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { configPath, categoryPath, defaults, discoverSpecs, findProject, initializeProject, loadProject, saveCategories, saveConfig, validateConfig, validateRun, runArguments, commandPreview } from '../electron/project';
import { runEnvironment } from '../electron/environment';

import { fixture } from './helpers';
test('loading a project reads only discovered spec edit times and refreshes them after a local edit', async t => {
    const root = await fixture(t);
    const spec = 'cypress/e2e/features/Example.cy.ts';
    const firstEdit = new Date('2025-01-01T12:00:00Z'), nextEdit = new Date('2025-01-02T12:00:00Z');
    await utimes(path.join(root, spec), firstEdit, firstEdit);
    const first = await loadProject(root);
    assert.deepEqual(Object.keys(first.specModifiedTimes), first.specs);
    assert.equal(first.specModifiedTimes[spec], firstEdit.getTime());
    await utimes(path.join(root, spec), nextEdit, nextEdit);
    assert.equal((await loadProject(root)).specModifiedTimes[spec], nextEdit.getTime());
    assert.equal(first.specModifiedTimes[spec], firstEdit.getTime());
});

test('initialization creates shared configuration, folder categories, launch script and ignore entries without overwriting later edits', async t => {
    const root = await fixture(t);
    const first = await initializeProject(root);
    assert.deepEqual(first.changedFiles.sort(), ['.gitignore', categoryPath, configPath, 'package.json'].sort());
    assert.equal(first.project.initialized, true);
    assert.equal(first.project.config.configFile, 'cypress.config.ts');
    assert.equal(first.project.categories[0].specs.length, 1);
    assert.equal(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).scripts['spec-runner'], 'cypress-spec-runner');
    assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /\.env/);
    const second = await initializeProject(root);
    assert.deepEqual(second.changedFiles, []);
    const saved = await saveConfig(root, { ...second.project.config, name: 'Another project' }, second.project.configRevision);
    assert.equal(saved.project.config.name, 'Another project');
    await assert.rejects(saveConfig(root, first.project.config, first.project.configRevision), /changed on disk/);
});
test('an existing launch script is preserved, and invalid saved JSON is reported', async t => {
    const root = await fixture(t);
    const pkgFile = path.join(root, 'package.json');
    const pkg = JSON.parse(await readFile(pkgFile, 'utf8'));
    pkg.scripts = { 'spec-runner': 'another-command' };
    await writeFile(pkgFile, JSON.stringify(pkg));
    await assert.rejects(initializeProject(root), /different spec-runner script/);
    assert.equal((await loadProject(root)).initialized, false);
    await writeFile(path.join(root, configPath), '{broken');
    await assert.rejects(findProject([root]), /invalid JSON/);
});
test('custom discovery includes nonstandard spec names and excludes configured files', async t => {
    const root = await fixture(t);
    await mkdir(path.join(root, 'tests/browser'), { recursive: true });
    await writeFile(path.join(root, 'tests/browser/example.spec.ts'), '');
    await writeFile(path.join(root, 'tests/browser/ignored.spec.ts'), '');
    const config = { ...await defaults(root), specPattern: ['tests/browser/**/*.spec.ts'], excludeSpecPattern: ['**/ignored.*'] };
    assert.deepEqual(await discoverSpecs(root, config), ['tests/browser/example.spec.ts']);
    const saved = await saveConfig(root, config, 'missing');
    assert.deepEqual(saved.project.specs, ['tests/browser/example.spec.ts']);
});
test('categories retain missing assignments for repair and reject stale editors and escaped paths', async t => {
    const root = await fixture(t);
    const saved = await saveCategories(root, [{ id: 'smoke', name: 'Smoke', specs: ['cypress/e2e/features/Example.cy.ts'] }], 'missing');
    await assert.rejects(saveCategories(root, [], 'missing'), /changed on disk/);
    await rm(path.join(root, 'cypress/e2e/features/Example.cy.ts'));
    assert.equal((await loadProject(root)).categories[0].specs.length, 1);
    await assert.rejects(saveCategories(root, [{ id: 'bad', name: 'Bad', specs: ['../outside.ts'] }], saved.project.revision));
});
test('profiles support local environment references, avoid expanded preview secrets and launch with separate arguments', async t => {
    const root = await fixture(t);
    const config = await defaults(root);
    config.profiles = [{ id: 'example', name: 'Example environment', baseUrl: '${EXAMPLE_BASE_URL}', args: ['--env', 'setting=${EXAMPLE_VALUE}'], env: { EXAMPLE_SETTING: '${EXAMPLE_VALUE}' } }];
    config.defaultProfile = 'example';
    await writeFile(path.join(root, '.env'), 'EXAMPLE_BASE_URL=https://app.example.test\nEXAMPLE_VALUE=local-value\n');
    await saveConfig(root, config, 'missing');
    const options = { specs: ['cypress/e2e/features/Example.cy.ts'], profile: 'example', browser: 'chrome' as const, headed: true };
    const environment = await runEnvironment(root, config, 'example');
    assert.equal(environment.EXAMPLE_SETTING, 'local-value');
    const args = runArguments(await validateRun(root, options), config, environment);
    assert.ok(args.includes('setting=local-value'));
    assert.ok(args.includes(JSON.stringify({ baseUrl: 'https://app.example.test' })));
    assert.ok(!commandPreview(options, config).includes('local-value'));
    assert.ok(commandPreview(options, config).includes('${EXAMPLE_VALUE}'));
    await assert.rejects(validateRun(root, { ...options, specs: [] }));
    await assert.rejects(validateRun(root, { ...options, specs: ['cypress/e2e/features/*.cy.ts'] }));
    await assert.rejects(validateRun(root, { ...options, profile: 'missing' }));
    config.profiles[0].args = ['--project=../other'];
    assert.throws(() => validateConfig(config), /runner controls/);
});
test('discovery and local environment files cannot resolve outside the project', async t => {
    if (process.platform === 'win32') return;
    const root = await fixture(t);
    const outside = await fixture(t);
    await symlink(path.join(outside, 'cypress/e2e/features/Example.cy.ts'), path.join(root, 'cypress/e2e/linked.cy.ts'));
    assert.ok(!(await discoverSpecs(root)).includes('cypress/e2e/linked.cy.ts'));
    await writeFile(path.join(outside, '.env'), 'EXAMPLE_VALUE=outside');
    await symlink(path.join(outside, '.env'), path.join(root, '.env'));
    await assert.rejects(runEnvironment(root, await defaults(root), 'default'), /outside this project/);
});

test('first-use settings generate categories using the chosen patterns and ignore a changed environment file', async t => {
    const root = await fixture(t);
    await mkdir(path.join(root, 'tests'), { recursive: true });
    await writeFile(path.join(root, 'tests/example.spec.ts'), '');
    const chosen = { ...await defaults(root), specPattern: ['tests/**/*.spec.ts'], envFile: '.env.testing' };
    const initialized = await initializeProject(root, chosen);
    assert.deepEqual(initialized.project.categories[0].specs, ['tests/example.spec.ts']);
    assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /\.env.testing/);
    const result = await saveConfig(root, { ...chosen, envFile: '.env.preview' }, initialized.project.configRevision);
    assert.ok(result.changedFiles.includes('.gitignore'));
    assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /\.env.preview/);
});

test('older projects keep all browsers, and restricted browser choices persist and reject disabled runs', async t => {
    const root = await fixture(t);
    const legacy = await defaults(root);
    delete legacy.browsers;
    await writeFile(path.join(root, configPath), JSON.stringify(legacy));
    assert.deepEqual((await loadProject(root)).config.browsers, ['chrome', 'electron', 'edge', 'firefox']);
    const current = await loadProject(root);
    const saved = await saveConfig(root, { ...current.config, browsers: ['electron', 'firefox'] }, current.configRevision);
    assert.deepEqual(saved.project.config.browsers, ['electron', 'firefox']);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, configPath), 'utf8')).browsers, ['electron', 'firefox']);
    const options = { specs: current.specs, profile: 'default', browser: 'chrome', headed: false };
    await assert.rejects(validateRun(root, options), /Invalid profile, browser/);
    assert.equal((await validateRun(root, { ...options, browser: 'electron' })).browser, 'electron');
    for (const browsers of [[], ['chrome', 'chrome'], ['unknown'], ['chrome; echo unsafe'], null, 'chrome']) {
        assert.throws(() => validateConfig({ ...current.config, browsers }), /at least one supported browser/);
    }
});
