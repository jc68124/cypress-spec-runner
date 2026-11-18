// Keep sub-second precision for short work, and use whole seconds once minutes apply.
export function formatDuration(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0s';
    if (milliseconds < 59_950) {
        const seconds = Math.round(milliseconds / 100) / 10;
        return seconds ? `${seconds}s` : '<0.1s';
    }
    const seconds = Math.round(milliseconds / 1000), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
    return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', remainder ? `${remainder}s` : ''].filter(Boolean).join(' ');
}
