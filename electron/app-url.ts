import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isAppDocumentUrl(candidate: string | undefined, document: string): boolean {
    if (!candidate) return false;
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'file:' || url.hostname || url.search || url.hash) return false;
        // Chromium and Node can use different spellings for the same Windows file,
        // particularly when npm installs below an 8.3 temporary-directory alias.
        const actual = realpathSync.native(fileURLToPath(url));
        const expected = realpathSync.native(document);
        return process.platform === 'win32' ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
    } catch { return false; }
}
