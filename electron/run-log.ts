import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import type { WriteStream } from 'node:fs';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { clipboardLogByteLimit } from '../shared/output';

export async function readLogForClipboard(filename: string): Promise<string> {
    const file = await open(filename, 'r');
    try {
        const { size } = await file.stat();
        if (size > clipboardLogByteLimit) throw Error('The full log exceeds the 20 MiB clipboard limit. Use the saved log file instead.');
        // Fix the snapshot size so a growing live log cannot create an unbounded read.
        const data = Buffer.alloc(size);
        let offset = 0;
        while (offset < size) {
            const { bytesRead } = await file.read(data, offset, size - offset, offset);
            if (!bytesRead) break;
            offset += bytesRead;
        }
        return data.subarray(0, offset).toString('utf8');
    } finally { await file.close(); }
}

// Retain parser state across writes, including ANSI sequences split between chunks.
export class PlainText {
    private state: 'text' | 'escape' | 'csi' | 'osc' | 'string' | 'stringEscape' = 'text';
    private stringState: 'osc' | 'string' = 'osc';

    write(data: string): string {
        const text: string[] = [];
        let start = 0;
        for (let index = 0; index < data.length; index++) {
            const char = data[index];
            if (this.state === 'text') {
                if (char !== '\x1b' && char !== '\x9b') continue;
                text.push(data.slice(start, index));
                this.state = char === '\x9b' ? 'csi' : 'escape';
            } else if (this.state === 'escape') {
                if (char === '[') this.state = 'csi';
                else if (char === ']') { this.state = 'osc'; this.stringState = 'osc'; }
                else if ('PX^_'.includes(char)) { this.state = 'string'; this.stringState = 'string'; }
                else if (char < ' ' || char > '/') this.state = 'text';
            } else if (this.state === 'csi') {
                if (char >= '@' && char <= '~') this.state = 'text';
            } else if (this.state === 'stringEscape') {
                if (char === '\\') this.state = 'text';
                else if (char !== '\x1b') this.state = this.stringState;
            } else if (char === '\x07' && this.state === 'osc') this.state = 'text';
            else if (char === '\x1b') this.state = 'stringEscape';
            start = index + 1;
        }
        if (this.state === 'text') text.push(data.slice(start));
        return text.join('');
    }
}

export class RunLog {
    private readonly text = new PlainText();
    private constructor(readonly path: string, readonly stream: WriteStream) {}

    static async create(root: string, environment: string, runDirectory?: string): Promise<RunLog> {
        const directory = runDirectory ?? path.join(root, 'spec-runner-logs');
        await mkdir(directory, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(directory, `${timestamp}-${environment}-${randomUUID()}.log`);
        const handle = await open(file, 'wx');
        return new RunLog(file, handle.createWriteStream());
    }

    write(data: string): boolean { return this.stream.write(this.text.write(data)); }

    async flush(): Promise<void> {
        if (this.stream.writableEnded || this.stream.destroyed) { await finished(this.stream, { cleanup: true }); return; }
        await new Promise<void>((resolve, reject) => { this.stream.write('', error => error ? reject(error) : resolve()); });
    }

    async finish(): Promise<void> {
        if (this.stream.closed) return;
        await new Promise<void>(resolve => {
            this.stream.once('close', resolve);
            this.stream.end();
        });
    }
}
