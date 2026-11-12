const { contextBridge } = require('electron');
let revision = 0, callback = () => {}, sequence = 0;
let jobs = [];
const specs = ['cypress/e2e/account/Sign in.cy.ts', 'cypress/e2e/account/Sign out.cy.ts', 'cypress/e2e/catalog/Search.cy.ts'];
let project = { root: '/example-project', initialized: false, configRevision: 'missing', revision: 'missing', specs, categories: [], config: {
    version: 1, name: 'Example project', configFile: 'cypress.config.ts', specPattern: ['cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'], excludeSpecPattern: ['**/node_modules/**'], envFile: '.env',
    profiles: [{ id: 'default', name: 'Default', args: [], env: {} }], defaultProfile: 'default'
} };
function normalize(config) { return { ...config, maxConcurrentRuns: config.maxConcurrentRuns ?? 2, concurrencyGroups: config.concurrencyGroups ?? [], profiles: config.profiles.map(profile => ({ ...profile, maxConcurrentRuns: profile.maxConcurrentRuns ?? 1 })) }; }
function emit(job) { job.revision++; callback({ ...job }); }
function pump() {
    for (const job of jobs.filter(job => job.status === 'queued')) {
        const active = jobs.filter(job => ['running', 'stopping'].includes(job.status));
        const profile = project.config.profiles.find(profile => profile.id === job.profileId);
        if (active.filter(job => job.profileId === profile.id).length >= (profile.maxConcurrentRuns ?? 1)) job.waitReason = 'Waiting for ' + profile.name;
        else if (active.length >= (project.config.maxConcurrentRuns ?? 2)) job.waitReason = 'Waiting for a free run slot';
        else { job.status = 'running'; job.startedAt = Date.now(); job.waitReason = null; job.output = job.number === 1 ? 'Example output\n' : `Example output ${job.number}\n`; }
        emit(job);
    }
}
contextBridge.exposeInMainWorld('specRunner', {
    project: async () => project, refresh: async () => project, runs: async () => jobs,
    state: async id => { const job = jobs.find(job => job.id === id); if (!job) throw Error('Unknown run'); return job; },
    onRunState: listener => { callback = listener; return () => {}; },
    initialize: async config => { project = { ...project, config: normalize(config ?? project.config), initialized: true, configRevision: String(++revision), revision: String(revision), categories: [{ id: 'account', name: 'Account', specs: specs.slice(0,2) }, { id: 'catalog', name: 'Catalog', specs: specs.slice(2) }] }; return { project, changedFiles: ['spec-runner.config.json', '.spec-runner/categories.json', 'package.json', '.gitignore'] }; },
    saveConfig: async config => { project = { ...project, config: normalize(config), configRevision: String(++revision) }; return { project, changedFiles: ['spec-runner.config.json'] }; },
    saveCategories: async categories => { project = { ...project, categories, revision: String(++revision) }; return { project, changedFiles: ['.spec-runner/categories.json'] }; },
    preview: async () => 'cypress run --e2e --spec example', copy: async () => {}, openLog: async id => { project.logOpened = id; },
    run: async options => {
        const number = ++sequence, id = 'run-' + number;
        const job = { ...options, specs: [...options.specs], id, number, revision: 0, profileId: options.profile, profileName: project.config.profiles.find(profile => profile.id === options.profile).name,
            status: 'queued', output: '', command: 'cypress run --e2e', exitCode: null, outputTruncated: false, outputStartLine: 0, logError: null,
            logPath: '/example-project/spec-runner-logs/' + id + '/example.log', artifactDirectory: '/example-project/spec-runner-logs/' + id,
            createdAt: Date.now(), startedAt: null, finishedAt: null, waitReason: null };
        jobs.push(job); pump(); return job;
    },
    stop: async id => { const job = jobs.find(job => job.id === id); job.status = job.status === 'queued' ? 'cancelled' : 'stopped'; job.finishedAt = Date.now(); job.waitReason = null; emit(job); pump(); },
    closeRun: async id => { jobs = jobs.filter(job => job.id !== id); }
});
