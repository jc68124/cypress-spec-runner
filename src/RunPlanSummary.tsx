import { planCoverage, plannedRunCount } from '../shared/runs';
import type { MatrixOptions } from '../shared/types';

export function RunPlanSummary({ specCount, targets, detailed = false }: {
    specCount: number;
    targets: Pick<MatrixOptions, 'profiles' | 'browsers' | 'executionMode' | 'splitRuns'>;
    detailed?: boolean;
}) {
    const { profiles, browsers, splitRuns, executionMode = 'repeat' } = targets;
    const { copies } = planCoverage(profiles.length, browsers.length, executionMode);
    const count = plannedRunCount(specCount, profiles.length, browsers.length, executionMode, splitRuns);
    if (!count) return <>{specCount ? 'Choose profiles and browsers to see the plan.' : 'Select specs to see the plan.'}</>;

    const noun = (total: number, unit: string) => `${total} ${unit}${total === 1 ? '' : 's'}`;
    const files = noun(specCount, 'spec');
    const runs = <strong>{noun(count, 'run')}</strong>;
    const assignedWorkers = count / copies;
    const minFiles = Math.floor(specCount / assignedWorkers);
    const maxFiles = Math.ceil(specCount / assignedWorkers);
    const unusedTargets = splitRuns === undefined ? profiles.length * browsers.length - count : 0;
    return <>
        {executionMode === 'repeat' && <>{files} on {noun(profiles.length, 'profile')} × {noun(browsers.length, 'browser')} · {runs}</>}
        {executionMode === 'split' && <>{files} split across {runs} · once each</>}
        {executionMode === 'per-browser' && <>{files} per browser · {noun(copies, 'browser')} · {runs}</>}
        {executionMode === 'per-profile' && <>{files} per profile · {noun(copies, 'profile')} · {runs}</>}
        {detailed && (executionMode !== 'repeat' || splitRuns !== undefined) && <span className="mt-1 block text-xs">
            {minFiles === maxFiles ? minFiles : `${minFiles}–${maxFiles}`} specs per run
            {copies > 1 ? ` · ${specCount * copies} spec executions total` : ''}
            {unusedTargets ? ` · ${noun(unusedTargets, 'unused target')}` : ''}
        </span>}
    </>;
}
