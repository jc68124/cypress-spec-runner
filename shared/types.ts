export const browsers = ['chrome', 'electron', 'edge', 'firefox'] as const;
export interface RunProfile {
    id: string;
    name: string;
    baseUrl?: string;
    args: string[];
    env: Record<string, string>;
}
export interface ProjectConfig {
    $schema?: string;
    version: 1;
    name: string;
    configFile: string | null;
    specPattern: string[];
    excludeSpecPattern: string[];
    envFile: string | null;
    profiles: RunProfile[];
    defaultProfile: string;
}
export interface Category { id: string; name: string; specs: string[] }
export interface CategoryFile { version: 1; categories: Category[] }
export interface Project {
    root: string;
    config: ProjectConfig;
    configRevision: string;
    specs: string[];
    categories: Category[];
    revision: string;
    initialized: boolean;
}
export interface SaveResult { project: Project; changedFiles: string[] }
export interface RunOptions { specs: string[]; profile: string; browser: typeof browsers[number]; headed: boolean }
export interface RunState {
    status: 'idle' | 'running' | 'stopping' | 'passed' | 'failed' | 'stopped';
    output: string;
    command: string;
    exitCode: number | null;
    outputTruncated: boolean;
    outputStartLine: number;
    logPath: string | null;
    logError: string | null;
}
export interface RunnerAPI {
    project(): Promise<Project>;
    refresh(): Promise<Project>;
    initialize(config?: ProjectConfig): Promise<SaveResult>;
    saveConfig(config: ProjectConfig, revision: string): Promise<SaveResult>;
    saveCategories(categories: Category[], revision: string): Promise<SaveResult>;
    preview(options: RunOptions): Promise<string>;
    run(options: RunOptions): Promise<RunState>;
    stop(): Promise<void>;
    saveLog(): Promise<boolean>;
    state(): Promise<RunState>;
    onRunState(listener: (state: RunState) => void): () => void;
    copy(text: string): Promise<void>;
}
