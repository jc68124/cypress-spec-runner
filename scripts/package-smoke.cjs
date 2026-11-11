const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
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
(async () => {
    const archive = path.resolve(process.argv[2] ?? `cypress-spec-runner-${require('../package.json').version}.tgz`);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-runner-consumer-'));
    try {
        await fs.mkdir(path.join(root, 'fake-cypress/bin'), { recursive: true });
        await fs.mkdir(path.join(root, 'cypress/e2e'), { recursive: true });
        await fs.writeFile(path.join(root, 'fake-cypress/package.json'), JSON.stringify({ name: 'cypress', version: '16.0.0', bin: { cypress: 'bin/cypress' } }));
        await fs.writeFile(path.join(root, 'fake-cypress/bin/cypress'), "console.log(JSON.stringify({args:process.argv.slice(2),value:process.env.EXAMPLE_SETTING}));");
        await fs.writeFile(path.join(root, 'cypress/e2e/example.cy.ts'), '');
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'example-consumer', private: true, devDependencies: { cypress: 'file:./fake-cypress', 'cypress-spec-runner': 'file:' + archive } }));
        if (!process.env.npm_execpath) throw Error('Run this check through npm run smoke -- <package.tgz>.');
        await execute(process.execPath, [process.env.npm_execpath, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], root);
        const installed = path.join(root, 'node_modules/cypress-spec-runner');
        const setup = await execute(process.execPath, [path.join(installed, 'bin/cypress-spec-runner.cjs'), 'init'], root);
        assert.match(setup, /Commit these files/);
        assert.equal(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).scripts['spec-runner'], 'cypress-spec-runner');
        await assert.rejects(fs.access(path.join(root, 'node_modules/typescript')));
        await assert.rejects(fs.access(path.join(root, 'node_modules/vite')));
        const configFile = path.join(root, 'spec-runner.config.json');
        const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
        config.profiles[0].env = { EXAMPLE_SETTING: '${EXAMPLE_LOCAL_VALUE}' };
        await fs.writeFile(configFile, JSON.stringify(config));
        await fs.writeFile(path.join(root, '.env'), 'EXAMPLE_LOCAL_VALUE=fixture-value');
        const harness = path.join(root, 'desktop-check.cjs');
        await fs.writeFile(harness, `
            const { app, BrowserWindow } = require('electron');
            const original = BrowserWindow.prototype.loadFile;
            BrowserWindow.prototype.loadFile = async function(...args) {
                const result = await original.apply(this,args);
                const window = this;
                setTimeout(async () => {
                    try {
                        const result = await window.webContents.executeJavaScript(\`(async()=>{
                            const project=await window.specRunner.project();
                            await window.specRunner.run({specs:project.specs,profile:project.config.defaultProfile,browser:'chrome',headed:false});
                            for(let index=0;index<300;index++){
                                const state=await window.specRunner.state();
                                if(state.status==='passed') return state;
                                if(state.status==='failed') throw Error(state.output);
                                await new Promise(resolve=>setTimeout(resolve,20));
                            }
                            throw Error('Run did not complete');
                        })()\`);
                        console.log('PACKAGED_RUN:' + JSON.stringify(result)); app.exit(0);
                    } catch(error) { console.error(error); app.exit(1); }
                }, 30);
                return result;
            };
            require(${JSON.stringify(path.join(installed, 'out/electron/main.js'))});
        `);
        const requireFromProject = require('node:module').createRequire(path.join(root, 'package.json'));
        const electron = requireFromProject(requireFromProject.resolve('electron', { paths: [installed] }));
        const env = { ...process.env, SPEC_RUNNER_PROJECT: root, SPEC_RUNNER_NODE: process.execPath };
        delete env.ELECTRON_RUN_AS_NODE;
        const output = await execute(electron, [...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless'] : []), '--disable-gpu', harness], root, env);
        const line = output.split('\n').find(line => line.startsWith('PACKAGED_RUN:'));
        assert.ok(line, output);
        const state = JSON.parse(line.slice('PACKAGED_RUN:'.length));
        const result = JSON.parse(state.output);
        assert.equal(result.value, 'fixture-value');
        assert.ok(result.args.includes('cypress/e2e/example.cy.ts'));
        assert.equal(await fs.readFile(state.logPath, 'utf8'), state.output);
        console.log('PASS: packed package installed in a separate Cypress project, initialized, launched its real desktop/main/preload API, ran the project CLI with local environment values, and saved the complete log without consumer build tools.');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
