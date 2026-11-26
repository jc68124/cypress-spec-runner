const { contextBridge } = require('electron');
let revision = 0, callback = () => {}, sequence = 0;
let specCallback = () => {};
const recent = new Map();
const heldActions = new Map(), actionFailures = new Map();
async function action(name) {
    project.actionCalls = { ...project.actionCalls, [name]: (project.actionCalls?.[name] ?? 0) + 1 };
    if (heldActions.has(name)) await heldActions.get(name).promise;
    const failure = actionFailures.get(name); actionFailures.delete(name);
    if (failure) throw Error(failure);
}
let jobs = [], groups = [], groupSequence = 0, batchCallback = () => {};
const specs = ['cypress/e2e/account/Sign in.cy.ts', 'cypress/e2e/account/Sign out.cy.ts', 'cypress/e2e/catalog/Search.cy.ts'];
let project = { local: {revision:'0',browserPaths:{},presets:[]}, root: '/example-project', initialized: false, configRevision: 'missing', revision: 'missing', specs, specModifiedTimes: { [specs[0]]: 2000, [specs[1]]: 3000, [specs[2]]: 1000 }, categories: [], config: {
    version: 1, name: 'Example project', configFile: 'cypress.config.ts', specPattern: ['cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'], excludeSpecPattern: ['**/node_modules/**'], envFile: '.env',
    profiles: [{ id: 'default', name: 'Default', args: [], env: {} }], defaultProfile: 'default'
} };
function normalize(config) { return { ...config, maxConcurrentRuns: config.maxConcurrentRuns ?? 2, concurrencyGroups: config.concurrencyGroups ?? [], profiles: config.profiles.map(profile => ({ ...profile, maxConcurrentRuns: profile.maxConcurrentRuns ?? 1 })) }; }
function emit(job) {
    if(['passed','failed','stopped'].includes(job.status))recent.set(job.id,{id:job.id,name:job.name,groupName:'Saved group',profileId:job.profileId,profileName:job.profileName,browser:job.browser,browserName:job.browser,status:job.status,createdAt:job.createdAt,finishedAt:job.finishedAt,duration:job.results?.duration??100,specCount:job.specs.length,specs:job.specs,headed:job.headed,isolateArtifacts:job.isolateArtifacts,notes:job.notes,logPath:job.logPath,results:job.results,counts:job.results?{total:job.results.total,passed:job.results.passed,failed:job.results.failed,pending:job.results.pending,skipped:job.results.skipped}:undefined});
    const batch = groups.find(batch => batch.id === job.batchId);
    if (batch.statuses[job.id] !== job.status) { batch.statuses[job.id] = job.status; batch.revision++; batchCallback({ ...batch }); }
    job.revision++; callback({ ...job });
}
function remove(job, cleanup = true) { jobs = jobs.filter(item => item.id !== job.id); callback({ ...job, removed: true, revision: job.revision + 1 }); if(cleanup&&!jobs.some(item=>item.batchId===job.batchId)){const batch=groups.find(item=>item.id===job.batchId);groups=groups.filter(item=>item.id!==job.batchId);batchCallback({...batch,removed:true,revision:batch.revision+1});} }
function runMatrix(options) {
    const batch = { id: 'batch-' + (++groupSequence), revision: 0, name: (options.profiles.length * options.browsers.length > 1 ? 'Matrix #' : 'Run #') + groupSequence,
        createdAt: Date.now(), profiles: options.profiles.map(id => ({ id, name: project.config.profiles.find(profile => profile.id === id).name })), browsers: [...options.browsers], specCount: options.specs.length, executionMode: options.executionMode, statuses: {}, targets: [] };
    const specs = [...new Set(options.specs)].sort();
    const pairs = options.executionMode === 'split'
        ? options.browsers.flatMap(browser => options.profiles.map(profile => ({ profile, browser })))
        : options.profiles.flatMap(profile => options.browsers.map(browser => ({ profile, browser })));
    const suites = options.executionMode === 'split' ? [pairs]
        : options.executionMode === 'per-browser' ? options.browsers.map(browser => pairs.filter(pair => pair.browser === browser))
        : options.executionMode === 'per-profile' ? options.profiles.map(profile => pairs.filter(pair => pair.profile === profile))
        : pairs.map(pair => [pair]);
    const entries = suites.flatMap(targets => {
        const requested = options.splitRuns === 'per-spec' ? specs.length : options.splitRuns ?? targets.length;
        const count = Math.min(requested, specs.length);
        return Array.from({ length: count }, (_, index) => ({
            ...targets[index % targets.length], assigned: specs.filter((_, specIndex) => specIndex % count === index),
        }));
    }).map(({ profile, browser, assigned }) => {
        const number = ++sequence, id = 'run-' + number, profileName = project.config.profiles.find(item => item.id === profile).name;
        const job = { ...options, profile, browser, specs: assigned, id, number, revision: 0, batchId: batch.id, name: profileName + ' · ' + browser, notes: '', profileId: profile, profileName,
            status: 'queued', output: '', command: 'cypress run --e2e', exitCode: null, outputTruncated: false, outputStartLine: 0, logError: null,
            logPath: '/example-project/spec-runner-logs/' + id + '/example.log', artifactDirectory: '/example-project/spec-runner-logs/' + id,
            createdAt: Date.now(), startedAt: null, finishedAt: null, waitReason: null };
        batch.statuses[id] = 'queued'; batch.targets.push({ id, profileId: profile, browser, specCount: assigned.length }); return job;
    });
    groups.push(batch); jobs.push(...entries); batchCallback({ ...batch }); entries.forEach(emit); pump(); return { batch, runs: entries };
}
function pump() {
    const cap = value => value === 'unlimited' ? Infinity : value;
    for (const job of jobs.filter(job => job.status === 'queued')) {
        const active = jobs.filter(job => ['running', 'stopping'].includes(job.status));
        const profile = project.config.profiles.find(profile => profile.id === job.profileId);
        if (active.filter(job => job.profileId === profile.id).length >= cap(profile.maxConcurrentRuns ?? 1)) job.waitReason = 'Waiting for ' + profile.name;
        else if (active.length >= cap(project.config.maxConcurrentRuns ?? 2)) job.waitReason = 'Waiting for a free run slot';
        else { job.status = 'running'; job.startedAt = Date.now(); job.waitReason = null; job.output = job.number === 1 ? 'Example output\n' : `Example output ${job.number}\n`; }
        emit(job);
    }
}
contextBridge.exposeInMainWorld('specRunner', {
    saveLocal: async state=>{project={...project,local:{...state,revision:String(++revision)}};return {state:project.local,changedFiles:[]};},
    liveSpecDetails: async (id, spec) => {
        const row = jobs.find(job => job.id === id)?.progress?.specs.find(row => row.spec === spec);
        if (!row?.hasDetails) return undefined;
        project.liveSpecRead = { id, spec };
        return { tests: [{ title: 'Example › passes on retry', state: 'passed', duration: 61000, attempts: 2 }], screenshots: ['/example-project/spec-runner-logs/' + id + '/live.png'] };
    },
    chooseBrowser:async()=>'/example-project/browser executable',openArtifact:async(id,filename,historical)=>{project.artifactOpened=filename;project.artifactOpenedHistorical=historical;},
    history:async()=>{await action('history');return {entries:[...recent.values()]};},historyDetail:async id=>recent.get(id),historyLog:async id=>{project.historyLogOpened=id;},forgetHistory:async id=>{if(id)recent.delete(id);else recent.clear();},rerunHistory:async (id,mode)=>{const job=recent.get(id);project.lastHistoryRerun={id,mode};return runMatrix({specs:mode==='failed-specs'?job.results.specs.filter(spec=>spec.failed||spec.error).map(spec=>spec.spec):job.specs,profiles:[job.profileId],browsers:[job.browser],headed:job.headed});},
    notifications: async enabled => ({ enabled: !!enabled, supported: true }), testNotification: async () => { project.testNotificationSent = true; }, onNotificationStatus: () => () => {}, onNotificationClick: () => () => {},
    onSpecChanges: listener => { specCallback = listener; return () => {}; },
    project: async () => project, refresh: async () => { specCallback(false); project = { ...project, specModifiedTimes: { ...project.specModifiedTimes, [specs[2]]: 4000 } }; return project; }, runs: async () => jobs,
    state: async id => { const job = jobs.find(job => job.id === id); if (!job) throw Error('Unknown run'); return job; },
    onRunState: listener => { callback = listener; return () => {}; },
    initialize: async config => { project = { ...project, config: normalize(config ?? project.config), initialized: true, configRevision: String(++revision), revision: String(revision), categories: [{ id: 'account', name: 'Account', specs: specs.slice(0,2) }, { id: 'catalog', name: 'Catalog', specs: specs.slice(2) }] }; return { project, changedFiles: ['spec-runner.config.json', '.spec-runner/categories.json', 'package.json', '.gitignore'] }; },
    saveConfig: async config => { project = { ...project, config: normalize(config), configRevision: String(++revision) }; return { project, changedFiles: ['spec-runner.config.json'] }; },
    saveCategories: async categories => { project = { ...project, categories, revision: String(++revision) }; return { project, changedFiles: ['.spec-runner/categories.json'] }; },
    preview: async () => 'cypress run --e2e --spec example', copy: async text => {await action('copy');project.copiedSummary=text;}, openLogLocation: async id => { project.logRevealed = id; }, openLog: async id => { project.logOpened = id; }, copyOutput: async id => { project.copiedOutput = jobs.find(job => job.id === id).output; },
    run: async options => runMatrix({ ...options, profiles: [options.profile], browsers: [options.browser] }).runs[0],
    runMatrix: async options => runMatrix(options),
    rerun: async (id,mode) => { const job=jobs.find(job=>job.id===id);project.lastRerun={id,mode};return runMatrix({...job,specs:mode==='failed-specs'?job.results.specs.filter(spec=>spec.failed||spec.error).map(spec=>spec.spec):job.specs,profiles:[job.profileId],browsers:[job.browser]}); },
    rerunBatch: async id => { const group=groups.find(group=>group.id===id);return runMatrix({specs:specs.slice(0,group.specCount),profiles:group.profiles.map(profile=>profile.id),browsers:group.browsers,headed:false}); },
    previewMatrix: async () => 'cypress run --e2e --spec example',
    batches: async () => groups,
    onBatchState: listener => { batchCallback = listener; return () => {}; },
    updateRun: async (id, details) => { const job = jobs.find(job => job.id === id); Object.assign(job, details); emit(job); return job; },
    renameBatch: async (id, name) => { const batch = groups.find(batch => batch.id === id); batch.name = name; batch.revision++; batchCallback({ ...batch }); return batch; },
    closeBatch: async id => { const batch = groups.find(batch => batch.id === id); jobs.filter(job => job.batchId === id).forEach(job=>remove(job,false)); groups = groups.filter(item => item.id !== id); batchCallback({ ...batch, removed: true, revision: batch.revision + 1 }); },
    stop: async id => { const job = jobs.find(job => job.id === id); const queued = job.status === 'queued'; job.status = queued ? 'cancelled' : 'stopped'; job.finishedAt = Date.now(); job.waitReason = null; emit(job); if (queued) remove(job); pump(); },
    closeRun: async id => { remove(jobs.find(job => job.id === id)); }

});
contextBridge.exposeInMainWorld('specRunnerFixture', {
    progress: (id,progress) => { const job=jobs.find(job=>job.id===id);job.progress=progress;emit(job); },
    hold: name => { let resolve; const promise = new Promise(done => { resolve = done; }); heldActions.set(name, {promise,resolve}); },
    release: name => { heldActions.get(name)?.resolve(); heldActions.delete(name); },
    failNext: (name, message) => { actionFailures.set(name, message); },
    specsChanged: () => specCallback(true), finish: (id, status, results) => { const job = jobs.find(job => job.id === id); job.status = status; job.results=results??{total:2,passed:status==='failed'?1:2,failed:status==='failed'?1:0,pending:0,skipped:0,duration:100,specs:[{spec:job.specs[0],passed:status==='failed'?1:2,failed:status==='failed'?1:0,pending:0,skipped:0,duration:100,tests:[{title:'Example retry',state:'passed',attempts:2,duration:100}],screenshots:['/example-project/screenshot.png'],video:'/example-project/video.mp4'}]}; job.finishedAt = Date.now(); emit(job); pump(); }, append: (id, text) => { const job = jobs.find(job => job.id === id); job.output += text; emit(job); }
});
