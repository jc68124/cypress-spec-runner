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
    const root = await fs.mkdtemp(path.join(os.tmpdir(), process.platform === 'win32' ? 'spec runner consumer-' : 'spec-runner-consumer-'));
    try {
        await fs.mkdir(path.join(root, 'fake-cypress/bin'), { recursive: true });
        await fs.mkdir(path.join(root, 'cypress/e2e'), { recursive: true });
        await fs.writeFile(path.join(root, 'fake-cypress/package.json'), JSON.stringify({ name: 'cypress', version: '16.0.0', main: 'index.cjs', bin: { cypress: 'bin/cypress' } }));
        await fs.writeFile(path.join(root, 'fake-cypress/bin/cypress'), "console.log(JSON.stringify({args:process.argv.slice(2),value:process.env.EXAMPLE_SETTING}));setTimeout(()=>{},500);");
        await fs.copyFile(path.join(__dirname, '../tests/fixtures/fake-cypress.cjs'), path.join(root, 'fake-cypress/index.cjs'));
        await fs.writeFile(path.join(root, 'cypress/e2e/example.cy.ts'), '');
        await fs.writeFile(path.join(root, 'portable browser'), 'fixture browser');
        await fs.writeFile(path.join(root, 'cypress.config.cjs'), "require('node:fs').writeFileSync('config-loaded.txt','runtime only');module.exports={e2e:{specPattern:'cypress/e2e/**/*.cy.ts'}};");
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'example-consumer', private: true, devDependencies: { cypress: 'file:./fake-cypress', [ownPackage.name]: 'file:' + archive } }));
        await execute(process.execPath, installArguments(process.env.npm_execpath, process.env.npm_config_user_agent), root);
        const installed = await fs.realpath(path.join(root, 'node_modules', ownPackage.name));
        for (const filename of ['icon.svg', 'icon.png', 'icon.ico']) await fs.access(path.join(installed, 'assets', filename));
        const setup = await execute(process.execPath, [path.join(installed, 'bin/cypress-spec-runner.cjs'), 'init'], root);
        assert.match(setup, /Commit these files/);
        const configured = JSON.parse(await fs.readFile(path.join(root, 'spec-runner.config.json'), 'utf8'));
        await fs.access(path.resolve(root, configured.$schema));
        assert.equal(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).scripts['spec-runner'], 'cypress-spec-runner');
        await assert.rejects(fs.access(path.join(root, 'config-loaded.txt')));
        await assert.rejects(fs.access(path.join(root, 'node_modules/typescript')));
        await assert.rejects(fs.access(path.join(root, 'node_modules/vite')));
        const configFile = path.join(root, 'spec-runner.config.json');
        const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
        config.browsers = ['electron'];
        config.profiles[0].env = { EXAMPLE_SETTING: '${EXAMPLE_LOCAL_VALUE}' };
        await fs.writeFile(configFile, JSON.stringify(config));
        await fs.writeFile(path.join(root, '.env'), 'EXAMPLE_LOCAL_VALUE=fixture-value');
        const harness = path.join(root, 'package-main.cjs');
        for (const file of ['package-main.cjs', 'package-run-check.cjs', 'package-split-check.cjs', 'package-history-check.cjs', 'package-progress-check.cjs']) await fs.copyFile(path.join(__dirname, '../tests/fixtures', file), path.join(root, file));
        const requireFromPackage = require('node:module').createRequire(path.join(installed, 'package.json'));
        const electron = requireFromPackage('electron');
        const env = { ...process.env, SPEC_RUNNER_PROJECT: root, SPEC_RUNNER_NODE: process.execPath, SPEC_RUNNER_PACKAGE: installed };
        delete env.ELECTRON_RUN_AS_NODE;
        const output = await execute(electron, [...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless'] : []), '--disable-gpu', harness], root, env);
        const line = output.split('\n').find(line => line.startsWith('PACKAGED_RUN:'));
        assert.ok(line, output);
        const state = JSON.parse(line.slice('PACKAGED_RUN:'.length));
        const result = JSON.parse(state.output);
        assert.equal(result.value, 'fixture-value');
        assert.ok(result.args.includes('cypress/e2e/example.cy.ts'));
        assert.ok(result.args.includes('--posix-exit-codes'));
        assert.equal(path.dirname(state.logPath), state.artifactDirectory);
        const artifactConfig = JSON.parse(result.args[result.args.indexOf('--config') + 1]);
        assert.equal(artifactConfig.downloadsFolder, path.join(state.artifactDirectory, 'downloads'));
        assert.equal(await fs.readFile(state.logPath, 'utf8'), state.output);
        assert.equal(new Set(state.matrix.map(run => run.artifactDirectory)).size, 3);
        for (const run of state.matrix) {
            assert.equal(await fs.readFile(run.logPath, 'utf8'), run.output);
            const args = JSON.parse(run.output).args;
            assert.equal(run.isolateArtifacts, false);
            assert.ok(!args.join(' ').includes('screenshotsFolder'));
            assert.ok(args.includes('--posix-exit-codes'));
            assert.equal(args[args.indexOf('--browser') + 1], run.browser);
        }
        assert.equal(state.results.total, 1); assert.equal(state.results.specs[0].tests[0].attempts, 2);
        const restartEnv = { ...env, SPEC_RUNNER_SMOKE_PHASE: 'history' };
        const restartArgs = [...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless'] : []), '--disable-gpu', harness];
        if (process.platform === 'win32') {
            delete restartEnv.SPEC_RUNNER_PROJECT;
            restartArgs.push(`--spec-runner-project=${root}`);
        }
        const reopened = await execute(electron, restartArgs, process.platform === 'win32' ? os.tmpdir() : root, restartEnv);
        assert.match(reopened, /HISTORY_REOPENED:/);
        console.log('PASS: packed package installed in a separate Cypress project, initialized, launched its real desktop/main/preload API, ran the project CLI with local environment values, saved the complete log, and opened its existing path with browser restrictions enforced and without consumer build tools. A four-run matrix validated atomic submission, queuing, renaming, immediate queued cancellation, retained totals and independent logs. A split matrix executed seven specs exactly once across four workers, and file changes reached the refresh indicator. Live progress before completion, failed-spec reruns for exact matrix targets and saved History, Module API results, custom browser channels/local bindings, local/shared presets, owned artifact actions and history across an app restart passed.');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
}
module.exports = { archiveFilename, installArguments };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
