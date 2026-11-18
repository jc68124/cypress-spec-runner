(async () => {
    const api=window.specRunner, project=await api.project(), history=await api.history();
    if((await api.runs()).length||history.entries.length<10)throw Error('History did not survive restart or runs resumed automatically');
    if(!project.config.presets.some(preset=>preset.id==='team-smoke'&&preset.name==='Updated team preset')||!project.local.presets.some(preset=>preset.name==='Local smoke')||!project.local.browserPaths.portable)throw Error('Presets or browser bindings did not survive restart');
    const detail=await api.historyDetail(history.entries[0].id);
    if(!detail.results||('command' in detail)||('output' in detail))throw Error('Historical structured results are missing or unsafe');
    await api.historyLog(detail.id);await api.openArtifact(detail.id,detail.results.specs[0].screenshots[0],true);
    const count=history.entries.length;await api.forgetHistory(detail.id);if((await api.history()).entries.length!==count-1)throw Error('Forget did not remove exactly one history entry');
    return {logPath:detail.logPath,historyCount:count};
})()
