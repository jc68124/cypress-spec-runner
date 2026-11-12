import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { configPatterns } from '../electron/discovery';
import { defaults, loadProject } from '../electron/project';
import { fixture } from './helpers';

test('automatic discovery reads JS/TS exports, local constants, spreads and Cypress helper aliases without evaluating code', () => {
    const patterns = { specPattern: ['tests/**/*.spec.ts'], excludeSpecPattern: ['**/skip/**'] };
    for (const source of [
        `import { defineConfig } from 'cypress'; throw Error('must not execute'); export default defineConfig({ e2e: ${JSON.stringify(patterns)} });`,
        `const patterns = ['tests/**/*.spec.ts'] as const; const settings = { specPattern: [...patterns], excludeSpecPattern: ['**/skip/**'] }; export default {e2e: {...settings}} satisfies SomeType;`,
        `const {defineConfig} = require('cypress'); module.exports = defineConfig({e2e: ${JSON.stringify(patterns)}});`,
        `import {defineConfig as configure} from 'cypress'; const config = configure({e2e: ${JSON.stringify(patterns)}}); export default config;`,
    ]) assert.deepEqual(configPatterns(source), patterns);
    assert.deepEqual(configPatterns('export default { e2e: { setupNodeEvents() { throw Error("never run"); } } };').specPattern, ['cypress/e2e/**/*.cy.{js,jsx,ts,tsx}']);
});
test('dynamic or mutated patterns produce an explicit fallback instead of silently guessing', async t => {
    const root = await fixture(t);
    await writeFile(path.join(root, 'cypress.config.ts'), 'export default {e2e:{specPattern: process.env.PATTERN}};');
    const project = await loadProject(root);
    assert.equal(project.discovery?.source, 'cypress');
    assert.match(project.discovery?.warning ?? '', /advanced discovery override/);
    assert.deepEqual(project.specs, []);
    assert.throws(() => configPatterns('const config={e2e:{}}; config.e2e.specPattern = getPatterns(); export default config;'), /executable/);
});
test('refresh picks up Cypress config patterns, exclusions and changes while legacy overrides retain their meaning', async t => {
    const root = await fixture(t);
    await mkdir(path.join(root, 'custom/nested'), { recursive: true });
    await writeFile(path.join(root, 'custom/example.spec.ts'), '');
    await writeFile(path.join(root, 'custom/nested/skip.spec.ts'), '');
    await writeFile(path.join(root, 'cypress.config.ts'), `export default {e2e:{specPattern:'custom/**/*.spec.ts', excludeSpecPattern:'skip.spec.ts'}};`);
    const project = await loadProject(root);
    assert.deepEqual(project.specs, ['custom/example.spec.ts']);
    assert.equal(project.discovery?.source, 'cypress');
    assert.equal(project.config.specPattern, undefined);
    await writeFile(path.join(root, 'cypress.config.ts'), `module.exports = {e2e:{specPattern:'cypress/e2e/**/*.cy.ts'}};`);
    assert.deepEqual((await loadProject(root)).specs, ['cypress/e2e/features/Example.cy.ts']);
    const config = { ...await defaults(root), specPattern: ['custom/**/*.spec.ts'], excludeSpecPattern: [] };
    await writeFile(path.join(root, 'spec-runner.config.json'), JSON.stringify(config));
    const overridden = await loadProject(root);
    assert.equal(overridden.discovery?.source, 'override');
    assert.deepEqual(overridden.specs, ['custom/example.spec.ts', 'custom/nested/skip.spec.ts']);
});
