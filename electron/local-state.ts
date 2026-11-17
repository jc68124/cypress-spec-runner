import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { LocalState } from '../shared/types';
import { validatePresets } from '../shared/presets';
const limit = 5 * 1024 * 1024;
export async function readJsonFile(filename: string, fallback: unknown, root?: string): Promise<unknown> {
    try { if (root) { const actual = await realpath(filename), base = await realpath(root); if (!actual.startsWith(base + path.sep)) throw Error('Local runner data must stay inside this checkout.'); } if ((await stat(filename)).size > limit) throw Error('Local data exceeds the 5 MiB limit.'); return JSON.parse(await readFile(filename, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
export async function safeDirectory(root: string, directory: string): Promise<void> {
    const base = await realpath(root);
    if (path.resolve(directory) !== base && !path.resolve(directory).startsWith(base + path.sep)) throw Error('Local runner data must stay inside this checkout.');
    let ancestor = directory;
    while (true) { try { const actual = await realpath(ancestor); if (actual !== base && !actual.startsWith(base + path.sep)) throw Error('Local runner data must stay inside this checkout.'); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = path.dirname(ancestor); } }
    await mkdir(directory, { recursive: true });
    const canonical = await realpath(directory);
    if (canonical !== base && !canonical.startsWith(base + path.sep)) throw Error('Local runner data must stay inside this checkout.');
}
export async function writeJsonFile(root: string, filename: string, value: unknown): Promise<void> {
    const text = JSON.stringify(value, null, 4) + '\n';
    if (Buffer.byteLength(text) > limit) throw Error('Local data exceeds the 5 MiB limit.');
    await safeDirectory(root, path.dirname(filename));
    try { if ((await lstat(filename)).isSymbolicLink()) throw Error('Local data files cannot be symbolic links.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const temporary = path.join(path.dirname(filename), `.${randomUUID()}.tmp`);
    try { await writeFile(temporary, text, { flag: 'wx', mode: 0o600 }); await rename(temporary, filename); } finally { await unlink(temporary).catch(() => {}); }
}
function revision(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function normalize(input: any): Omit<LocalState, 'revision'> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Local settings must be a JSON object.');
    const value = { browserPaths: input.browserPaths === undefined ? {} : input.browserPaths, presets: input.presets === undefined ? [] : input.presets };
    if (!value || (!value.browserPaths || typeof value.browserPaths !== 'object') || Array.isArray(value.browserPaths) || Object.entries(value.browserPaths).length > 50 || Object.entries(value.browserPaths).some(([key, val]) => !/^[a-zA-Z0-9_-]{1,100}$/.test(key) || typeof val !== 'string' || val.length > 2000 || /[\x00\r\n]/.test(val) || (val !== '' && !path.isAbsolute(val)))) throw Error('Browser paths must be local absolute executable paths.');
    return { browserPaths: { ...value.browserPaths }, presets: validatePresets(value.presets) };
}
export async function loadLocal(root: string): Promise<LocalState> {
    const filename = path.join(root, '.spec-runner/local.json');
    const value = normalize(await readJsonFile(filename, { browserPaths: {}, presets: [] }, root));
    return { ...value, revision: revision(value) };
}
let writing = false;
export async function saveLocal(root: string, state: LocalState): Promise<{ state: LocalState; changedFiles: string[] }> {
    if (writing) throw Error('Wait for the current local save to finish.');
    writing = true;
    try {
        const value = normalize(state), current = await loadLocal(root);
        if (state.revision !== current.revision) throw Error('Local settings changed. Refresh the project before saving again.');
        let ignore = ''; try { ignore = await readFile(path.join(root, '.gitignore'), 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        const changedFiles: string[] = [];
        try { if ((await lstat(path.join(root, '.gitignore'))).isSymbolicLink()) throw Error('The Git ignore file cannot be a symbolic link.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (!ignore.split(/\r?\n/).some(line => ['.spec-runner/local.json', '/.spec-runner/local.json'].includes(line))) {
            await writeFile(path.join(root, '.gitignore'), ignore + (ignore.endsWith('\n') || !ignore ? '' : '\n') + '.spec-runner/local.json\n'); changedFiles.push('.gitignore');
        }
        await writeJsonFile(root, path.join(root, '.spec-runner/local.json'), value);
        return { state: { ...value, revision: revision(value) }, changedFiles };
    } finally { writing = false; }
}
