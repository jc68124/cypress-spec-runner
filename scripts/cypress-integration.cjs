// Real Cypress integration, kept separate from fast tests because it downloads a browser runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const { Runner } = require('../out/electron/runner');
const { requireFailedSpecs } = require('../out/shared/results');
async function execute(command, args, cwd) {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit', shell: false });
    const timer = setTimeout(() => child.kill(), 180000);
    try { assert.equal(await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }), 0, `${command} failed`); }
    finally { clearTimeout(timer); }
}
async function main() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-native-'));
    let runner;
    try {
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'example-cypress-project', private: true }));
        await execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-dev', 'cypress@16.1.0'], root);
        await execute(process.execPath, [path.join(root, 'node_modules/cypress/bin/cypress'), 'install'], root);
        await fs.mkdir(path.join(root, 'cypress/e2e'), { recursive: true });
        const specs = ['cypress/e2e/01-pass.cy.js', 'cypress/e2e/02-fail.cy.js'];
        await fs.writeFile(path.join(root, specs[0]), "it('passes with the original setup configuration',()=>{cy.env(['FROM_SETUP','FROM_IMPORT']).then(values=>{expect(values.FROM_SETUP).to.eq('kept');expect(values.FROM_IMPORT).to.eq('kept');});});");
        await fs.writeFile(path.join(root, specs[1]), "it('fails after the first spec completes',()=>{cy.wait(1000).then(()=>expect(false).to.eq(true));});");
        await fs.writeFile(path.join(root, 'helper.cjs'), "module.exports='kept';");
        for (const [filename, esm, ts] of [['cypress.config.cjs', false, false], ['cypress.config.ts', false, true], ['cypress.config.mjs', true, false], ['cypress.config.ts', true, true]]) {
            const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); pkg.type = esm ? 'module' : 'commonjs'; await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg));
            const originalFile = path.join(root, filename);
            const source = `${esm || ts ? "import fs from 'node:fs';import value from './helper.cjs';export default " : "const fs=require('node:fs'),value=require('./helper.cjs');module.exports="}{video:false,screenshotOnRunFailure:false,reporter:'junit',reporterOptions:{mochaFile:'junit/results-[hash].xml'},e2e:{supportFile:false,specPattern:'cypress/e2e/*.cy.js',async setupNodeEvents(on,config){if(config.configFile!==${JSON.stringify(originalFile)})throw Error('Original config path changed');on('before:spec',async spec=>{await new Promise(resolve=>setTimeout(resolve,10));fs.appendFileSync('hooks.txt','before:'+spec.relative+'\\n');});on('after:spec',spec=>{fs.appendFileSync('hooks.txt','after:'+spec.relative+'\\n');});return {...config,env:{...config.env,FROM_SETUP:'kept',FROM_IMPORT:value}};}}};`;
            await fs.writeFile(originalFile, source); await fs.writeFile(path.join(root, 'hooks.txt'), '');
            let observed = false;
            runner = new Runner(state => { if (state.status === 'running' && state.progress?.completed === 1 && !state.results) observed = true; });
            const config = { version: 1, name: 'Example Cypress project', configFile: filename, envFile: null, specPattern: ['cypress/e2e/*.cy.js'], excludeSpecPattern: [], profiles: [{ id: 'default', name: 'Default', args: [], env: {} }], defaultProfile: 'default' };
            await runner.run(root, { specs, profile: 'default', browser: 'electron', headed: false }, config);
            const limit = Date.now() + 90000;
            while (runner.active && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 20));
            assert.equal(runner.active, false, 'Native Cypress did not finish');
            const diagnostic = `${runner.state.output}\n${JSON.stringify(runner.state.results ?? runner.state.resultsError)}`;
            assert.equal(runner.state.status, 'failed', diagnostic); assert.equal(runner.state.results?.failed, 1, diagnostic);
            assert.equal(observed, true, 'No progress arrived before final results');
            assert.equal(runner.state.progress.completed, 2); assert.equal(runner.state.progress.total, 2);
            assert.deepEqual(requireFailedSpecs(runner.state.results, specs), [specs[1]]);
            assert.equal(await fs.readFile(originalFile, 'utf8'), source, 'Original config was rewritten');
            const hooks = await fs.readFile(path.join(root, 'hooks.txt'), 'utf8');
            for (const spec of specs) assert.ok(hooks.includes(`before:${spec}\n`) && hooks.includes(`after:${spec}\n`), 'Original hooks were lost');
            assert.ok((await fs.readdir(path.join(root, 'junit'))).some(file => file.endsWith('.xml')), 'Project reporter did not run');
            assert.ok(!(await fs.readdir(path.join(root, 'spec-runner-logs'))).some(file => file.startsWith('.progress-')), 'Temporary config was retained');
            console.log(`PASS: native Cypress live progress, results, hooks, reporter and original config (${filename}, ${esm ? 'ESM' : 'CommonJS'})`);
            await fs.rm(originalFile);
        }
    } finally { await runner?.stop(); await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
