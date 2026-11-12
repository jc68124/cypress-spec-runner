import { contextBridge, ipcRenderer } from 'electron';
import type { RunnerAPI, RunJob } from '../shared/types';
const api: RunnerAPI = {
    project: () => ipcRenderer.invoke('project:get'),
    refresh: () => ipcRenderer.invoke('project:refresh'),
    initialize: config => ipcRenderer.invoke('project:initialize', config),
    saveConfig: (config, revision) => ipcRenderer.invoke('config:save', config, revision),
    saveCategories: (categories, revision) => ipcRenderer.invoke('categories:save', categories, revision),
    preview: options => ipcRenderer.invoke('run:preview', options),
    run: options => ipcRenderer.invoke('run:start', options),
    stop: id => ipcRenderer.invoke('run:stop', id),
    closeRun: id => ipcRenderer.invoke('run:close', id),
    runs: () => ipcRenderer.invoke('run:list'),
    openLog: id => ipcRenderer.invoke('run:open-log', id),
    state: id => ipcRenderer.invoke('run:state', id),
    copy: text => ipcRenderer.invoke('clipboard:copy', text),
    onRunState: listener => {
        const handler = (_event: unknown, state: RunJob) => listener(state);
        ipcRenderer.on('run:changed', handler);
        return () => { ipcRenderer.removeListener('run:changed', handler); };
    },
};
contextBridge.exposeInMainWorld('specRunner', api);
