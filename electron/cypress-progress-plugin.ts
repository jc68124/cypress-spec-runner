// Loaded by Cypress's config process. Built-ins only; the consuming project needs no plugin setup.
import http from 'node:http';
import type { ProgressEvent } from '../shared/progress';
type Endpoint = { port: number; token: string };
type On = (event: string, handler: (...args: any[]) => any) => any;
async function send(endpoint: Endpoint, event: ProgressEvent): Promise<void> {
    // Progress is best-effort. Losing the desktop connection must never fail a test or a user hook.
    try {
        const data = JSON.stringify(event);
        await new Promise<void>(resolve => {
            const request = http.request({ hostname: '127.0.0.1', port: endpoint.port, method: 'POST', path: '/', headers: { authorization: endpoint.token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, response => { response.resume(); response.once('end', resolve); });
            request.once('error', () => resolve()); request.setTimeout(750, () => { request.destroy(); resolve(); }); request.end(data);
        });
    } catch { /* Preserve the Cypress outcome when progress cannot be sent. */ }
}
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
function eventData(event: string, args: any[]): ProgressEvent {
    if (event === 'before:run') return Array.isArray(args[0]?.specs) ? { type: event, specs: args[0].specs.map((spec: any) => spec.relative).filter((spec: unknown) => typeof spec === 'string') } : { type: 'ready' };
    if (event === 'before:spec') return { type: event, spec: args[0]?.relative };
    if (event === 'after:run') return { type: event };
    const result = args[1];
    return { type: 'after:spec', spec: args[0]?.relative, ...(result ? { result: { passed: count(result.stats?.passes), failed: count(result.stats?.failures), pending: count(result.stats?.pending), skipped: count(result.stats?.skipped), duration: count(result.stats?.wallClockDuration ?? result.stats?.duration), ...(result.error ? { error: String(result.error).slice(0, 1000) } : {}) } } : {}) };
}
export function withProgress(base: any, endpoint: Endpoint, originalFile: string | false): any {
    if (!base || typeof base !== 'object' || Array.isArray(base) || typeof base.then === 'function') throw Error('Cypress configuration must export an object.');
    const original = base.e2e?.setupNodeEvents;
    return { ...base, e2e: { ...base.e2e, async setupNodeEvents(this: unknown, on: On, config: any) {
        const events = new Set(['before:run', 'before:spec', 'after:spec', 'after:run']), registered = new Set<string>();
        const decorate: On = (event, handler) => {
            if (!events.has(event) || typeof handler !== 'function') return on(event, handler);
            registered.add(event);
            // Keep Cypress's own replacement semantics, original hook order, return values and errors.
            return on(event, async function(this: unknown, ...args: any[]) {
                await send(endpoint, eventData(event, args));
                return handler.apply(this, args);
            });
        };
        Object.assign(decorate, on);
        const wrapperFile = config.configFile;
        config.configFile = originalFile;
        let result;
        try { result = original ? await original.call(this, decorate, config) : undefined; }
        finally { config.configFile = wrapperFile; }
        for (const event of events) if (!registered.has(event)) on(event, (...args: any[]) => send(endpoint, eventData(event, args)));
        await send(endpoint, { type: 'ready' });
        // A user returning the full config should not appear to change Cypress's read-only configFile.
        return result && typeof result === 'object' && result.configFile === originalFile ? { ...result, configFile: wrapperFile } : result;
    } } };
}
