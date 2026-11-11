import { memo, useMemo, type CSSProperties } from 'react';
import Anser from 'anser';
import { ansiColors } from '../shared/contrast';

type Entry = { content: string; style: CSSProperties; styleKey: string };
type Block = { id: number; entries: Entry[] };

// Stable line groups let React reuse the middle of a large log as its tail moves.
const AnsiBlock = memo(function AnsiBlock({ entries }: { entries: Entry[] }) {
    return <span>{entries.map((entry, index) => <span key={index} style={entry.style}>{entry.content}</span>)}</span>;
}, (previous, next) => previous.entries.length === next.entries.length && previous.entries.every((entry, index) =>
    entry.content === next.entries[index].content && entry.styleKey === next.entries[index].styleKey));

export const AnsiOutput = memo(function AnsiOutput({ text, startLine = 0 }: { text: string; startLine?: number }) {
    const blocks = useMemo(() => {
        // Hide terminal titles/links and unfinished escape codes while a chunk is arriving.
        // The next snapshot includes the complete sequence, so colours survive split writes.
        const clean = text.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/g, '')
            .replace(/\x1b(?:\[[0-?]*[ -/]*)?$/g, '');
        const styles = new Map<string, CSSProperties>();
        const blocks: Block[] = [];
        let line = startLine;
        let block: Block = { id: Math.floor(line / 100), entries: [] };
        blocks.push(block);
        for (const entry of Anser.ansiToJson(clean, { remove_empty: true })) {
            const decorations = entry.decorations;
            const dim = decorations.includes('dim');
            const styleKey = `${entry.fg}|${entry.bg}|${decorations.join(',')}`;
            let style = styles.get(styleKey);
            if (!style) {
                style = {
                    ...ansiColors(entry.fg, entry.bg, dim),
                    fontWeight: decorations.includes('bold') ? 700 : undefined,
                    fontStyle: decorations.includes('italic') ? 'italic' : undefined,
                    textDecorationLine: [decorations.includes('underline') ? 'underline' : '', decorations.includes('strikethrough') ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
                };
                styles.set(styleKey, style);
            }
            let start = 0;
            for (let index = entry.content.indexOf('\n'); index !== -1; index = entry.content.indexOf('\n', index + 1)) {
                line++;
                if (line % 100 !== 0) continue;
                block.entries.push({ content: entry.content.slice(start, index + 1), style, styleKey });
                block = { id: Math.floor(line / 100), entries: [] };
                blocks.push(block);
                start = index + 1;
            }
            if (start < entry.content.length) block.entries.push({ content: entry.content.slice(start), style, styleKey });
        }
        return blocks;
    }, [text, startLine]);

    // React escapes log content; ANSI formatting never turns stdout into HTML.
    return <>{blocks.map(block => <AnsiBlock key={block.id} entries={block.entries} />)}</>;
});
