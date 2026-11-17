import { contextBridge, ipcRenderer } from 'electron';
import type { NotificationStatus, RunnerAPI, RunBatch, RunJob } from '../shared/types';
const api: RunnerAPI = {
    saveLocal: state => ipcRenderer.invoke('local:save', state),
    chooseBrowser: () => ipcRenderer.invoke('browser:choose'),
    openArtifact: (id, filename, historical) => ipcRenderer.invoke('run:artifact', id, filename, historical),
    history: () => ipcRenderer.invoke('history:list'),
    historyDetail: id => ipcRenderer.invoke('history:detail', id),
    historyLog: (id, location) => ipcRenderer.invoke('history:log', id, location),
    forgetHistory: id => ipcRenderer.invoke('history:forget', id),
    rerunHistory: (id, mode) => ipcRenderer.invoke('history:rerun', id, mode),
    notifications: enabled => ipcRenderer.invoke('notifications:configure', enabled),
    testNotification: () => ipcRenderer.invoke('notifications:test'),
    onNotificationStatus: listener => { const handler = (_event: unknown, status: NotificationStatus) => listener(status); ipcRenderer.on('notifications:status', handler); return () => { ipcRenderer.removeListener('notifications:status', handler); }; },
    onNotificationClick: listener => { const handler = (_event: unknown, id: string | null) => listener(id); ipcRenderer.on('notifications:click', handler); return () => { ipcRenderer.removeListener('notifications:click', handler); }; },
    project: () => ipcRenderer.invoke('project:get'),
    refresh: () => ipcRenderer.invoke('project:refresh'),
    onSpecChanges: listener => { const handler = (_event: unknown, changed: boolean) => listener(changed); ipcRenderer.on('specs:changed', handler); return () => { ipcRenderer.removeListener('specs:changed', handler); }; },
    initialize: config => ipcRenderer.invoke('project:initialize', config),
    saveConfig: (config, revision) => ipcRenderer.invoke('config:save', config, revision),
    saveCategories: (categories, revision) => ipcRenderer.invoke('categories:save', categories, revision),
    preview: options => ipcRenderer.invoke('run:preview', options),
    run: options => ipcRenderer.invoke('run:start', options),
    runMatrix: options => ipcRenderer.invoke('matrix:start', options),
    rerun: (id, mode) => ipcRenderer.invoke('run:rerun', id, mode),
    rerunBatch: (id, mode) => ipcRenderer.invoke('batch:rerun', id, mode),
    previewMatrix: options => ipcRenderer.invoke('matrix:preview', options),
    batches: () => ipcRenderer.invoke('batch:list'),
    updateRun: (id, details) => ipcRenderer.invoke('run:update', id, details),
    renameBatch: (id, name) => ipcRenderer.invoke('batch:rename', id, name),
    closeBatch: id => ipcRenderer.invoke('batch:close', id),
    stop: id => ipcRenderer.invoke('run:stop', id),
    closeRun: id => ipcRenderer.invoke('run:close', id),
    runs: () => ipcRenderer.invoke('run:list'),
    openLogLocation: id => ipcRenderer.invoke('run:open-log-location', id),
    openLog: id => ipcRenderer.invoke('run:open-log', id),
    copyOutput: id => ipcRenderer.invoke('run:copy-output', id),
    state: id => ipcRenderer.invoke('run:state', id),
    copy: text => ipcRenderer.invoke('clipboard:copy', text),
    onBatchState: listener => {
        const handler = (_event: unknown, state: RunBatch) => listener(state);
        ipcRenderer.on('batch:changed', handler);
        return () => { ipcRenderer.removeListener('batch:changed', handler); };
    },
    onRunState: listener => {
        const handler = (_event: unknown, state: RunJob) => listener(state);
        ipcRenderer.on('run:changed', handler);
        return () => { ipcRenderer.removeListener('run:changed', handler); };
    },
};
contextBridge.exposeInMainWorld('specRunner', api);
