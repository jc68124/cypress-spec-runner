import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProgressEvent } from '../shared/progress';

async function packageType(filename: string): Promise<string> {
    let directory = path.dirname(filename);
    for (;;) {
        try { return JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).type === 'module' ? 'module' : 'commonjs'; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        const parent = path.dirname(directory); if (parent === directory) return 'commonjs'; directory = parent;
    }
}
export async function progressConfig(root: string, options: { configFile?: string | false }, directory: string, publish: (event: ProgressEvent) => void): Promise<{ configFile: string; close: () => Promise<void> }> {
    let original: string | false = false;
    if (typeof options.configFile === 'string') original = path.resolve(root, options.configFile);
    else if (options.configFile !== false) {
        const found: string[] = [];
        for (const name of ['cypress.config.ts', 'cypress.config.js', 'cypress.config.mjs', 'cypress.config.cjs', 'cypress.config.mts', 'cypress.config.cts']) {
            try { await access(path.join(root, name)); found.push(path.join(root, name)); } catch { /* Cypress may use defaults without a file. */ }
        }
        if (found.length > 1) throw Error('Multiple Cypress config files found. Choose the intended file in Settings.');
        original = found[0] ?? false;
    }
    const extension = original ? path.extname(original) : '.cjs';
    const type = original ? await packageType(original) : 'commonjs';
    const esm = ['.mjs', '.mts'].includes(extension) || (!['.cjs', '.cts'].includes(extension) && type === 'module');
    const token = randomBytes(32).toString('hex');
    const server = http.createServer((request, response) => {
        if (request.method !== 'POST' || request.url !== '/' || request.headers.authorization !== token) { response.writeHead(403); response.end(); request.resume(); return; }
        let size = 0, chunks: Buffer[] = [];
        request.setTimeout(1500, () => request.destroy());
        request.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 1024 * 1024) { chunks = []; request.destroy(); } else chunks.push(chunk); });
        request.on('end', () => { try { publish(JSON.parse(Buffer.concat(chunks).toString('utf8'))); response.writeHead(204); } catch { response.writeHead(400); } response.end(); });
        request.on('error', () => {});
    });
    server.maxConnections = 4;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const close = () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    try {
        const port = (server.address() as import('node:net').AddressInfo).port;
        const plugin = path.join(__dirname, 'cypress-progress-plugin.js');
        const endpoint = JSON.stringify({ port, token });
        const source = esm
            ? `${original ? `import base from ${JSON.stringify(pathToFileURL(original).href)};` : 'const base = {};'}\nimport bridge from ${JSON.stringify(pathToFileURL(plugin).href)};\nexport default bridge.withProgress(base, ${endpoint}, ${JSON.stringify(original)});\n`
            : `const base = ${original ? `require(${JSON.stringify(original)})` : '{}'};\nmodule.exports = require(${JSON.stringify(plugin)}).withProgress(base.default ?? base, ${endpoint}, ${JSON.stringify(original)});\n`;
        const configFile = path.join(directory, `cypress.config${extension}`);
        await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: esm ? 'module' : 'commonjs' }));
        await writeFile(configFile, source);
        return { configFile, close };
    } catch (error) { await close(); throw error; }
}
