import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, Notification, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { stat, realpath } from 'node:fs/promises';
import { saveLocal } from './local-state';
import { RunHistory } from './history';
import { resultArtifacts, requireFailedSpecs } from '../shared/results';
import { mkdir } from 'node:fs/promises';
import { registerNotificationIdentity } from './notification-identity';
import { BatchNotifier, type CompletionNotice } from './batch-notifier';
import { realpathSync } from 'node:fs';
import { isAppDocumentUrl } from './app-url';
import { commandPreview, findProject, initializeProject, loadProject, saveCategories, saveConfig, validateRun } from './project';
import { SpecChanges } from './spec-changes';
import { RunManager } from './run-manager';
import type { Category, LocalState, ProjectConfig, RunOptions, SaveResult, RerunMode } from '../shared/types';
import { matrixRuns, validateMatrixTargets, validateRunDetails } from '../shared/runs';
import type { MatrixOptions, RunDetails } from '../shared/types';

const appName = 'Cypress Spec Runner';
app.setName(appName);
const appUserModelId = 'CypressSpecRunner.Desktop';
if (process.platform === 'win32') {
    app.setAppUserModelId(appUserModelId);
    app.setToastActivatorCLSID('{DDA2B0C2-2485-46F1-A857-401C56E9424A}');
}

