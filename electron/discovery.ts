import { parse } from '@babel/parser';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig, SpecDiscovery } from '../shared/types';

export const defaultSpecPattern = ['cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'];
export const defaultExclusions = ['*.hot-update.js'];
const unknown = Symbol('dynamic configuration');
type Syntax = { type: string; [key: string]: any };
type Value = Syntax | typeof unknown | undefined;
const keyName = (node: Syntax) => node?.type === 'Identifier' ? node.name : node?.type === 'StringLiteral' ? node.value : undefined;

// Read only the exported data we need. Config imports, functions and hooks never execute.
export function configPatterns(source: string): { specPattern: string[]; excludeSpecPattern: string[] } {
    const program = parse(source, { sourceType: 'unambiguous', plugins: ['typescript'], attachComment: false }).program;
    const constants = new Map<string, Syntax>(), helpers = new Set(['defineConfig']);
    let exported: Value = unknown;
    for (const statement of program.body as Syntax[]) {
        if (statement.type === 'ImportDeclaration' && statement.source.value === 'cypress') for (const item of statement.specifiers) if (keyName(item.imported) === 'defineConfig') helpers.add(item.local.name);
        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
        if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') for (const item of declaration.declarations) if (item.id.type === 'Identifier' && item.init) constants.set(item.id.name, item.init);
        if (statement.type === 'ExportDefaultDeclaration' || statement.type === 'TSExportAssignment') exported = statement.declaration ?? statement.expression;
        const expression = statement.type === 'ExpressionStatement' ? statement.expression : null;
        if (expression?.type === 'AssignmentExpression') {
            const left = expression.left;
            if (left.type === 'MemberExpression' && left.object.type === 'Identifier' && left.object.name === 'module' && keyName(left.property) === 'exports') exported = expression.right;
            else if (left.type === 'MemberExpression' && ['specPattern', 'excludeSpecPattern', 'e2e'].includes(keyName(left.property))) throw Error('Spec discovery is changed by executable configuration.');
        }
    }
    function unwrap(value: Value, depth = 0): Value {
        if (!value || value === unknown || depth > 64) return depth > 64 ? unknown : value;
        if (['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(value.type)) return unwrap(value.expression, depth + 1);
        if (value.type === 'Identifier') return constants.has(value.name) ? unwrap(constants.get(value.name), depth + 1) : unknown;
        if (value.type === 'CallExpression' && (helpers.has(value.callee.name) || (value.callee.type === 'MemberExpression' && keyName(value.callee.property) === 'defineConfig'))) return unwrap(value.arguments[0], depth + 1);
        return value;
    }
    function property(value: Value, name: string, depth = 0): Value {
        const object = unwrap(value);
        if (!object) return undefined;
        if (object === unknown || object.type !== 'ObjectExpression' || depth > 64) return unknown;
        let result: Value;
        for (const item of object.properties) {
            if (item.type === 'SpreadElement') { const spread = property(item.argument, name, depth + 1); if (spread !== undefined) result = spread; }
            else if (item.computed && item.key.type !== 'StringLiteral') result = unknown;
            else if (keyName(item.key) === name) result = item.type === 'ObjectProperty' ? item.value : unknown;
        }
        return result;
    }
    function strings(value: Value, fallback: string[], depth = 0): string[] {
        const node = unwrap(value);
        if (node === undefined) return [...fallback];
        if (node === unknown || depth > 64) throw Error('Spec patterns cannot be resolved without executing this config.');
        if (node.type === 'StringLiteral') return [node.value];
        if (node.type === 'TemplateLiteral' && !node.expressions.length) return [node.quasis[0].value.cooked];
        if (node.type === 'ArrayExpression') return node.elements.flatMap((item: Syntax) => strings(item?.type === 'SpreadElement' ? item.argument : item ?? unknown, [], depth + 1));
        throw Error('Spec patterns cannot be resolved without executing this config.');
    }
    const e2e = property(exported, 'e2e');
    if (e2e === unknown) throw Error('The exported Cypress configuration is dynamic.');
    return { specPattern: strings(property(e2e, 'specPattern'), defaultSpecPattern), excludeSpecPattern: strings(property(e2e, 'excludeSpecPattern'), defaultExclusions) };
}
function validPatterns(patterns: string[]): boolean {
    return patterns.every(pattern => typeof pattern === 'string' && !!pattern && !path.posix.isAbsolute(pattern) && !/[\\:\x00\r\n]/.test(pattern) && !pattern.startsWith('!') && !pattern.split('/').some(part => part === '..' || part === '.'));
}
export async function specDiscovery(root: string, config: ProjectConfig): Promise<SpecDiscovery> {
    if (config.specPattern !== undefined) return { source: 'override', configFile: config.configFile, specPattern: [...config.specPattern], excludeSpecPattern: [...(config.excludeSpecPattern ?? defaultExclusions)] };
    let filename = config.configFile;
    if (!filename) for (const candidate of ['cypress.config.ts', 'cypress.config.js', 'cypress.config.mjs', 'cypress.config.cjs']) {
        try { await access(path.join(root, candidate)); filename = candidate; break; } catch { /* Try the next config. */ }
    }
    if (!filename) return { source: 'defaults', configFile: null, specPattern: [...defaultSpecPattern], excludeSpecPattern: [...defaultExclusions] };
    try {
        const file = await realpath(path.join(root, filename)), canonicalRoot = await realpath(root);
        if (!file.startsWith(canonicalRoot + path.sep)) throw Error('The Cypress config must be inside this project.');
        if ((await stat(file)).size > 1024 * 1024) throw Error('The Cypress config is too large to inspect.');
        const patterns = configPatterns(await readFile(file, 'utf8'));
        if (config.excludeSpecPattern !== undefined) patterns.excludeSpecPattern = [...config.excludeSpecPattern];
        if (!validPatterns(patterns.specPattern) || !validPatterns(patterns.excludeSpecPattern)) throw Error('Discovery needs relative patterns inside this project.');
        return { source: 'cypress', configFile: filename, ...patterns };
    } catch (error) {
        return { source: 'cypress', configFile: filename, specPattern: [], excludeSpecPattern: [], warning: `${(error as Error).message} Use the advanced discovery override in Settings, or export literal patterns from the Cypress config.` };
    }
}
