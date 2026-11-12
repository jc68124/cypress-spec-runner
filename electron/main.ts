import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, Notification, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { BatchNotifier, type CompletionNotice } from './batch-notifier';
import { realpathSync } from 'node:fs';
import { isAppDocumentUrl } from './app-url';
import { commandPreview, findProject, initializeProject, loadProject, saveCategories, saveConfig, validateRun } from './project';
import { RunManager } from './run-manager';
import type { Category, ProjectConfig, RunOptions } from '../shared/types';
import { matrixRuns } from '../shared/runs';
import type { MatrixOptions, RunDetails } from '../shared/types';

const appName = 'Cypress Spec Runner';
app.setName(appName);
const notificationAppId = 'CypressSpecRunner.Desktop';

let window: BrowserWindow;
let root: string;
let saving = false;
let quitting = false;
let confirmingClose = false;
const html = realpathSync.native(path.resolve(__dirname, '../../dist/index.html'));
const icon = path.resolve(__dirname, '../../assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
let runs: RunManager;
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
    const notification = new Notification({ title: notice.title, body: notice.body, icon });
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
                app.setAppUserModelId(notificationAppId); app.setToastActivatorCLSID('{DDA2B0C2-2485-46F1-A857-401C56E9424A}');
                const directory = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', appName);
                await mkdir(directory, { recursive: true });
                if (generation !== notificationGeneration) return notificationStatus();
                const written = shell.writeShortcutLink(path.join(directory, `${appName}.lnk`), 'create', { target: process.execPath, args: `"${path.resolve(__dirname, '../..')}"`, cwd: root, description: appName, icon, iconIndex: 0, appUserModelId: notificationAppId, toastActivatorClsid: app.toastActivatorCLSID });
                if (!written) throw Error('Could not register the Start menu entry.');
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
async function save(action: () => Promise<unknown>): Promise<unknown> {
    if (runs?.active) throw Error('Shared settings are locked while runs are active or queued. Finish or stop active runs and cancel queued runs first.');
    if (saving) throw Error('Wait for the current save to finish before changing shared settings.');
    saving = true;
    try { return await action(); } finally { saving = false; }
}
app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    if (process.platform === 'darwin') app.dock?.setIcon(icon);
    const project = await findProject([process.env.SPEC_RUNNER_PROJECT, process.cwd()]);
    if (!project) throw Error('No Cypress project found. Start the runner from your project folder.');
    root = project.root;
    runs = new RunManager(root, job => { if (window && !window.isDestroyed()) window.webContents.send('run:changed', job); }, batch => { notifications.observe(batch); if (window && !window.isDestroyed()) window.webContents.send('batch:changed', batch); });
    handle('notifications:configure', configureNotifications);
    handle('notifications:test', () => { if (!notifications.enabled) throw Error('Enable desktop notifications first.'); showNotice({ batchId: '', title: appName, body: 'You will be notified when a run group finishes.' }); });
    handle('project:get', () => loadProject(root));
    handle('project:refresh', () => loadProject(root));
    handle('project:initialize', (config?: ProjectConfig) => save(() => initializeProject(root, config)));
    handle('config:save', (config: ProjectConfig, revision: string) => save(() => saveConfig(root, config, revision)));
    handle('categories:save', (categories: Category[], revision: string) => save(() => saveCategories(root, categories, revision)));
    handle('run:preview', async (options: RunOptions) => commandPreview(await validateRun(root, options), (await loadProject(root)).config));
    handle('run:start', (options: RunOptions) => { if (saving) throw Error('Wait for the save to finish.'); return runs.enqueue(options); });
    handle('matrix:preview', async (options: MatrixOptions) => {
        const combinations = matrixRuns(options), project = await loadProject(root);
        const validated = await Promise.all(combinations.map(option => validateRun(root, option, project.config, project.specs)));
        return validated.map(option => commandPreview(option, project.config)).join('\n');
    });
    handle('matrix:start', (options: MatrixOptions) => { if (saving) throw Error('Wait for the save to finish.'); return runs.enqueueMatrix(options); });
    handle('run:rerun', (id: string) => { if (saving) throw Error('Wait for the save to finish.'); return runs.rerun(id); });
    handle('batch:rerun', (id: string, mode: 'all' | 'failed') => { if (saving) throw Error('Wait for the save to finish.'); return runs.rerunBatch(id, mode); });
    handle('run:update', (id: string, details: RunDetails) => runs.update(id, details));
    handle('batch:list', () => runs.batches());
    handle('batch:rename', (id: string, name: string) => runs.renameBatch(id, name));
    handle('batch:close', (id: string) => runs.closeBatch(id));
    handle('run:stop', (id: string) => runs.stop(id));
    handle('run:close', (id: string) => runs.close(id));
    handle('run:list', () => runs.list());
    handle('run:copy-output', async (id: string) => { await clipboard.writeText(await runs.copyText(id)); });
    handle('run:state', (id: string) => runs.get(id));
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
        backgroundColor: '#09090b', autoHideMenuBar: true, icon,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!isAppDocumentUrl(url, html)) event.preventDefault(); });
    window.on('close', event => { if (runs?.active && !quitting) { event.preventDefault(); app.quit(); } });
    await window.loadFile(html);
}).catch(error => { dialog.showErrorBox('Unable to open Cypress Spec Runner', String(error)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
    if (!runs?.active || quitting) return;
    event.preventDefault();
    if (confirmingClose) return;
    confirmingClose = true;
    void (async () => {
        const result = await dialog.showMessageBox(window, { title: appName, type: 'question', buttons: ['Keep running', 'Stop and close'], defaultId: 0, cancelId: 0, message: 'Cypress runs are still active or queued.', detail: 'Closing cancels queued runs and stops all running Cypress processes.' });
        if (result.response !== 1) { confirmingClose = false; return; }
        try { notifications.suspended = true; await runs.stopAll(); quitting = true; app.quit(); } catch (error) { notifications.suspended = false; dialog.showErrorBox('Could not stop all runs', String(error)); confirmingClose = false; }
    })();
});
