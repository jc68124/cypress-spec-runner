import { contextBridge, ipcRenderer } from 'electron';
import type { RunnerAPI, RunState } from '../shared/types';
const api: RunnerAPI = {
    project: () => ipcRenderer.invoke('project:get'),
    refresh: () => ipcRenderer.invoke('project:refresh'),
    initialize: config => ipcRenderer.invoke('project:initialize', config),
    saveConfig: (config, revision) => ipcRenderer.invoke('config:save', config, revision),
    saveCategories: (categories, revision) => ipcRenderer.invoke('categories:save', categories, revision),
    preview: options => ipcRenderer.invoke('run:preview', options),
    run: options => ipcRenderer.invoke('run:start', options),
    stop: () => ipcRenderer.invoke('run:stop'),
    saveLog: () => ipcRenderer.invoke('run:save-log'),
    state: () => ipcRenderer.invoke('run:state'),
    copy: text => ipcRenderer.invoke('clipboard:copy', text),
    onRunState: listener => {
        const handler = (_event: unknown, state: RunState) => listener(state);
        ipcRenderer.on('run:changed', handler);
        return () => { ipcRenderer.removeListener('run:changed', handler); };
    },
};
contextBridge.exposeInMainWorld('specRunner', api);
