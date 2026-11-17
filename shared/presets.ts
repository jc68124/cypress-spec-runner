import type { ProjectConfig, RunPreset } from './types';
import { availableBrowsers } from './types';
import { matrixRuns } from './runs';
export function validatePresets(value: unknown): RunPreset[] {
    if (!Array.isArray(value) || value.length > 50) throw Error('Keep at most 50 presets.');
    const ids = new Set<string>(), names = new Set<string>();
    return value.map(preset => {
        if (!preset || typeof preset.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(preset.id) || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 100 || /[\x00\r\n]/.test(preset.name) || ids.has(preset.id) || names.has(preset.name.trim().toLowerCase())) throw Error('Presets need unique IDs and names of 1–100 characters.');
        const options = preset.options;
        matrixRuns(options);
        if (options.specs.length > 10000 || options.specs.some((spec: unknown) => typeof spec !== 'string' || !spec || spec.length > 1000 || spec.startsWith('/') || spec.includes('\\') || /[:,\[\]{}!*?"`$|<>^%;\x00\r\n]/.test(spec) || spec.split('/').some(part => !part || part === '..' || part === '.')) || typeof options.headed !== 'boolean' || (options.isolateArtifacts !== undefined && typeof options.isolateArtifacts !== 'boolean')) throw Error('Invalid preset options.');
        ids.add(preset.id); names.add(preset.name.trim().toLowerCase());
        return { id: preset.id, name: preset.name.trim(), options: { specs: [...new Set<string>(options.specs)].sort(), profiles: [...options.profiles], browsers: [...options.browsers], headed: options.headed, isolateArtifacts: options.isolateArtifacts !== false, executionMode: options.executionMode ?? 'repeat' } };
    });
}
export function presetProblems(preset: RunPreset, config: ProjectConfig, specs: string[]): string[] {
    const found = new Set(specs);
    return [...preset.options.profiles.filter(id => !config.profiles.some(profile => profile.id === id)).map(id => `Missing profile: ${id}`),
        ...preset.options.browsers.filter(id => !availableBrowsers(config).includes(id)).map(id => `Unavailable browser: ${id}`),
        ...preset.options.specs.filter(spec => !found.has(spec)).map(spec => `Missing spec: ${spec}`)];
}
