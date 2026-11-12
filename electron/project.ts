import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { specDiscovery } from './discovery';
import type { SpecDiscovery } from '../shared/types';
import { availableBrowsers, browsers, type Category, type CategoryFile, type Project, type ProjectConfig, type RunOptions, type SaveResult } from '../shared/types';

export const configPath = 'spec-runner.config.json';
export const categoryPath = '.spec-runner/categories.json';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 4) + '\n';
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;

export function relativePath(value: unknown): value is string {
    return typeof value === 'string' && !!value && !path.posix.isAbsolute(value) && !value.includes('\\')
        && !/[:\x00\r\n]/.test(value) && !value.split('/').some(part => !part || part === '..' || part === '.');
}
export function literalSpec(value: unknown): value is string {
    return relativePath(value) && !/[,\[\]{}!*?"`$|<>^%;]/.test(value);
}
export async function defaults(root: string): Promise<ProjectConfig> {
    let configFile: string | null = null;
    for (const file of ['cypress.config.ts', 'cypress.config.js', 'cypress.config.mjs', 'cypress.config.cjs']) {
        try { await access(path.join(root, file)); configFile = file; break; } catch { /* Try the next extension. */ }
    }
    return { $schema: `./node_modules/${require('../../package.json').name}/schema.json`, version: 1, name: 'Cypress project', configFile,
        envFile: '.env', maxConcurrentRuns: 2, concurrencyGroups: [], browsers: [...browsers], profiles: [{ id: 'default', name: 'Default', args: [], env: {} }], defaultProfile: 'default' };
}
export function validateConfig(value: unknown): ProjectConfig {
    const config = value as ProjectConfig;
    if (!config || config.version !== 1 || typeof config.name !== 'string' || !config.name.trim() || config.name.length > 100) throw Error('Project settings need version 1 and a project name of 1–100 characters.');
    for (const field of ['configFile', 'envFile'] as const) {
        if (config[field] !== null && !relativePath(config[field])) throw Error(`${field} must be a relative path inside this project, or null.`);
    }
    for (const field of ['specPattern', 'excludeSpecPattern'] as const) {
        if (config[field] === undefined) continue;
        if (!Array.isArray(config[field]) || (field === 'specPattern' && !config[field].length)
            || config[field].some(pattern => !relativePath(pattern) || pattern.startsWith('!'))) throw Error(`${field} must contain project-relative glob patterns. Use exclusions to omit files.`);
    }
    if (config.browsers !== undefined && (!Array.isArray(config.browsers) || !config.browsers.length
        || config.browsers.some(browser => !browsers.includes(browser)) || new Set(config.browsers).size !== config.browsers.length)) throw Error('Choose at least one supported browser, without duplicates.');
    const validLimit = (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 8;
    if (config.maxConcurrentRuns !== undefined && !validLimit(config.maxConcurrentRuns)) throw Error('The overall concurrency limit must be an integer from 1 to 8.');
    const groups = config.concurrencyGroups === undefined ? [] : config.concurrencyGroups;
    if (!Array.isArray(groups)) throw Error('Concurrency groups must be a list.');
    const groupIds = new Set<string>(), groupNames = new Set<string>();
    for (const group of groups) {
        if (!group || typeof group.id !== 'string' || !idPattern.test(group.id) || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 100
            || !validLimit(group.maxConcurrentRuns) || groupIds.has(group.id) || groupNames.has(group.name.trim().toLowerCase())) throw Error('Concurrency groups need unique IDs/names and limits from 1 to 8.');
        groupIds.add(group.id); groupNames.add(group.name.trim().toLowerCase());
    }
    if (!Array.isArray(config.profiles) || !config.profiles.length) throw Error('Create at least one run profile.');
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const profile of config.profiles) {
        if (!profile || typeof profile.id !== 'string' || !idPattern.test(profile.id) || typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 100
            || ids.has(profile.id) || names.has(profile.name.trim().toLowerCase())) throw Error('Each profile needs a unique ID and name.');
        ids.add(profile.id); names.add(profile.name.trim().toLowerCase());
        if (profile.maxConcurrentRuns !== undefined && !validLimit(profile.maxConcurrentRuns)) throw Error('Profile concurrency limits must be integers from 1 to 8.');
        if (profile.concurrencyGroup !== undefined && (typeof profile.concurrencyGroup !== 'string' || !groupIds.has(profile.concurrencyGroup))) throw Error('Choose an existing concurrency group or no group.');
        if (!Array.isArray(profile.args) || profile.args.some(arg => typeof arg !== 'string' || /[\x00\r\n]/.test(arg)
            || arg === '--' || /^(?:--(?:spec|project|browser|headed|e2e|component)|-[sPb])(?:=|$)/.test(arg))) throw Error('Profile arguments must be a list of strings. The runner controls --spec and --project.');
        if (!profile.env || typeof profile.env !== 'object' || Array.isArray(profile.env)
            || Object.entries(profile.env).some(([key, value]) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\x00'))) throw Error('Environment variables must map variable names to string values.');
        if (profile.baseUrl !== undefined && typeof profile.baseUrl !== 'string') throw Error('Base URL must be text.');
    }
    if (typeof config.defaultProfile !== 'string' || !ids.has(config.defaultProfile)) throw Error('Choose an existing default profile.');
    return { ...config, maxConcurrentRuns: config.maxConcurrentRuns ?? 2, concurrencyGroups: groups.map(group => ({ ...group, name: group.name.trim() })), name: config.name.trim(), browsers: [...availableBrowsers(config)], profiles: config.profiles.map(profile => ({ ...profile, maxConcurrentRuns: profile.maxConcurrentRuns ?? 1, name: profile.name.trim() })) };
}
export function validateCategories(value: unknown): CategoryFile {
    const file = value as CategoryFile;
    if (!file || file.version !== 1 || !Array.isArray(file.categories)) throw Error('Category data must have version 1 and a categories list.');
    const ids = new Set<string>(), names = new Set<string>();
    for (const category of file.categories) {
        if (!category || typeof category.id !== 'string' || !idPattern.test(category.id) || ['all', 'uncategorised', 'selected'].includes(category.id)
            || typeof category.name !== 'string' || !category.name.trim() || category.name.length > 100
            || !Array.isArray(category.specs) || category.specs.some(spec => !literalSpec(spec))
            || ids.has(category.id) || names.has(category.name.trim().toLowerCase())) throw Error('Categories need unique names/IDs and literal spec paths inside the project.');
        ids.add(category.id); names.add(category.name.trim().toLowerCase());
    }
    return { version: 1, categories: file.categories.map(category => ({ ...category, name: category.name.trim(), specs: [...new Set(category.specs)].sort() })) };
}
async function readJson(root: string, file: string): Promise<{ value: unknown; revision: string } | null> {
    let text: string;
    try { text = await readFile(path.join(root, file), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    try { return { value: JSON.parse(text), revision: hash(text) }; }
    catch { throw Error(`${file} contains invalid JSON. Fix the file before saving.`); }
}
async function assertProject(directory: string): Promise<string> {
    const root = await realpath(directory);
    await readFile(path.join(root, 'package.json'), 'utf8');
    try { createRequire(path.join(root, 'package.json')).resolve('cypress/package.json'); }
    catch { throw Error('Cypress is not installed in this project. Install its dependencies, then try again.'); }
    return root;
}
export async function discoverSpecs(root: string, config?: ProjectConfig, resolved?: SpecDiscovery): Promise<string[]> {
    const settings = config ?? await defaults(root);
    const discovery = resolved ?? await specDiscovery(root, settings);
    const files = await glob(discovery.specPattern, { cwd: root, dot: true, ignore: [...discovery.excludeSpecPattern.map(pattern => pattern.includes('/') ? pattern : '**/' + pattern), '**/node_modules/**', '.git/**'], nodir: true, follow: false, posix: true });
    const canonicalRoot = await realpath(root);
    const safe: string[] = [];
    for (const file of files) {
        if (!literalSpec(file)) continue;
        const actual = await realpath(path.join(root, file));
        if (actual.startsWith(canonicalRoot + path.sep)) safe.push(file);
    }
    return [...new Set(safe)].sort();
}
export async function loadProject(directory: string): Promise<Project> {
    const root = await assertProject(directory);
    const stored = await readJson(root, configPath);
    const config = stored ? validateConfig(stored.value) : await defaults(root);
    const categories = await readJson(root, categoryPath);
    const discovery = await specDiscovery(root, config);
    const specs = await discoverSpecs(root, config, discovery);
    const modified: [string, number][] = [];
    for (let start = 0; start < specs.length; start += 32) {
        modified.push(...await Promise.all(specs.slice(start, start + 32).map(async (spec): Promise<[string, number]> => {
            try { return [spec, (await stat(path.join(root, spec))).mtimeMs]; }
            catch { return [spec, 0]; } // Missing timestamps sort last; a disappearing file must not prevent refresh.
        })));
    }
    return { root, config, configRevision: stored?.revision ?? 'missing', initialized: stored !== null,
        categories: categories ? validateCategories(categories.value).categories : [], revision: categories?.revision ?? 'missing',
        specs, specModifiedTimes: Object.fromEntries(modified), discovery };
}
export async function findProject(directories: (string | undefined)[]): Promise<Project | null> {
    const tried = new Set<string>();
    for (const directory of directories) {
        if (!directory) continue;
        let candidate = path.resolve(directory);
        while (!tried.has(candidate)) {
            tried.add(candidate);
            try { await assertProject(candidate); return await loadProject(candidate); }
            catch (error) {
                // Invalid saved settings must be reported instead of silently opening a parent project.
                try { await access(path.join(candidate, configPath)); throw error; }
                catch (check) { if (check === error) throw error; }
            }
            const parent = path.dirname(candidate);
            if (parent === candidate) break;
            candidate = parent;
        }
    }
    return null;
}
async function atomicSave(root: string, file: string, value: unknown, revision: string): Promise<void> {
    const current = await readJson(root, file);
    if ((current?.revision ?? 'missing') !== revision) throw Error(`${file} changed on disk. Refresh and reapply your changes.`);
    const filename = path.join(root, file);
    await mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, json(value), { flag: 'wx' }); await rename(temporary, filename); }
    finally { await unlink(temporary).catch(() => undefined); }
}
export async function saveCategories(root: string, categories: Category[], revision: string): Promise<SaveResult> {
    await atomicSave(root, categoryPath, validateCategories({ version: 1, categories }), revision);
    return { project: await loadProject(root), changedFiles: [categoryPath] };
}
export async function saveConfig(root: string, config: ProjectConfig, revision: string): Promise<SaveResult> {
    const validated = validateConfig(config);
    await atomicSave(root, configPath, validated, revision);
    const changedFiles = [configPath];
    if (validated.envFile) {
        let ignore = '';
        try { ignore = await readFile(path.join(root, '.gitignore'), 'utf8'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (!ignore.split(/\r?\n/).some(line => line === validated.envFile || line === '/' + validated.envFile)) {
            await writeFile(path.join(root, '.gitignore'), ignore + (ignore.endsWith('\n') || !ignore ? '' : '\n') + validated.envFile + '\n');
            changedFiles.push('.gitignore');
        }
    }
    return { project: await loadProject(root), changedFiles };
}
export async function initializeProject(root: string, chosenConfig?: ProjectConfig): Promise<SaveResult> {
    const project = await loadProject(root);
    if (chosenConfig && project.initialized) throw Error('This project has already been configured. Refresh before saving.');
    const config = chosenConfig ? validateConfig(chosenConfig) : project.config;
    const changedFiles: string[] = [];
    const packageFile = path.join(project.root, 'package.json');
    const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
    if (pkg.scripts?.['spec-runner'] && pkg.scripts['spec-runner'] !== 'cypress-spec-runner') throw Error('package.json already has a different spec-runner script. Rename that script before initializing.');
    if (!project.initialized) { await atomicSave(root, configPath, config, 'missing'); changedFiles.push(configPath); }
    if (project.revision === 'missing') {
        const folders = new Map<string, string[]>();
        for (const spec of await discoverSpecs(root, config)) {
            const folder = path.posix.dirname(spec);
            folders.set(folder, [...(folders.get(folder) ?? []), spec]);
        }
        await atomicSave(root, categoryPath, { version: 1, categories: [...folders].map(([folder, specs], index) => ({ id: `group-${index + 1}`, name: folder, specs })) }, 'missing');
        changedFiles.push(categoryPath);
    }
    if (!pkg.scripts?.['spec-runner']) {
        pkg.scripts = { ...pkg.scripts, 'spec-runner': 'cypress-spec-runner' };
        await writeFile(packageFile, json(pkg)); changedFiles.push('package.json');
    }
    let ignore = '';
    try { ignore = await readFile(path.join(root, '.gitignore'), 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const entries = ['node_modules/', '.spec-runner/local.json', 'spec-runner-logs/', ...(config.envFile ? [config.envFile] : [])];
    const missing = entries.filter(entry => !ignore.split(/\r?\n/).some(line => line === entry || line === '/' + entry));
    if (missing.length) { await writeFile(path.join(root, '.gitignore'), ignore + (ignore.endsWith('\n') || !ignore ? '' : '\n') + missing.join('\n') + '\n'); changedFiles.push('.gitignore'); }
    return { project: await loadProject(root), changedFiles };
}
export async function validateRun(root: string, value: unknown, snapshot?: ProjectConfig, discovered?: string[]): Promise<RunOptions> {
    const options = value as RunOptions;
    const project = snapshot ? { config: validateConfig(snapshot), specs: discovered ?? await discoverSpecs(root, snapshot) } : await loadProject(root);
    if (!options || !Array.isArray(options.specs) || !options.specs.length || options.specs.some(spec => !literalSpec(spec))) throw Error('Select at least one valid spec file.');
    if (!project.config.profiles.some(profile => profile.id === options.profile) || !availableBrowsers(project.config).includes(options.browser) || typeof options.headed !== 'boolean') throw Error('Invalid profile, browser, or run options.');
    if (options.specs.some(spec => !project.specs.includes(spec))) throw Error('A selected spec no longer exists or does not match the configured patterns. Refresh your specs.');
    return { ...options, specs: [...new Set(options.specs)].sort() };
}
function configValues(value: string): Record<string, unknown> {
    if (value.trim().startsWith('{')) {
        const parsed = JSON.parse(value);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw Error('Cypress --config must be a JSON object or key=value pairs.');
        return parsed;
    }
    // Commas inside glob braces, JSON arrays, or quoted values are not separators.
    const parts: string[] = [];
    let start = 0, depth = 0, quote = '', escaped = false;
    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (quote) { if (char === quote) quote = ''; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if ('[{'.includes(char)) depth++;
        if (']}'.includes(char)) depth--;
        if (char === ',' && depth === 0) { parts.push(value.slice(start, index)); start = index + 1; }
    }
    parts.push(value.slice(start));
    const config: Record<string, unknown> = Object.create(null);
    for (const part of parts) {
        const equal = part.indexOf('=');
        if (equal < 1) throw Error('Use JSON or key=value pairs for Cypress --config.');
        const key = part.slice(0, equal).trim(), raw = part.slice(equal + 1).trim();
        try { config[key] = JSON.parse(raw); } catch { config[key] = raw; }
    }
    return config;
}
function argumentsFor(options: RunOptions, config: ProjectConfig, expand: (value: string) => string, artifactDirectory?: string): string[] {
    const profile = config.profiles.find(profile => profile.id === options.profile);
    if (!profile) throw Error('The selected profile no longer exists.');
    const source = profile.args.map(expand), args: string[] = [];
    const overrides: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < source.length; index++) {
        if (source[index] === '--config' || source[index] === '-c' || source[index].startsWith('--config=')) {
            const value = ['--config', '-c'].includes(source[index]) ? source[++index] : source[index].slice(9);
            if (!value) throw Error('Supply a value after --config.');
            Object.assign(overrides, configValues(value));
        } else args.push(source[index]);
    }
    if (profile.baseUrl) overrides.baseUrl = expand(profile.baseUrl);
    if (artifactDirectory) Object.assign(overrides, {
        screenshotsFolder: path.join(artifactDirectory, 'screenshots'), videosFolder: path.join(artifactDirectory, 'videos'), downloadsFolder: path.join(artifactDirectory, 'downloads'),
    });
    return ['run', '--e2e', ...(config.configFile ? ['--config-file', config.configFile] : []), ...args,
        ...(Object.keys(overrides).length ? ['--config', JSON.stringify(overrides)] : []), '--browser', options.browser,
        ...(options.headed ? ['--headed'] : []), '--spec', options.specs.join(',')];
}
export function runArguments(options: RunOptions, config: ProjectConfig, environment: NodeJS.ProcessEnv = process.env, artifactDirectory?: string): string[] {
    const expand = (value: string) => value.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) => {
        if (environment[key] === undefined) throw Error(`Environment variable ${key} is missing. Set it locally before running.`);
        return environment[key]!;
    });
    const profile = config.profiles.find(profile => profile.id === options.profile);
    const baseUrl = profile?.baseUrl ? expand(profile.baseUrl) : '';
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw Error('Base URL must start with http:// or https://.');
    return argumentsFor(options, config, expand, artifactDirectory);
}
export function commandPreview(options: RunOptions, config: ProjectConfig, artifactDirectory?: string): string {
    // Keep environment references as references; previews never expand local secret values.
    return 'cypress ' + argumentsFor(options, config, value => value, artifactDirectory).map(arg => JSON.stringify(arg)).join(' ');
}