let window: BrowserWindow;
let root: string;
let saving = false;
let quitting = false;
let confirmingClose = false;
const appDirectory = path.resolve(__dirname, '../..');
const html = realpathSync.native(path.join(appDirectory, 'dist/index.html'));
const icon = path.join(appDirectory, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const projectSwitch = 'spec-runner-project';

function quoteWindowsArgument(argument: string): string {
    // Double trailing backslashes before the closing quote (for example, a drive root).
    return '"' + argument.replace(/\\+$/, backslashes => backslashes + backslashes) + '"';
}

function windowsRelaunchArguments(projectRoot: string): string {
    return [appDirectory, `--${projectSwitch}=${projectRoot}`].map(quoteWindowsArgument).join(' ');
}
let runs: RunManager;
let history: RunHistory;
let notificationError: string | undefined;
let notificationGeneration = 0;
const notifications = new BatchNotifier(showNotice, () => notificationFailed());
function notificationStatus() { return { enabled: notifications.enabled, supported: Notification.isSupported(), ...(notificationError ? { error: notificationError } : {}) }; }
function notificationFailed() {
    if (!notifications.enabled) return;
    notificationError = 'Desktop notifications could not be delivered. Check system notification settings and try the test notification.';
    if (window && !window.isDestroyed()) window.webContents.send('notifications:status', notificationStatus());
}
function showNotice(notice: CompletionNotice): void {
    if (!Notification.isSupported()) throw Error('Desktop notifications are unavailable in this session.');
    const notification = new Notification({ title: notice.title === appName ? appName : `${appName} · ${notice.title}`, body: notice.body, icon });
    notification.on('failed', notificationFailed);
    notification.on('click', () => {
        if (!window || window.isDestroyed()) return;
        if (window.isMinimized()) window.restore(); window.show(); window.focus();
        const rows = runs.list().filter(run => run.batchId === notice.batchId);
        window.webContents.send('notifications:click', (rows.find(run => run.status === 'failed') ?? rows[0])?.id ?? null);
    });
    notification.show();
}
async function configureNotifications(enabled?: boolean) {
    if (enabled === undefined) return notificationStatus();
    if (typeof enabled !== 'boolean') throw Error('Invalid notification preference.');
    const generation = ++notificationGeneration;
    notificationError = undefined; notifications.enabled = false;
    if (enabled && !Notification.isSupported()) notificationError = 'Desktop notifications are unavailable in this session.';
    else if (enabled) {
        try {
            if (process.platform === 'win32') {
                const directory = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', appName);
                await mkdir(directory, { recursive: true });
                if (generation !== notificationGeneration) return notificationStatus();
                const written = shell.writeShortcutLink(path.join(directory, `${appName}.lnk`), 'create', { target: process.execPath, args: windowsRelaunchArguments(root), cwd: root, description: appName, icon, iconIndex: 0, appUserModelId: appUserModelId, toastActivatorClsid: app.toastActivatorCLSID });
                if (!written) throw Error('Could not register the Start menu entry.');
                await registerNotificationIdentity(appUserModelId, appName, path.join(appDirectory, 'assets/icon.png'), app.toastActivatorCLSID);
            }
            if (generation === notificationGeneration) notifications.enabled = true;
        } catch { if (generation === notificationGeneration) notificationError = 'Desktop notifications could not be enabled. Check notification permissions and try again.'; }
    }
    return notificationStatus();
}

function handle(channel: string, handler: (...args: any[]) => unknown): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isAppDocumentUrl(event.senderFrame?.url, html)) throw Error('Untrusted application window.');
        return handler(...args);
    });
}
function requireNoSave(): void {
    if (saving) throw Error('Wait for the current save to finish.');
}
async function save(action: () => Promise<unknown>): Promise<unknown> {
    requireNoSave();
    if (runs.submitting) throw Error('Wait for the current run submission to finish before saving.');
    saving = true;
    try { return await action(); } finally { saving = false; }
}
app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    if (process.platform === 'darwin') app.dock?.setIcon(icon);
    const projectFromShortcut = process.platform === 'win32' ? app.commandLine.getSwitchValue(projectSwitch) : undefined;
    const project = await findProject([projectFromShortcut, process.env.SPEC_RUNNER_PROJECT, process.cwd()]);
    if (!project) throw Error('No Cypress project found. Start the runner from your project folder.');
    root = project.root;
    const specChanges = new SpecChanges(() => loadProject(root), changed => { if (window && !window.isDestroyed()) window.webContents.send('specs:changed', changed); });
    specChanges.accept(project);
    const stopWatching = specChanges.start();
    app.once('will-quit', stopWatching);
    const readProject = async () => { const current = await loadProject(root); specChanges.accept(current); return current; };
    const updated = async (action: () => Promise<SaveResult>) => { const result = await action(); specChanges.accept(result.project); return result; };
    history = new RunHistory(root);
    runs = new RunManager(root, job => { history.observe(job, runs?.batches().find(batch => batch.id === job.batchId)); if (window && !window.isDestroyed()) window.webContents.send('run:changed', job); }, batch => { notifications.observe(batch); for (const job of runs?.list() ?? []) if (job.batchId === batch.id) history.observe(job, batch); if (window && !window.isDestroyed()) window.webContents.send('batch:changed', batch); });
    handle('notifications:configure', configureNotifications);
    handle('notifications:test', () => { if (!notifications.enabled) throw Error('Enable desktop notifications first.'); showNotice({ batchId: '', title: appName, body: 'You will be notified when a run group finishes.' }); });
    handle('project:get', readProject);
    handle('local:save', (state: LocalState) => save(() => saveLocal(root, state)));
    handle('browser:choose', async () => { const result = await dialog.showOpenDialog(window, { title: 'Choose browser executable', properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'] }); return result.canceled ? null : result.filePaths[0] ?? null; });
    handle('history:list', () => history.list());
    handle('history:detail', (id: string) => history.detail(id));
    handle('history:forget', (id?: string) => history.forget(id));
    handle('history:rerun', async (id: string, mode: RerunMode = 'all') => {
        requireNoSave();
        if (mode !== 'all' && mode !== 'failed-specs') throw Error('Choose the full run or failed specs.');
        const job = await history.detail(id), specs = mode === 'failed-specs' ? requireFailedSpecs(job.results, job.specs) : job.specs;
        const details = validateRunDetails({ name: job.name, notes: job.notes });
        requireNoSave();
        const result = await runs.enqueueMatrix({ specs, profiles: [job.profileId], browsers: [job.browser], headed: job.headed, isolateArtifacts: job.isolateArtifacts });
        result.runs = result.runs.map(run => runs.update(run.id, details)); result.batch = runs.renameBatch(result.batch.id, `${job.name} (${mode === 'failed-specs' ? 'failed specs' : 'rerun'})`.slice(0, 100)); return result;
    });
    handle('history:log', async (id: string, location = false) => {
        const job = await history.detail(id); if (!job.logPath || job.logError) throw Error(job.logError ?? 'This run has no saved log.');
        const actual = await realpath(job.logPath); if (!actual.startsWith(await realpath(path.join(root, 'spec-runner-logs', id)) + path.sep)) throw Error('The saved log is outside its run folder.');
        if (location) shell.showItemInFolder(actual); else { const error = await shell.openPath(actual); if (error) throw Error(error); }
    });
    const screenshotPattern = /\.(png|jpe?g|webp|gif)$/i;
    const artifactPattern = /\.(png|jpe?g|webp|gif|mp4|webm)$/i;
    async function artifactFile(filename: string, pattern: RegExp): Promise<string | undefined> {
        if (!path.isAbsolute(filename) || !pattern.test(filename)) return undefined;
        const actual = await realpath(filename).catch(() => undefined);
        if (!actual || !pattern.test(actual) || !(await stat(actual).catch(() => undefined))?.isFile()) return undefined;
        return actual;
    }
    handle('run:live-spec', async (id: string, spec: string) => {
        const details = runs.liveSpecDetails(id, spec);
        if (!details) return undefined;
        const available = await Promise.all(details.screenshots.map(filename => artifactFile(filename, screenshotPattern)));
        return { ...details, screenshots: details.screenshots.filter((_, index) => !!available[index]) };
    });
    handle('run:artifact', async (id: string, filename: string, historical = false) => {
        const job = historical ? await history.detail(id) : runs.get(id);
        const finalized = resultArtifacts(job.results).includes(filename);
        if (!finalized && (historical || !runs.hasLiveScreenshot(id, filename))) throw Error('This artifact is unavailable.');
        const actual = await artifactFile(filename, finalized ? artifactPattern : screenshotPattern);
        if (!actual) throw Error('This artifact is unavailable.');
        const error = await shell.openPath(actual); if (error) throw Error(error);
    });
    handle('project:refresh', () => { requireNoSave(); return readProject(); });
    handle('project:initialize', (config?: ProjectConfig) => save(() => {
        if (runs.active) throw Error('Finish active and queued runs before initializing the project.');
        return updated(() => initializeProject(root, config));
    }));
    handle('config:save', (config: ProjectConfig, revision: string) => save(() => updated(() => saveConfig(root, config, revision, runs.active))));
    handle('categories:save', (categories: Category[], revision: string) => save(() => updated(() => saveCategories(root, categories, revision))));
    handle('run:preview', async (options: RunOptions) => { const project = await loadProject(root); return commandPreview(await validateRun(root, options, project.config, project.specs), project.config, undefined, project.cypressVersion); });
    handle('run:start', (options: RunOptions) => { requireNoSave(); return runs.enqueue(options); });
    handle('matrix:preview', async (options: MatrixOptions) => {
        const combinations = matrixRuns(options), project = await loadProject(root);
        validateMatrixTargets(options, project.config);
        const validated = await Promise.all(combinations.map(option => validateRun(root, option, project.config, project.specs)));
        return validated.map(option => commandPreview(option, project.config, undefined, project.cypressVersion)).join('\n');
    });
    handle('matrix:start', (options: MatrixOptions) => { requireNoSave(); return runs.enqueueMatrix(options); });
    handle('run:rerun', (id: string, mode: RerunMode = 'all') => { requireNoSave(); return runs.rerun(id, mode); });
    handle('batch:rerun', (id: string, mode: 'all' | 'failed' | 'failed-specs') => { requireNoSave(); return runs.rerunBatch(id, mode); });
    handle('run:update', (id: string, details: RunDetails) => runs.update(id, details));
    handle('batch:list', () => runs.batches());
    handle('batch:rename', (id: string, name: string) => runs.renameBatch(id, name));
    handle('batch:close', (id: string) => runs.closeBatch(id));
    handle('run:stop', (id: string) => runs.stop(id));
    handle('run:close', async (id: string) => { await history.flush(); runs.close(id); });
    handle('run:list', () => runs.list());
    handle('run:copy-output', async (id: string) => { await clipboard.writeText(await runs.copyText(id)); });
    handle('run:state', (id: string) => runs.get(id));
    handle('run:open-log-location', (id: string) => { const state = runs.get(id); if (!state.logPath || state.logError) throw Error(state.logError ?? 'There is no saved log to reveal yet.'); shell.showItemInFolder(state.logPath); });
    handle('run:open-log', async (id: string) => {
        const state = runs.get(id);
        if (['queued', 'running', 'stopping'].includes(state.status) || !state.logPath || state.logError) throw Error(state.logError ?? 'Finish the run before opening its full log.');
        const error = await shell.openPath(state.logPath);
        if (error) throw Error(`Unable to open the log: ${error}`);
    });
    handle('clipboard:copy', async (text: string) => {
        if (typeof text !== 'string' || text.length > 250_000) throw Error('Invalid clipboard content.');
        await clipboard.writeText(text);
    });
    window = new BrowserWindow({ width: 1440, height: 960, minWidth: 980, minHeight: 700, title: appName,
        backgroundColor: '#09090b', autoHideMenuBar: true, icon, show: process.platform !== 'win32',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    if (process.platform === 'win32') {
        // The window icon and the Windows taskbar's relaunch icon are separate.
        window.setAppDetails({
            appId: appUserModelId,
            appIconPath: icon,
            appIconIndex: 0,
            relaunchCommand: `${quoteWindowsArgument(process.execPath)} ${windowsRelaunchArguments(root)}`,
            relaunchDisplayName: appName,
        });
        window.show();
    }
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!isAppDocumentUrl(url, html)) event.preventDefault(); });
    window.on('close', event => { if (runs?.active && !quitting) { event.preventDefault(); app.quit(); } });
    await window.loadFile(html);
}).catch(error => { dialog.showErrorBox('Unable to open Cypress Spec Runner', String(error)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    if (confirmingClose) return;
    confirmingClose = true;
    void (async () => {
        const result = runs?.active ? await dialog.showMessageBox(window, { title: appName, type: 'question', buttons: ['Keep running', 'Stop and close'], defaultId: 0, cancelId: 0, message: 'Cypress runs are still active or queued.', detail: 'Closing cancels queued runs and stops all running Cypress processes.' }) : { response: 1 };
        if (result.response !== 1) { confirmingClose = false; return; }
        try { notifications.suspended = true; if (runs?.active) await runs.stopAll(); await history?.flush(); quitting = true; app.quit(); } catch (error) { notifications.suspended = false; dialog.showErrorBox('Could not stop all runs', String(error)); confirmingClose = false; }
    })();
});
