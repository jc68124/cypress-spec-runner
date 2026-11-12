export type RGB = readonly [number, number, number];
export const terminalBackground: RGB = [9, 9, 11];
export const terminalForeground: RGB = [228, 228, 231];
export const minimumContrast = 4.5;

function luminance(color: RGB): number {
    const linear = color.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(a: RGB, b: RGB): number {
    const first = luminance(a);
    const second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function blend(from: RGB, to: RGB, amount: number): RGB {
    const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * amount);
    return [channel(0), channel(1), channel(2)];
}

export function readableColor(foreground: RGB, background: RGB, dim = false): RGB {
    // Bake ANSI dim into the foreground, then correct contrast. CSS opacity would
    // dim the background as well and could undo the minimum contrast guarantee.
    const original = dim ? blend(background, foreground, 0.65) : foreground;
    if (contrastRatio(original, background) >= minimumContrast) return original;
    const candidates: RGB[] = [];
    for (const target of [[255, 255, 255], [0, 0, 0]] as const) {
        if (contrastRatio(target, background) < minimumContrast) continue;
        let low = 0;
        let high = 1;
        let best: RGB = target;
        // Find the smallest adjustment towards white or black that meets the ratio,
        // checking rounded RGB values so the final rendered colour also passes.
        for (let step = 0; step < 12; step++) {
            const amount = (low + high) / 2;
            const color = blend(original, target, amount);
            if (contrastRatio(color, background) >= minimumContrast) { high = amount; best = color; }
            else low = amount;
        }
        candidates.push(best);
    }
    const distance = (color: RGB) => color.reduce((sum, channel, index) => sum + (channel - original[index]) ** 2, 0);
    return candidates.sort((a, b) => distance(a) - distance(b))[0];
}

export function rgb(color: RGB): string { return `rgb(${color.join(', ')})`; }

export function ansiColors(foreground: string | null, background: string | null, dim: boolean) {
    // Anser supplies validated RGB channels, including palette and true colours.
    const parse = (value: string): RGB => {
        const [red, green, blue] = value.split(',').map(Number);
        return [red, green, blue];
    };
    const bg = background ? parse(background) : terminalBackground;
    return {
        color: rgb(readableColor(foreground ? parse(foreground) : terminalForeground, bg, dim)),
        backgroundColor: background ? rgb(bg) : undefined,
    };
}
