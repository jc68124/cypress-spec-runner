const { contextBridge } = require('electron');
let revision = 0, callback = () => {}, sequence = 0;
let jobs = [], groups = [], groupSequence = 0, batchCallback = () => {};
const specs = ['cypress/e2e/account/Sign in.cy.ts', 'cypress/e2e/account/Sign out.cy.ts', 'cypress/e2e/catalog/Search.cy.ts'];
let project = { root: '/example-project', initialized: false, configRevision: 'missing', revision: 'missing', specs, specModifiedTimes: { [specs[0]]: 2000, [specs[1]]: 3000, [specs[2]]: 1000 }, categories: [], config: {
    version: 1, name: 'Example project', configFile: 'cypress.config.ts', specPattern: ['cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'], excludeSpecPattern: ['**/node_modules/**'], envFile: '.env',
    profiles: [{ id: 'default', name: 'Default', args: [], env: {} }], defaultProfile: 'default'
} };
function normalize(config) { return { ...config, maxConcurrentRuns: config.maxConcurrentRuns ?? 2, concurrencyGroups: config.concurrencyGroups ?? [], profiles: config.profiles.map(profile => ({ ...profile, maxConcurrentRuns: profile.maxConcurrentRuns ?? 1 })) }; }
function emit(job) {
    const batch = groups.find(batch => batch.id === job.batchId);
    if (batch.statuses[job.id] !== job.status) { batch.statuses[job.id] = job.status; batch.revision++; batchCallback({ ...batch }); }
    job.revision++; callback({ ...job });
}
function remove(job) { jobs = jobs.filter(item => item.id !== job.id); callback({ ...job, removed: true, revision: job.revision + 1 }); }
function runMatrix(options) {
    const batch = { id: 'batch-' + (++groupSequence), revision: 0, name: (options.profiles.length * options.browsers.length > 1 ? 'Matrix #' : 'Run #') + groupSequence,
        createdAt: Date.now(), profiles: options.profiles.map(id => ({ id, name: project.config.profiles.find(profile => profile.id === id).name })), browsers: [...options.browsers], specCount: options.specs.length, statuses: {}, targets: [] };
    const entries = options.profiles.flatMap(profile => options.browsers.map(browser => {
        const number = ++sequence, id = 'run-' + number, profileName = project.config.profiles.find(item => item.id === profile).name;
        const job = { ...options, profile, browser, specs: [...options.specs], id, number, revision: 0, batchId: batch.id, name: profileName + ' · ' + browser, notes: '', profileId: profile, profileName,
            status: 'queued', output: '', command: 'cypress run --e2e', exitCode: null, outputTruncated: false, outputStartLine: 0, logError: null,
            logPath: '/example-project/spec-runner-logs/' + id + '/example.log', artifactDirectory: '/example-project/spec-runner-logs/' + id,
            createdAt: Date.now(), startedAt: null, finishedAt: null, waitReason: null };
        batch.statuses[id] = 'queued'; batch.targets.push({ id, profileId: profile, browser }); return job;
    }));
    groups.push(batch); jobs.push(...entries); batchCallback({ ...batch }); entries.forEach(emit); pump(); return { batch, runs: entries };
}
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
    notifications: async enabled => ({ enabled: !!enabled, supported: true }), testNotification: async () => { project.testNotificationSent = true; }, onNotificationStatus: () => () => {}, onNotificationClick: () => () => {},
    project: async () => project, refresh: async () => { project = { ...project, specModifiedTimes: { ...project.specModifiedTimes, [specs[2]]: 4000 } }; return project; }, runs: async () => jobs,
    state: async id => { const job = jobs.find(job => job.id === id); if (!job) throw Error('Unknown run'); return job; },
    onRunState: listener => { callback = listener; return () => {}; },
    initialize: async config => { project = { ...project, config: normalize(config ?? project.config), initialized: true, configRevision: String(++revision), revision: String(revision), categories: [{ id: 'account', name: 'Account', specs: specs.slice(0,2) }, { id: 'catalog', name: 'Catalog', specs: specs.slice(2) }] }; return { project, changedFiles: ['spec-runner.config.json', '.spec-runner/categories.json', 'package.json', '.gitignore'] }; },
    saveConfig: async config => { project = { ...project, config: normalize(config), configRevision: String(++revision) }; return { project, changedFiles: ['spec-runner.config.json'] }; },
    saveCategories: async categories => { project = { ...project, categories, revision: String(++revision) }; return { project, changedFiles: ['.spec-runner/categories.json'] }; },
    preview: async () => 'cypress run --e2e --spec example', copy: async () => {}, openLog: async id => { project.logOpened = id; }, copyOutput: async id => { project.copiedOutput = jobs.find(job => job.id === id).output; },
    run: async options => runMatrix({ ...options, profiles: [options.profile], browsers: [options.browser] }).runs[0],
    runMatrix: async options => runMatrix(options),
    rerun: async id => { const job=jobs.find(job=>job.id===id);return runMatrix({...job,profiles:[job.profileId],browsers:[job.browser]}); },
    rerunBatch: async id => { const group=groups.find(group=>group.id===id);return runMatrix({specs:specs.slice(0,group.specCount),profiles:group.profiles.map(profile=>profile.id),browsers:group.browsers,headed:false}); },
    previewMatrix: async () => 'cypress run --e2e --spec example',
    batches: async () => groups,
    onBatchState: listener => { batchCallback = listener; return () => {}; },
    updateRun: async (id, details) => { const job = jobs.find(job => job.id === id); Object.assign(job, details); emit(job); return job; },
    renameBatch: async (id, name) => { const batch = groups.find(batch => batch.id === id); batch.name = name; batch.revision++; batchCallback({ ...batch }); return batch; },
    closeBatch: async id => { const batch = groups.find(batch => batch.id === id); jobs.filter(job => job.batchId === id).forEach(remove); groups = groups.filter(item => item.id !== id); batchCallback({ ...batch, removed: true, revision: batch.revision + 1 }); },
    stop: async id => { const job = jobs.find(job => job.id === id); const queued = job.status === 'queued'; job.status = queued ? 'cancelled' : 'stopped'; job.finishedAt = Date.now(); job.waitReason = null; emit(job); if (queued) remove(job); pump(); },
    closeRun: async id => { remove(jobs.find(job => job.id === id)); }

});
contextBridge.exposeInMainWorld('specRunnerFixture', { finish: (id, status) => { const job = jobs.find(job => job.id === id); job.status = status; job.finishedAt = Date.now(); emit(job); pump(); }, append: (id, text) => { const job = jobs.find(job => job.id === id); job.output += text; emit(job); } });
