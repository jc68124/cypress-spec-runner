import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export async function fixture(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cypress-runner-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, 'node_modules/cypress/bin'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'example-project', devDependencies: { cypress: '16.0.0' } }));
    await writeFile(path.join(root, 'node_modules/cypress/package.json'), JSON.stringify({ name: 'cypress', version: '16.0.0', bin: { cypress: 'bin/cypress' } }));
    await writeFile(path.join(root, 'node_modules/cypress/bin/cypress'), "console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),value:process.env.EXAMPLE_SETTING,asNode:process.env.ELECTRON_RUN_AS_NODE??null}));");
    await mkdir(path.join(root, 'cypress/e2e/features'), { recursive: true });
    await writeFile(path.join(root, 'cypress/e2e/features/Example.cy.ts'), '');
    await writeFile(path.join(root, 'cypress/e2e/features/helper.ts'), '');
    await writeFile(path.join(root, 'cypress.config.ts'), 'export default {};');
    return realpath(root);
}
