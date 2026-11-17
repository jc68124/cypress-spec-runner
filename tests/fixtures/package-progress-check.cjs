(async () => {
    const api = window.specRunner, project = await api.refresh();
    const specs = project.specs.filter(spec => spec.endsWith('progress-pass.cy.ts') || spec.endsWith('progress-failed.cy.ts'));
    if (specs.length !== 2) throw Error('Progress fixture specs were not discovered');
    const batch = await api.runMatrix({ specs, profiles: [project.config.defaultProfile, 'second'], browsers: ['electron', 'chrome'], headed: false, isolateArtifacts: false });
    let partial = false;
    async function finish(entries) {
        for (let attempt = 0; attempt < 600; attempt++) {
            const runs = await Promise.all(entries.map(run => api.state(run.id)));
            partial ||= runs.some(run => run.status === 'running' && run.progress?.completed > 0 && !run.results);
            if (runs.every(run => ['passed', 'failed', 'stopped'].includes(run.status))) return runs;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw Error('Progress fixture did not finish');
    }
    const original = await finish(batch.runs);
    if (!partial || original.some(run => run.progress?.completed !== 2 || run.results?.failed !== 1)) throw Error('Packaged live progress or final results were lost');
    await api.closeRun(original[0].id);
    const retry = await api.rerunBatch(batch.batch.id, 'failed-specs');
    if (retry.runs.length !== 4 || retry.runs.some(run => run.specs.length !== 1 || !run.specs[0].endsWith('failed.cy.ts') || run.isolateArtifacts !== false)) throw Error('Failed-spec group rerun lost its exact subset or artifact preference');
    for (const run of retry.runs) if (!original.some(source => source.profileId === run.profileId && source.browser === run.browser)) throw Error('Failed-spec rerun changed target pairs');
    await finish(retry.runs);
    const historical = await api.rerunHistory(original[0].id, 'failed-specs');
    if (historical.runs.length !== 1 || historical.runs[0].specs.length !== 1 || historical.runs[0].browser !== original[0].browser || historical.runs[0].profileId !== original[0].profileId) throw Error('History failed-spec rerun changed its scope');
    await finish(historical.runs);
    await api.closeBatch(historical.batch.id); await api.closeBatch(retry.batch.id); await api.closeBatch(batch.batch.id);
    return (await api.history()).entries.length;
})()
