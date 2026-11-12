import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { isAppDocumentUrl } from './app-url';
import { commandPreview, findProject, initializeProject, loadProject, saveCategories, saveConfig, validateRun } from './project';
import { Runner } from './runner';
import type { Category, ProjectConfig, RunOptions } from '../shared/types';

let window: BrowserWindow;
let root: string;
let saving = false;
let quitting = false;
const html = realpathSync.native(path.resolve(__dirname, '../../dist/index.html'));
const runner = new Runner(state => { if (window && !window.isDestroyed()) window.webContents.send('run:changed', state); });
function handle(channel: string, handler: (...args: any[]) => unknown): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isAppDocumentUrl(event.senderFrame?.url, html)) throw Error('Untrusted application window.');
        return handler(...args);
    });
}
async function save(action: () => Promise<unknown>): Promise<unknown> {
    if (saving || runner.active) throw Error('Wait for the current run or save to finish before changing shared settings.');
    saving = true;
    try { return await action(); } finally { saving = false; }
}
app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    const project = await findProject([process.env.SPEC_RUNNER_PROJECT, process.cwd()]);
    if (!project) throw Error('No Cypress project found. Start the runner from your project folder.');
    root = project.root;
    handle('project:get', () => loadProject(root));
    handle('project:refresh', () => loadProject(root));
    handle('project:initialize', (config?: ProjectConfig) => save(() => initializeProject(root, config)));
    handle('config:save', (config: ProjectConfig, revision: string) => save(() => saveConfig(root, config, revision)));
    handle('categories:save', (categories: Category[], revision: string) => save(() => saveCategories(root, categories, revision)));
    handle('run:preview', async (options: RunOptions) => commandPreview(await validateRun(root, options), (await loadProject(root)).config));
    handle('run:start', (options: RunOptions) => { if (saving) throw Error('Wait for the save to finish.'); return runner.run(root, options); });
    handle('run:stop', () => runner.stop());
    handle('run:state', () => runner.state);
    handle('run:save-log', async () => {
        const state = runner.state;
        if (runner.active || !state.logPath || state.logError) throw Error(state.logError ?? 'Finish the run before saving its full log.');
        const result = await dialog.showSaveDialog(window, { title: 'Save full run log', defaultPath: path.basename(state.logPath), filters: [{ name: 'Log files', extensions: ['log'] }] });
        if (result.canceled || !result.filePath) return false;
        if (path.resolve(result.filePath) !== path.resolve(state.logPath)) await copyFile(state.logPath, result.filePath);
        return true;
    });
    handle('clipboard:copy', (text: string) => {
        if (typeof text !== 'string' || text.length > 250_000) throw Error('Invalid clipboard content.');
        clipboard.writeText(text);
    });
    window = new BrowserWindow({ width: 1440, height: 960, minWidth: 980, minHeight: 700, title: 'Cypress Spec Runner',
        backgroundColor: '#09090b', autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!isAppDocumentUrl(url, html)) event.preventDefault(); });
    window.on('close', event => { if (runner.active && !quitting) { event.preventDefault(); app.quit(); } });
    await window.loadFile(html);
}).catch(error => { dialog.showErrorBox('Unable to open Cypress Spec Runner', String(error)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
    if (!runner.active || quitting) return;
    event.preventDefault();
    if (runner.state.status === 'stopping') return;
    void (async () => {
        const result = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'Stop and close'], defaultId: 0, cancelId: 0, message: 'A Cypress run is active.', detail: 'Closing stops this run and its child processes.' });
        if (result.response !== 1) return;
        try { await runner.stop(); quitting = true; app.quit(); } catch (error) { dialog.showErrorBox('Could not stop Cypress', String(error)); }
    })();
});
