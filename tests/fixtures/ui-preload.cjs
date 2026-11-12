const { contextBridge } = require('electron');
let revision = 0, callback = () => {};
const specs = ['cypress/e2e/account/Sign in.cy.ts', 'cypress/e2e/account/Sign out.cy.ts', 'cypress/e2e/catalog/Search.cy.ts'];
let project = { root: '/example-project', initialized: false, configRevision: 'missing', revision: 'missing', specs, categories: [], config: {
    version: 1, name: 'Example project', configFile: 'cypress.config.ts', specPattern: ['cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'], excludeSpecPattern: ['**/node_modules/**'], envFile: '.env',
    profiles: [{ id: 'default', name: 'Default', args: [], env: {} }], defaultProfile: 'default'
} };
const idle = { status: 'idle', output: '', command: '', exitCode: null, outputTruncated: false, outputStartLine: 0, logPath: null, logError: null };
contextBridge.exposeInMainWorld('specRunner', {
    project: async () => project, refresh: async () => project, state: async () => idle,
    onRunState: listener => { callback = listener; return () => {}; },
    initialize: async config => { project = { ...project, config: config ?? project.config, initialized: true, configRevision: String(++revision), revision: String(revision), categories: [{ id: 'account', name: 'Account', specs: specs.slice(0,2) }, { id: 'catalog', name: 'Catalog', specs: specs.slice(2) }] }; return { project, changedFiles: ['spec-runner.config.json', '.spec-runner/categories.json', 'package.json', '.gitignore'] }; },
    saveConfig: async config => { project = { ...project, config, configRevision: String(++revision) }; return { project, changedFiles: ['spec-runner.config.json'] }; },
    saveCategories: async categories => { project = { ...project, categories, revision: String(++revision) }; return { project, changedFiles: ['.spec-runner/categories.json'] }; },
    preview: async () => 'cypress run --e2e --spec example', copy: async () => {}, openLog: async () => { project.logOpened = true; },
    run: async () => { const state = { ...idle, status: 'running', output: 'Example output\n', logPath: '/example-project/spec-runner-logs/example.log' }; callback(state); return state; },
    stop: async () => callback({ ...idle, status: 'stopped', output: 'Example output\n', logPath: '/example-project/spec-runner-logs/example.log' })
});
