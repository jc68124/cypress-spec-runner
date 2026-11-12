import { contextBridge, ipcRenderer } from 'electron';
import type { RunnerAPI, RunBatch, RunJob } from '../shared/types';
const api: RunnerAPI = {
    project: () => ipcRenderer.invoke('project:get'),
    refresh: () => ipcRenderer.invoke('project:refresh'),
    initialize: config => ipcRenderer.invoke('project:initialize', config),
    saveConfig: (config, revision) => ipcRenderer.invoke('config:save', config, revision),
    saveCategories: (categories, revision) => ipcRenderer.invoke('categories:save', categories, revision),
    preview: options => ipcRenderer.invoke('run:preview', options),
    run: options => ipcRenderer.invoke('run:start', options),
    runMatrix: options => ipcRenderer.invoke('matrix:start', options),
    rerun: id => ipcRenderer.invoke('run:rerun', id),
    rerunBatch: (id, mode) => ipcRenderer.invoke('batch:rerun', id, mode),
    previewMatrix: options => ipcRenderer.invoke('matrix:preview', options),
    batches: () => ipcRenderer.invoke('batch:list'),
    updateRun: (id, details) => ipcRenderer.invoke('run:update', id, details),
    renameBatch: (id, name) => ipcRenderer.invoke('batch:rename', id, name),
    closeBatch: id => ipcRenderer.invoke('batch:close', id),
    stop: id => ipcRenderer.invoke('run:stop', id),
    closeRun: id => ipcRenderer.invoke('run:close', id),
    runs: () => ipcRenderer.invoke('run:list'),
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
