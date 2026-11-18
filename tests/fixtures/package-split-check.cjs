(async () => {
    const api=window.specRunner,project=await api.refresh();
    if(project.specs.length!==7)throw Error('Refresh did not discover new specs');
    const plan={specs:project.specs,profiles:[project.config.defaultProfile,'second'],browsers:['electron','chrome'],headed:false,executionMode:'split'};
    if((await api.previewMatrix(plan)).split('\n').length!==4)throw Error('Split preview did not include four workers');
    const split=await api.runMatrix(plan),assigned=split.runs.flatMap(run=>run.specs);
    if(split.runs.length!==4||new Set(assigned).size!==7||assigned.length!==7||split.batch.specCount!==7||split.batch.executionMode!=='split')throw Error('Split matrix duplicated or dropped specs');
    for(let attempt=0;attempt<400;attempt++){
        const runs=await Promise.all(split.runs.map(run=>api.state(run.id)));
        if(runs.every(run=>run.status==='passed')){
            for(const run of runs){const args=JSON.parse(run.output).args;if(args[args.indexOf('--spec')+1]!==run.specs.join(',')||run.results.total!==run.specs.length)throw Error('Split execution/results differ from plan');}
            await api.closeBatch(split.batch.id);
            break;
        }
        if(runs.some(run=>run.status==='failed')||attempt===399)throw Error('Split matrix did not pass');
        await new Promise(resolve=>setTimeout(resolve,20));
    }

    for (const [executionMode, axis] of [['per-browser', 'browser'], ['per-profile', 'profileId']]) {
        const coveragePlan = { ...plan, specs: project.specs.slice(0, 1), executionMode };
        if ((await api.previewMatrix(coveragePlan)).split('\n').length !== 2) throw Error('Coverage preview did not skip unused targets');
        const group = await api.runMatrix(coveragePlan);
        if (group.batch.executionMode !== executionMode || group.runs.length !== 2 || new Set(group.runs.map(run => run[axis])).size !== 2 ||
            group.runs.some(run => run.specs.length !== 1 || run.specs[0] !== coveragePlan.specs[0])) throw Error('Coverage matrix dropped or duplicated a required target');
        for (let attempt = 0; attempt < 400; attempt++) {
            const jobs = await Promise.all(group.runs.map(run => api.state(run.id)));
            if (jobs.every(run => run.status === 'passed' && run.results?.total === 1)) {
                await api.closeBatch(group.batch.id);
                break;
            }
            if (jobs.some(run => run.status === 'failed') || attempt === 399) throw Error('Coverage matrix did not pass');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    return (await api.history()).entries.length;
})()
