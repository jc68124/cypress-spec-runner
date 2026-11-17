import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerNotificationIdentity } from '../electron/notification-identity';

test('notification registration assigns a friendly per-user name and icon without a shell', async () => {
    const calls: { file: string; args: string[] }[] = [];
    const icon = 'C:\\Example project & tools\\icon.png';
    await registerNotificationIdentity('CypressSpecRunner.Desktop', 'Cypress Spec Runner', icon, '{example}', async (file, args) => { calls.push({ file, args }); });
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.file.endsWith('\\System32\\reg.exe') && call.args[1] === 'HKCU\\Software\\Classes\\AppUserModelId\\CypressSpecRunner.Desktop'));
    assert.deepEqual(calls.map(call => [call.args[3], call.args[7]]), [['DisplayName', 'Cypress Spec Runner'], ['IconUri', icon], ['CustomActivator', '{example}']]);
    await assert.rejects(registerNotificationIdentity('CypressSpecRunner.Desktop', 'Cypress Spec Runner', icon, '{example}', async () => { throw Error('Denied'); }), /Denied/);
});
