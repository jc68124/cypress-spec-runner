export const browsers = ['chrome', 'electron', 'edge', 'firefox'] as const;
export type Browser = string;
export interface CustomBrowser { id: string; name: string; channel?: string }
export function browserName(config: ProjectConfig, id: string): string { return config.customBrowsers?.find(browser => browser.id === id)?.name ?? id; }
export interface RunPreset { id: string; name: string; options: MatrixOptions }
export interface LocalState { revision: string; browserPaths: Record<string, string>; presets: RunPreset[] }
export interface TestResult { title: string; state: string; duration: number; attempts: number; error?: string }
export interface LiveSpecDetails { tests: TestResult[]; screenshots: string[]; truncated?: boolean }
export interface SpecResult { spec: string; passed: number; failed: number; pending: number; skipped: number; duration: number; tests: TestResult[]; screenshots: string[]; video?: string; error?: string }
export interface RunResults { total: number; passed: number; failed: number; pending: number; skipped: number; duration: number; specs: SpecResult[]; truncated?: boolean; error?: string; failedSpecs?: string[]; failedSpecsComplete?: boolean }
export type RerunMode = 'all' | 'failed-specs';
export interface ProgressSpec { spec: string; state: 'waiting' | 'running' | 'passed' | 'failed' | 'skipped' | 'unknown'; passed: number; failed: number; pending: number; skipped: number; duration: number; error?: string; hasDetails?: boolean }
export interface RunProgress { phase: 'starting' | 'running' | 'finishing' | 'complete' | 'unavailable'; total: number; completed: number; currentSpec?: string; passed: number; failed: number; pending: number; skipped: number; specs: ProgressSpec[]; truncated?: boolean; message?: string }
export interface HistoryEntry { id: string; name: string; groupName: string; profileId: string; profileName: string; browser: string; browserName: string; status: 'passed' | 'failed' | 'stopped'; createdAt: number; finishedAt: number; duration: number; specCount: number; counts?: Pick<RunResults, 'total' | 'passed' | 'failed' | 'pending' | 'skipped'> }
export interface HistoryDetail extends HistoryEntry { specs: string[]; headed: boolean; isolateArtifacts: boolean; notes: string; logPath: string | null; logError?: string | null; results?: RunResults; resultsError?: string }
export interface HistoryList { entries: HistoryEntry[]; error?: string }

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
    specPattern?: string[];
    excludeSpecPattern?: string[];
    envFile: string | null;
    browsers?: Browser[];
    customBrowsers?: CustomBrowser[];
    presets?: RunPreset[];
    maxConcurrentRuns?: number;
    concurrencyGroups?: ConcurrencyGroup[];
    profiles: RunProfile[];
    defaultProfile: string;
}
export function availableBrowsers(config: ProjectConfig): readonly Browser[] { return config.browsers ?? browsers; }
export interface Category { id: string; name: string; specs: string[] }
export interface CategoryFile { version: 1; categories: Category[] }
export interface SpecDiscovery { source: 'cypress' | 'defaults' | 'override'; configFile: string | null; specPattern: string[]; excludeSpecPattern: string[]; warning?: string }
export interface Project {
    root: string;
    local?: LocalState;
    config: ProjectConfig;
    configRevision: string;
    specs: string[];
    specModifiedTimes: Record<string, number>;
    discovery?: SpecDiscovery;
    cypressVersion?: string;
    categories: Category[];
    revision: string;
    initialized: boolean;
}
export interface SaveResult { project: Project; changedFiles: string[] }
export interface RunOptions { specs: string[]; profile: string; browser: Browser; headed: boolean; isolateArtifacts?: boolean; browserTarget?: string }
export type ExecutionMode = 'repeat' | 'split';
export interface MatrixOptions { specs: string[]; profiles: string[]; browsers: Browser[]; headed: boolean; isolateArtifacts?: boolean; executionMode?: ExecutionMode }
export interface RunDetails { name: string; notes: string }
export interface RunBatch {
    id: string;
    revision: number;
    name: string;
    createdAt: number;
    profiles: { id: string; name: string }[];
    browsers: Browser[];
    browserNames?: Record<string, string>;
    specCount: number;
    executionMode?: ExecutionMode;
    failedSpecsProblem?: string;
    statuses: Record<string, RunJob['status']>;
    targets: { id: string; profileId: string; browser: Browser; specCount?: number }[];
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
    results?: RunResults;
    resultsError?: string;
    progress?: RunProgress;
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
    browserName?: string;
    headed: boolean;
    isolateArtifacts?: boolean;
    specs: string[];
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    waitReason: string | null;
    artifactDirectory: string;
}
export interface NotificationStatus { enabled: boolean; supported: boolean; error?: string }
export interface RunnerAPI {
    project(): Promise<Project>;
    saveLocal(state: LocalState): Promise<{ state: LocalState; changedFiles: string[] }>;
    chooseBrowser(): Promise<string | null>;
    liveSpecDetails(id: string, spec: string): Promise<LiveSpecDetails | undefined>;
    openArtifact(id: string, filename: string, historical?: boolean): Promise<void>;
    history(): Promise<HistoryList>;
    historyDetail(id: string): Promise<HistoryDetail>;
    historyLog(id: string, location?: boolean): Promise<void>;
    forgetHistory(id?: string): Promise<void>;
    rerunHistory(id: string, mode?: RerunMode): Promise<MatrixResult>;
    notifications(enabled?: boolean): Promise<NotificationStatus>;
    testNotification(): Promise<void>;
    onNotificationStatus(listener: (status: NotificationStatus) => void): () => void;
    onNotificationClick(listener: (runId: string | null) => void): () => void;
    refresh(): Promise<Project>;
    onSpecChanges(listener: (changed: boolean) => void): () => void;
    initialize(config?: ProjectConfig): Promise<SaveResult>;
    saveConfig(config: ProjectConfig, revision: string): Promise<SaveResult>;
    saveCategories(categories: Category[], revision: string): Promise<SaveResult>;
    preview(options: RunOptions): Promise<string>;
    run(options: RunOptions): Promise<RunJob>;
    runMatrix(options: MatrixOptions): Promise<MatrixResult>;
    rerun(id: string, mode?: RerunMode): Promise<MatrixResult>;
    rerunBatch(id: string, mode: 'all' | 'failed' | 'failed-specs'): Promise<MatrixResult>;
    previewMatrix(options: MatrixOptions): Promise<string>;
    batches(): Promise<RunBatch[]>;
    updateRun(id: string, details: RunDetails): Promise<RunJob>;
    renameBatch(id: string, name: string): Promise<RunBatch>;
    closeBatch(id: string): Promise<void>;
    runs(): Promise<RunJob[]>;
    stop(id: string): Promise<void>;
    closeRun(id: string): Promise<void>;
    openLog(id: string): Promise<void>;
    openLogLocation(id: string): Promise<void>;
    copyOutput(id: string): Promise<void>;
    state(id: string): Promise<RunJob>;
    onRunState(listener: (state: RunJob) => void): () => void;
    onBatchState(listener: (state: RunBatch) => void): () => void;
    copy(text: string): Promise<void>;
}
