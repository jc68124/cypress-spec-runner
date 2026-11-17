// Runs in a separate plain Node process, using the consuming project's Cypress module.
import { createRequire } from 'node:module';
import path from 'node:path';
import { normalizeResults } from '../shared/results';
import { progressConfig } from './cypress-progress';
let cliOnly = false;
let closeProgress: (() => Promise<void>) | undefined;
async function main() {
    const root = process.cwd(), requireProject = createRequire(path.join(root, 'package.json'));
    const args = process.argv.slice(2), pkg = requireProject('cypress/package.json');
    if (!pkg.main) {
        cliOnly = true;
        // CLI-only Cypress distributions still run, with an explicit unavailable-results state.
        process.send?.({ type: 'results-unavailable', message: 'This Cypress distribution does not expose the Module API. Use the output and log for results.' });
        process.send?.({ type: 'progress', event: { type: 'unavailable', message: 'Live progress is unavailable for this Cypress distribution. Open Raw output to follow this run.' } });
        const cli = path.resolve(path.dirname(requireProject.resolve('cypress/package.json')), pkg.bin.cypress);
        process.argv = [process.execPath, cli, ...args]; requireProject(cli); return;
    }
    const cypress = requireProject('cypress');
    const options = await cypress.cli.parseRunArguments(['cypress', ...args]);
    let configFile = options.configFile;
    if (process.env.SPEC_RUNNER_PROGRESS_DIR) {
        try {
            const bridge = await progressConfig(root, options, process.env.SPEC_RUNNER_PROGRESS_DIR, event => { if (process.connected) process.send?.({ type: 'progress', event }); });
            configFile = bridge.configFile; closeProgress = bridge.close;
        } catch (error) { process.send?.({ type: 'progress', event: { type: 'unavailable', message: `Live progress could not start: ${(error as Error).message}. Open Raw output to follow this run.` } }); }
    } else process.send?.({ type: 'progress', event: { type: 'unavailable', message: 'Live progress could not start. Open Raw output to follow this run.' } });
    const result = await cypress.run({ ...options, configFile, project: root });
    const summary = normalizeResults(result);
    const message = summary ? { type: 'results', summary, completedSpecs: result.runs.length } : { type: 'results-unavailable', message: typeof result?.message === 'string' ? result.message.slice(0, 2000) : 'Cypress did not return completed test results.' };
    // Wait for IPC delivery before disconnecting, including empty suites and launch failures.
    if (process.send) await new Promise<void>(resolve => { process.send!(message, () => resolve()); });
    process.exitCode = summary ? summary.failed > 0 || !!summary.error ? 1 : 0 : 1;
}
void main().catch(async error => {
    console.error(error);
    if (process.send) await new Promise<void>(resolve => { process.send!({ type: 'results-unavailable', message: String(error.message).slice(0, 2000) }, () => resolve()); });
    process.exitCode = 1;
}).finally(async () => {
    await closeProgress?.();
    if (process.connected) process.disconnect();
    if (!cliOnly) {
        // Some module/plugin versions leave Node handles alive after the result.
        // Flush pipe output before exiting so completion never truncates the log.
        await Promise.all([process.stdout, process.stderr].map(stream => new Promise<void>(resolve => stream.write('', () => resolve()))));
        process.exit(process.exitCode ?? 0);
    }
});
