#!/usr/bin/env node
const path = require('node:path');
const { spawn } = require('node:child_process');
const ownPackage = require('../package.json');

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Cypress Spec Runner\n\n  cypress-spec-runner [--project <folder>]\n  cypress-spec-runner init [--project <folder>]\n\nRun from a Cypress project. Configure profiles and environments in Settings.'); return;
    }
    if (args.includes('--version')) { console.log(ownPackage.version); return; }
    let directory = process.cwd(), initialize = false;
    for (let index = 0; index < args.length; index++) {
        if (args[index] === 'init') initialize = true;
        else if (args[index] === '--project' && args[index + 1]) directory = path.resolve(args[++index]);
        else throw Error(`Unknown argument: ${args[index]}. Use --help for usage.`);
    }
    const { findProject, initializeProject } = require('../out/electron/project.js');
    const project = await findProject([directory]);
    if (!project) throw Error('No Cypress project found. Run from the project folder after installing its dependencies.');
    if (initialize) {
        const result = await initializeProject(project.root);
        console.log(result.changedFiles.length ? 'Project setup saved. Commit these files to share the setup:\n' + result.changedFiles.map(file => '  ' + file).join('\n') : 'This project is already initialized.');
        console.log('\nStart with your package manager’s spec-runner script. Configure environments in Settings.'); return;
    }
    const electronPackage = require.resolve('electron/package.json');
    // Invoke Electron's supported CLI so its binary can be installed on first use.
    const child = spawn(process.execPath, [path.join(path.dirname(electronPackage), 'cli.js'), path.resolve(__dirname, '..')], {
        cwd: project.root, stdio: 'inherit', shell: false,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, SPEC_RUNNER_PROJECT: project.root, SPEC_RUNNER_NODE: process.execPath },
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
