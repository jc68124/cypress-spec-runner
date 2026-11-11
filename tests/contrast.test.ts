import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ansiColors, contrastRatio, minimumContrast, readableColor, terminalBackground, type RGB } from '../shared/contrast';

const palette: RGB[] = [
    [0, 0, 0], [187, 0, 0], [0, 187, 0], [187, 187, 0],
    [0, 0, 187], [187, 0, 187], [0, 187, 187], [255, 255, 255],
    [85, 85, 85], [255, 85, 85], [0, 255, 0], [255, 255, 85],
    [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255],
];

test('dark ANSI foregrounds are readable and already readable colours stay unchanged', () => {
    assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
    for (const foreground of palette) {
        const adjusted = readableColor(foreground, terminalBackground);
        assert.ok(contrastRatio(adjusted, terminalBackground) >= minimumContrast);
        if (contrastRatio(foreground, terminalBackground) >= minimumContrast) assert.deepEqual(adjusted, foreground);
    }
});

test('all ANSI foreground/background pairs and dim variants meet 4.5:1', () => {
    for (const background of [...palette, terminalBackground, [120, 120, 120] as const]) {
        for (const foreground of [...palette, [12, 34, 56] as const, [100, 105, 110] as const]) {
            for (const dim of [false, true]) {
                const adjusted = readableColor(foreground, background, dim);
                assert.ok(contrastRatio(adjusted, background) >= minimumContrast, `${foreground} on ${background}, dim=${dim}`);
                assert.ok(adjusted.every(value => Number.isInteger(value) && value >= 0 && value <= 255));
            }
        }
    }
});

test('dim text uses a solid foreground without fading its background', () => {
    const style = ansiColors('255, 255, 255', '187, 0, 0', true);
    assert.equal(style.backgroundColor, 'rgb(187, 0, 0)');
    assert.ok(!('opacity' in style));
    assert.equal(ansiColors(null, null, false).color, 'rgb(228, 228, 231)');
});
