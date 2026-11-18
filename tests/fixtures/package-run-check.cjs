(async () => {
    const api = window.specRunner;
    const assert = (value, message) => { if (!value) throw Error(message); };
    const reject = async (promise, message) => { const error = await promise.then(() => null, error => error.message); assert(error, message); return error; };
    const finish = async id => { for (let index = 0; index < 400; index++) { const job = await api.state(id); if (['passed','failed','stopped'].includes(job.status)) { assert(job.status === 'passed', job.output); return job; } await new Promise(resolve => setTimeout(resolve, 20)); } throw Error('Run did not complete'); };
    assert(!(await api.notifications(false)).enabled, 'Notifications were not disabled');
    await reject(api.testNotification(), 'Notification opt-in was bypassed');
    const project = await api.project();
    await reject(api.preview({specs:project.specs,profile:project.config.defaultProfile,browser:'chrome',headed:false}), 'Disabled browser accepted');
    await reject(api.openLog('missing'), 'Missing log accepted');
    await reject(api.openLogLocation('missing'), 'Missing log location accepted');
    const job = await api.run({specs:project.specs,profile:project.config.defaultProfile,browser:'electron',headed:false});
    const state = await finish(job.id);
    assert(state.results?.passed === 1 && state.results.specs[0].tests[0].attempts === 2, 'Module results or retries missing');
    assert((await reject(api.openLog(job.id), 'Log opening error hidden')).includes('No default application'), 'Log error missing');
    await api.openLog(job.id); await api.openLogLocation(job.id);
    await api.openArtifact(job.id, state.results.specs[0].screenshots[0]);
    await reject(api.openArtifact(job.id, '/unrelated.png'), 'Unowned artifact accepted');
    await api.closeRun(job.id);
    assert(!(await api.runs()).length && !(await api.batches()).length, 'Closing last run left its group');
    const fresh = await api.project();
    const localPreset = {id:'local-smoke',name:'Local smoke',options:{specs:fresh.specs,profiles:[fresh.config.defaultProfile],browsers:['electron'],headed:false,executionMode:'split',isolateArtifacts:false}};
    const sharedPreset = {...localPreset,id:'team-smoke',name:'Team smoke'};
    const expanded = {...fresh.config,browsers:['electron','chrome','beta','portable'],customBrowsers:[{id:'beta',name:'Chrome Beta',channel:'chrome:beta'},{id:'portable',name:'Portable Chromium'}],presets:[sharedPreset],maxConcurrentRuns:1,profiles:[...fresh.config.profiles,{id:'second',name:'Second environment',args:[],env:fresh.config.profiles[0].env}]};
    await api.saveConfig(expanded, fresh.configRevision);
    const executable = await api.chooseBrowser(); assert(executable?.endsWith('portable browser'), 'Browser chooser did not return a path');
    await api.saveLocal({...fresh.local,browserPaths:{portable:executable},presets:[localPreset]});
    const matrix={specs:fresh.specs,profiles:[fresh.config.defaultProfile,'second'],browsers:['electron','chrome'],headed:false,isolateArtifacts:false};
    await reject(api.runMatrix({...matrix,profiles:[fresh.config.defaultProfile,'missing']}), 'Invalid matrix started');
    assert(!(await api.runs()).length, 'Invalid matrix submitted a subset');
    const batch=await api.runMatrix(matrix); assert(batch.runs.length===4 && batch.runs.filter(run=>run.status==='running').length===1, 'Matrix or global cap failed');
    const first=batch.runs[0],cancelled=batch.runs[3];
    await api.updateRun(first.id,{name:'Checkout checks',notes:'Compare browser results'}); await api.renameBatch(batch.batch.id,'Cross-browser matrix');
    await api.stop(cancelled.id); assert(!(await api.runs()).some(run=>run.id===cancelled.id),'Queued cancellation retained a row');
    const runningProject = await api.project();
    const limitError = await reject(api.saveConfig({...runningProject.config,maxConcurrentRuns:2}, runningProject.configRevision), 'Scheduling change was allowed during submitted work');
    assert(limitError.includes('locked while runs are active or queued'), 'Scheduling lock did not explain the rejection');
    const saved = await api.saveConfig({
        ...runningProject.config,
        name: 'Updated smoke project',
        presets: [{...sharedPreset,name:'Updated team preset'}],
        profiles: runningProject.config.profiles.map(profile=>({...profile,env:{...profile.env,EXAMPLE_SETTING:'updated-value'}})),
    }, runningProject.configRevision);
    assert(saved.project.config.presets[0].name==='Updated team preset' && saved.changedFiles.includes('spec-runner.config.json'), 'Shared preset/settings save was rejected during submitted work');
    const refreshed = await api.refresh();
    const categories = await api.saveCategories([...refreshed.categories,{id:'during-run',name:'During run',specs:fresh.specs}], refreshed.revision);
    assert(categories.project.categories.some(category=>category.id==='during-run'), 'Could not save categories during submitted work');
    const finished=await Promise.all(batch.runs.filter(run=>run.id!==cancelled.id).map(run=>finish(run.id)));
    assert(finished.every(run=>JSON.parse(run.output).value==='fixture-value'), 'Submitted runs picked up the newly saved profile environment');
    const group=(await api.batches()).find(group=>group.id===batch.batch.id);
    assert(group.name==='Cross-browser matrix' && Object.keys(group.statuses).length===4 && Object.values(group.statuses).filter(status=>status==='cancelled').length===1,'Group summary lost results');
    await api.copyOutput(first.id); await api.closeRun(first.id);
    const repeated=await api.rerun(finished[1].id); assert(repeated.runs.length===1&&repeated.runs[0].browser===finished[1].browser,'Rerun changed target');
    assert(JSON.parse((await finish(repeated.runs[0].id)).output).value==='updated-value', 'New runs did not use the updated profile environment');
    await api.closeBatch(repeated.batch.id); await api.closeBatch(batch.batch.id);
    const custom=await api.runMatrix({specs:fresh.specs,profiles:[fresh.config.defaultProfile],browsers:['beta','portable'],headed:false});
    const customRuns=await Promise.all(custom.runs.map(run=>finish(run.id)));
    assert(customRuns[0].browserName==='Chrome Beta' && JSON.parse(customRuns[0].output).args.includes('chrome:beta'),'Custom browser channel or label lost');
    assert(JSON.parse(customRuns[1].output).args.includes(executable),'Local executable was not passed as a separate Cypress argument');
    await api.closeBatch(custom.batch.id);
    const history=(await api.history()).entries; assert(history.some(entry=>entry.id===job.id)&&history.some(entry=>entry.browser==='portable'),'Closed runs missing from history');
    const historical=await api.historyDetail(job.id); assert(historical.results.passed===1 && !('output' in historical) && !('command' in historical),'History lacks safe results');
    return {...state,matrix:finished,historyCount:history.length};
})()
