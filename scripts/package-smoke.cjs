const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const ownPackage = require('../package.json');

function archiveFilename(metadata) {
    return `${metadata.name.replace(/^@/, '').replace(/\//g, '-')}-${metadata.version}.tgz`;
}
function installArguments(execPath, userAgent = '') {
    if (!execPath) throw Error('Run this check through npm run smoke or pnpm run smoke.');
    if (/^pnpm\//i.test(userAgent) || /(?:^|[\\/])pnpm(?:\.c?js)?$/i.test(execPath)) {
        return [execPath, 'install', '--ignore-scripts', '--no-lockfile', '--no-frozen-lockfile'];
    }
    if (/^npm\//i.test(userAgent) || /(?:^|[\\/])npm(?:-cli)?\.c?js$/i.test(execPath)) {
        return [execPath, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'];
    }
    throw Error('This smoke check supports npm and pnpm. Run npm run smoke or pnpm run smoke.');
}

async function execute(executable, args, cwd, env = process.env) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const timer = setTimeout(() => { child.kill(); reject(Error('Package smoke command timed out.\n' + output)); }, 120000);
        child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(Error(output)); });
    });
}
async function main() {
    const archive = path.resolve(process.argv[2] ?? archiveFilename(ownPackage));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-runner-consumer-'));
    try {
        await fs.mkdir(path.join(root, 'fake-cypress/bin'), { recursive: true });
        await fs.mkdir(path.join(root, 'cypress/e2e'), { recursive: true });
        await fs.writeFile(path.join(root, 'fake-cypress/package.json'), JSON.stringify({ name: 'cypress', version: '16.0.0', bin: { cypress: 'bin/cypress' } }));
        await fs.writeFile(path.join(root, 'fake-cypress/bin/cypress'), "console.log(JSON.stringify({args:process.argv.slice(2),value:process.env.EXAMPLE_SETTING}));setTimeout(()=>{},500);");
        await fs.writeFile(path.join(root, 'cypress/e2e/example.cy.ts'), '');
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'example-consumer', private: true, devDependencies: { cypress: 'file:./fake-cypress', [ownPackage.name]: 'file:' + archive } }));
        await execute(process.execPath, installArguments(process.env.npm_execpath, process.env.npm_config_user_agent), root);
        const installed = await fs.realpath(path.join(root, 'node_modules', ownPackage.name));
        for (const filename of ['icon.svg', 'icon.png', 'icon.ico']) await fs.access(path.join(installed, 'assets', filename));
        const setup = await execute(process.execPath, [path.join(installed, 'bin/cypress-spec-runner.cjs'), 'init'], root);
        assert.match(setup, /Commit these files/);
        const configured = JSON.parse(await fs.readFile(path.join(root, 'spec-runner.config.json'), 'utf8'));
        await fs.access(path.resolve(root, configured.$schema));
        assert.equal(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).scripts['spec-runner'], 'cypress-spec-runner');
        await assert.rejects(fs.access(path.join(root, 'node_modules/typescript')));
        await assert.rejects(fs.access(path.join(root, 'node_modules/vite')));
        const configFile = path.join(root, 'spec-runner.config.json');
        const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
        config.browsers = ['electron'];
        config.profiles[0].env = { EXAMPLE_SETTING: '${EXAMPLE_LOCAL_VALUE}' };
        await fs.writeFile(configFile, JSON.stringify(config));
        await fs.writeFile(path.join(root, '.env'), 'EXAMPLE_LOCAL_VALUE=fixture-value');
        const harness = path.join(root, 'desktop-check.cjs');
        await fs.writeFile(harness, `
            const { app, BrowserWindow, shell, dialog, nativeImage, clipboard } = require('electron');
            const icon = nativeImage.createFromPath(${JSON.stringify(path.join(installed, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'))});
            if (icon.isEmpty() || icon.getSize().width < 16) throw Error('Packaged application icon is missing or invalid');
            const openedLogs = [];
            shell.openPath = async file => { openedLogs.push(file); return openedLogs.length === 1 ? 'No default application is configured.' : ''; };
            dialog.showSaveDialog = async () => { throw Error('The existing log should open without a save dialog'); };
            const original = BrowserWindow.prototype.loadFile;
            BrowserWindow.prototype.loadFile = async function(...args) {
                const result = await original.apply(this,args);
                const window = this;
                setTimeout(async () => {
                    try {
                        const result = await window.webContents.executeJavaScript(\`(async()=>{
                            const project=await window.specRunner.project();
                            const unavailable = await window.specRunner.preview({specs:project.specs,profile:project.config.defaultProfile,browser:'chrome',headed:false}).then(()=>null,error=>error.message);
                            if(!unavailable) throw Error('A disabled browser was accepted');
                            const noLog = await window.specRunner.openLog('missing').then(()=>null,error=>error.message);
                            if(!noLog) throw Error('A missing log was opened');
                            const job=await window.specRunner.run({specs:project.specs,profile:project.config.defaultProfile,browser:'electron',headed:false});
                            for(let index=0;index<300;index++){
                                const state=await window.specRunner.state(job.id);
                                if(state.status==='passed') {
                                    const failure = await window.specRunner.openLog(job.id).then(()=>null,error=>error.message);
                                    if(!failure || !failure.includes('No default application is configured.')) throw Error('Log open failure was hidden');
                                    await window.specRunner.openLog(job.id);
                                    await window.specRunner.closeRun(job.id);
                                    if((await window.specRunner.runs()).length) throw Error('Closing a completed run left its tab behind');
                                    const fresh = await window.specRunner.project();
                                    const expanded = { ...fresh.config, browsers: ['electron', 'chrome'], maxConcurrentRuns: 1, profiles: [...fresh.config.profiles, { id: 'second', name: 'Second environment', args: [], env: fresh.config.profiles[0].env }] };
                                    await window.specRunner.saveConfig(expanded, fresh.configRevision);
                                    const matrix = { specs: fresh.specs, profiles: [fresh.config.defaultProfile, 'second'], browsers: ['electron', 'chrome'], headed: false };
                                    const invalid = await window.specRunner.runMatrix({ ...matrix, profiles: [fresh.config.defaultProfile, 'missing'] }).then(()=>null,error=>error.message);
                                    if(!invalid || (await window.specRunner.runs()).length) throw Error('Invalid matrix started a partial batch');
                                    const batch = await window.specRunner.runMatrix(matrix);
                                    if(batch.runs.length!==4 || batch.runs.filter(run=>run.status==='running').length!==1) throw Error('Matrix did not create four runs with the configured cap');
                                    const first = batch.runs[0], cancelled = batch.runs[3];
                                    const renamed = await window.specRunner.updateRun(first.id, { name: 'Checkout checks', notes: 'Compare browser results' });
                                    if(renamed.name!=='Checkout checks' || renamed.browser!==first.browser || renamed.profileId!==first.profileId) throw Error('Renaming changed the target');
                                    await window.specRunner.renameBatch(batch.batch.id, 'Cross-browser matrix');
                                    await window.specRunner.stop(cancelled.id);
                                    if((await window.specRunner.runs()).some(run=>run.id===cancelled.id)) throw Error('Cancelled queued run remains visible');
                                    const states = async()=>Promise.all(batch.runs.filter(run=>run.id!==cancelled.id).map(run=>window.specRunner.state(run.id)));
                                    let finished;
                                    for(let attempt=0;attempt<400;attempt++) {
                                        const current=await states();
                                        if(current.every(run=>run.status==='passed')) { finished=current; break; }
                                        if(current.some(run=>run.status==='failed')) throw Error(JSON.stringify(current));
                                        await new Promise(resolve=>setTimeout(resolve,20));
                                    }
                                    if(!finished) throw Error('Matrix did not finish');
                                    const group=(await window.specRunner.batches()).find(group=>group.id===batch.batch.id);
                                    if(group.name!=='Cross-browser matrix' || Object.keys(group.statuses).length!==4 || Object.values(group.statuses).filter(status=>status==='cancelled').length!==1) throw Error('Matrix summary lost cancelled results');
                                    await window.specRunner.copyOutput(first.id);
                                    await window.specRunner.closeRun(first.id);
                                    await window.specRunner.closeBatch(batch.batch.id);
                                    return { ...state, matrix: finished };
                                }
                                if(state.status==='failed') throw Error(state.output);
                                await new Promise(resolve=>setTimeout(resolve,20));
                            }
                            throw Error('Run did not complete');
                        })()\`);
                        if(openedLogs.length!==2 || openedLogs.some(file=>file!==result.logPath)) throw Error('Open log did not use the saved run log');
                        if((await clipboard.readText()).replace(/\\r\\n/g,'\\n')!==result.matrix[0].output.replace(/\\r\\n/g,'\\n')) throw Error('Copy output did not copy the full selected log');
                        console.log('PACKAGED_RUN:' + JSON.stringify(result)); app.exit(0);
                    } catch(error) { console.error(error); app.exit(1); }
                }, 30);
                return result;
            };
            require(${JSON.stringify(path.join(installed, 'out/electron/main.js'))});
        `);
        const requireFromPackage = require('node:module').createRequire(path.join(installed, 'package.json'));
        const electron = requireFromPackage('electron');
        const env = { ...process.env, SPEC_RUNNER_PROJECT: root, SPEC_RUNNER_NODE: process.execPath };
        delete env.ELECTRON_RUN_AS_NODE;
        const output = await execute(electron, [...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless'] : []), '--disable-gpu', harness], root, env);
        const line = output.split('\n').find(line => line.startsWith('PACKAGED_RUN:'));
        assert.ok(line, output);
        const state = JSON.parse(line.slice('PACKAGED_RUN:'.length));
        const result = JSON.parse(state.output);
        assert.equal(result.value, 'fixture-value');
        assert.ok(result.args.includes('cypress/e2e/example.cy.ts'));
        assert.equal(path.dirname(state.logPath), state.artifactDirectory);
        const artifactConfig = JSON.parse(result.args[result.args.indexOf('--config') + 1]);
        assert.equal(artifactConfig.downloadsFolder, path.join(state.artifactDirectory, 'downloads'));
        assert.equal(await fs.readFile(state.logPath, 'utf8'), state.output);
        assert.equal(new Set(state.matrix.map(run => run.artifactDirectory)).size, 3);
        for (const run of state.matrix) {
            assert.equal(await fs.readFile(run.logPath, 'utf8'), run.output);
            const args = JSON.parse(run.output).args;
            assert.equal(args[args.indexOf('--browser') + 1], run.browser);
        }
        console.log('PASS: packed package installed in a separate Cypress project, initialized, launched its real desktop/main/preload API, ran the project CLI with local environment values, saved the complete log, and opened its existing path with browser restrictions enforced and without consumer build tools. A four-run matrix validated atomic submission, queuing, renaming, immediate queued cancellation, retained totals and independent logs.');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
}
module.exports = { archiveFilename, installArguments };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
