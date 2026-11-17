exports.cli = { parseRunArguments: async args => {
    if (args[0] !== 'cypress' || args[1] !== 'run') throw Error('Module parser prefix missing');
    return { args: args.slice(1), configFile: args.includes('--config-file') ? args[args.indexOf('--config-file') + 1] : 'cypress.config.cjs' };
} };
exports.run = async options => {
    if (options.project !== process.cwd()) throw Error('Module API project root missing');
    const fs = require('node:fs'), path = require('node:path'), args = options.args;
    console.log(JSON.stringify({ args, value: process.env.EXAMPLE_SETTING }));
    const specs = args[args.indexOf('--spec') + 1].split(','), folder = process.env.SPEC_RUNNER_ARTIFACTS_DIR;
    fs.mkdirSync(folder, { recursive: true });
    const screenshot = path.join(folder, 'screenshot.png'); fs.writeFileSync(screenshot, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64'));
    const config = require(options.configFile), handlers = {};
    await config.e2e.setupNodeEvents((event, handler) => { handlers[event] = handler; }, { configFile: options.configFile, env: {} });
    await handlers['before:run']({ specs: specs.map(relative => ({ relative })) });
    const runs = [];
    for (const relative of specs) {
        const spec = { relative }, failed = relative.endsWith('failed.cy.ts');
        await handlers['before:spec'](spec);
        const run = { spec, stats: { passes: failed ? 0 : 1, failures: failed ? 1 : 0, pending: 0, skipped: 0, wallClockDuration: 35 }, tests: [{ title: ['Example', failed ? 'fails' : 'passes after retry'], state: failed ? 'failed' : 'passed', attempts: [{ state: 'failed', wallClockDuration: 10 }, { state: failed ? 'failed' : 'passed', wallClockDuration: 25 }] }], screenshots: [{ path: screenshot }], video: null };
        runs.push(run); await handlers['after:spec'](spec, run); await new Promise(resolve => setTimeout(resolve, 35));
    }
    await new Promise(resolve => setTimeout(resolve, 150)); await handlers['after:run']({});
    const failed = runs.reduce((sum, run) => sum + run.stats.failures, 0);
    return { totalTests: specs.length, totalPassed: specs.length - failed, totalFailed: failed, totalPending: 0, totalSkipped: 0, totalDuration: 150, config: { env: { TOKEN: 'raw_config_secret_do_not_store' } }, runs };
};
