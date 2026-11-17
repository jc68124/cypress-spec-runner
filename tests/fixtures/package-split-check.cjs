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
            await api.closeBatch(split.batch.id);return (await api.history()).entries.length;
        }
        if(runs.some(run=>run.status==='failed')||attempt===399)throw Error('Split matrix did not pass');
        await new Promise(resolve=>setTimeout(resolve,20));
    }
})()
