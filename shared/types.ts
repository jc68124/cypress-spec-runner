export const browsers = ['chrome', 'electron', 'edge', 'firefox'] as const;
export type Browser = typeof browsers[number];
export interface RunProfile {
    id: string;
    name: string;
    baseUrl?: string;
    args: string[];
    env: Record<string, string>;
    maxConcurrentRuns?: number;
    concurrencyGroup?: string;
}
export interface ConcurrencyGroup { id: string; name: string; maxConcurrentRuns: number }
export interface ProjectConfig {
    $schema?: string;
    version: 1;
    name: string;
    configFile: string | null;
    specPattern: string[];
    excludeSpecPattern: string[];
    envFile: string | null;
    browsers?: Browser[];
    maxConcurrentRuns?: number;
    concurrencyGroups?: ConcurrencyGroup[];
    profiles: RunProfile[];
    defaultProfile: string;
}
export function availableBrowsers(config: ProjectConfig): readonly Browser[] { return config.browsers ?? browsers; }
export interface Category { id: string; name: string; specs: string[] }
export interface CategoryFile { version: 1; categories: Category[] }
export interface Project {
    root: string;
    config: ProjectConfig;
    configRevision: string;
    specs: string[];
    specModifiedTimes: Record<string, number>;
    categories: Category[];
    revision: string;
    initialized: boolean;
}
export interface SaveResult { project: Project; changedFiles: string[] }
export interface RunOptions { specs: string[]; profile: string; browser: Browser; headed: boolean }
export interface MatrixOptions { specs: string[]; profiles: string[]; browsers: Browser[]; headed: boolean }
export interface RunDetails { name: string; notes: string }
export interface RunBatch {
    id: string;
    revision: number;
    name: string;
    createdAt: number;
    profiles: { id: string; name: string }[];
    browsers: Browser[];
    specCount: number;
    statuses: Record<string, RunJob['status']>;
    removed?: boolean;
}
export interface MatrixResult { batch: RunBatch; runs: RunJob[] }
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
export interface RunJob extends Omit<RunState, 'status'> {
    id: string;
    revision: number;
    number: number;
    batchId: string;
    name: string;
    notes: string;
    removed?: boolean;
    status: RunState['status'] | 'queued' | 'cancelled';
    profileId: string;
    profileName: string;
    browser: Browser;
    headed: boolean;
    specs: string[];
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    waitReason: string | null;
    artifactDirectory: string;
}
export interface RunnerAPI {
    project(): Promise<Project>;
    refresh(): Promise<Project>;
    initialize(config?: ProjectConfig): Promise<SaveResult>;
    saveConfig(config: ProjectConfig, revision: string): Promise<SaveResult>;
    saveCategories(categories: Category[], revision: string): Promise<SaveResult>;
    preview(options: RunOptions): Promise<string>;
    run(options: RunOptions): Promise<RunJob>;
    runMatrix(options: MatrixOptions): Promise<MatrixResult>;
    previewMatrix(options: MatrixOptions): Promise<string>;
    batches(): Promise<RunBatch[]>;
    updateRun(id: string, details: RunDetails): Promise<RunJob>;
    renameBatch(id: string, name: string): Promise<RunBatch>;
    closeBatch(id: string): Promise<void>;
    runs(): Promise<RunJob[]>;
    stop(id: string): Promise<void>;
    closeRun(id: string): Promise<void>;
    openLog(id: string): Promise<void>;
    copyOutput(id: string): Promise<void>;
    state(id: string): Promise<RunJob>;
    onRunState(listener: (state: RunJob) => void): () => void;
    onBatchState(listener: (state: RunBatch) => void): () => void;
    copy(text: string): Promise<void>;
}
