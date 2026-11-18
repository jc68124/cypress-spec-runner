import { planCoverage, plannedRunCount } from '../shared/runs';
import type { MatrixOptions } from '../shared/types';

export function RunPlanSummary({ specCount, targets, detailed = false }: {
    specCount: number;
    targets: Pick<MatrixOptions, 'profiles' | 'browsers' | 'executionMode'>;
    detailed?: boolean;
}) {
    const { profiles, browsers, executionMode = 'repeat' } = targets;
    const { copies, workers } = planCoverage(profiles.length, browsers.length, executionMode);
    const count = plannedRunCount(specCount, profiles.length, browsers.length, executionMode);
    if (!count) return <>{specCount ? 'Choose profiles and browsers to see the plan.' : 'Select specs to see the plan.'}</>;

    const noun = (total: number, unit: string) => `${total} ${unit}${total === 1 ? '' : 's'}`;
    const files = noun(specCount, 'spec');
    const runs = <strong>{noun(count, 'run')}</strong>;
    const assignedWorkers = Math.min(specCount, workers);
    const minFiles = Math.floor(specCount / assignedWorkers);
    const maxFiles = Math.ceil(specCount / assignedWorkers);
    const unusedTargets = profiles.length * browsers.length - count;
    return <>
        {executionMode === 'repeat' && <>{files} on {noun(profiles.length, 'profile')} × {noun(browsers.length, 'browser')} · {runs}</>}
        {executionMode === 'split' && <>{files} split across {runs} · once each</>}
        {executionMode === 'per-browser' && <>{files} per browser · {noun(copies, 'browser')} · {runs}</>}
        {executionMode === 'per-profile' && <>{files} per profile · {noun(copies, 'profile')} · {runs}</>}
        {detailed && executionMode !== 'repeat' && <span className="mt-1 block text-xs">
            {minFiles === maxFiles ? minFiles : `${minFiles}–${maxFiles}`} specs per run
            {copies > 1 ? ` · ${specCount * copies} spec executions total` : ''}
            {unusedTargets ? ` · ${noun(unusedTargets, 'unused target')}` : ''}
        </span>}
    </>;
}
