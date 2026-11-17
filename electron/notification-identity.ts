import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
const execute = promisify(execFile);
// Register only our per-user identity, after notification opt-in. Never invoke a shell.
export async function registerNotificationIdentity(id: string, name: string, icon: string, activator: string,
    run: (file: string, args: string[]) => Promise<unknown> = (file, args) => execute(file, args, { windowsHide: true, timeout: 10000 })) {
    const registry = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe');
    const key = `HKCU\\Software\\Classes\\AppUserModelId\\${id}`;
    for (const [value, data] of [['DisplayName', name], ['IconUri', icon], ['CustomActivator', activator]]) {
        await run(registry, ['add', key, '/v', value, '/t', 'REG_SZ', '/d', data, '/f']);
    }
}
