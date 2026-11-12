import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import type { ProjectConfig } from '../shared/types';

export async function runEnvironment(root: string, config: ProjectConfig, profileId: string, runtime: NodeJS.ProcessEnv = {}): Promise<NodeJS.ProcessEnv> {
    let local: NodeJS.ProcessEnv = {};
    if (config.envFile) {
        try {
            const file = await realpath(path.join(root, config.envFile));
            const canonicalRoot = await realpath(root);
            if (!file.startsWith(canonicalRoot + path.sep)) throw Error('The environment file resolves outside this project.');
            local = parseEnv(await readFile(file, 'utf8'));
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const env: NodeJS.ProcessEnv = { ...local, ...process.env, ...runtime };
    const profile = config.profiles.find(profile => profile.id === profileId);
    if (!profile) throw Error('The selected profile no longer exists.');
    for (const [key, value] of Object.entries(profile.env)) {
        env[key] = value.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name: string) => {
            if (env[name] === undefined) throw Error(`Environment variable ${name} is missing. Set it locally before running.`);
            return env[name]!;
        });
    }
    Object.assign(env, runtime);
    env.FORCE_COLOR = '1';
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NO_COLOR;
    return env;
}
