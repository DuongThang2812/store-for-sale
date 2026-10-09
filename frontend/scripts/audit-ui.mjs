import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import postcss from 'postcss';

async function filesIn(path) {
    const children = await readdir(path, { withFileTypes: true });
    return (await Promise.all(children.map(child => child.isDirectory() ? filesIn(`${path}/${child.name}`) : `${path}/${child.name}`))).flat();
}
const files = await filesIn('src');
const problems = [];
let transitions = 0, keyframes = 0;
for (const file of files.filter(file => file.endsWith('.css'))) {
    const root = postcss.parse(await readFile(file, 'utf8'), { from: file });
    root.walkDecls(/^(transition|transition-property)$/, declaration => {
        if (declaration.value === 'none') return;
        transitions++;
        for (const part of postcss.list.comma(declaration.value)) {
            const property = part.trim().split(/\s+/)[0];
            if (!['transform', 'opacity'].includes(property)) problems.push(`${file}:${declaration.source.start.line} transition ${property}`);
        }
    });
    root.walkAtRules(/keyframes$/, rule => {
        keyframes++;
        rule.walkDecls(declaration => {
            if (!['transform', 'opacity', 'animation-timing-function'].includes(declaration.prop)) problems.push(`${file}: ${rule.params} animates ${declaration.prop}`);
        });
    });
}
for (const file of files.filter(file => file.endsWith('.jsx'))) {
    if (/\btransition-(?:all|colors|shadow)\b/.test(await readFile(file, 'utf8'))) problems.push(`${file}: non-composited Tailwind transition`);
}
assert.deepEqual(problems, [], 'Only transform and opacity may be animated');

const css = await readFile('src/styles/tokens.css', 'utf8');
const token = name => css.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`, 'i'))?.[1];
function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
const pairs = [
    ['Body on canvas', token('ink'), token('canvas')],
    ['Body on white', token('ink'), '#ffffff'],
    ['Secondary text on canvas', token('muted'), token('canvas')],
    ['Secondary text on white', token('muted'), '#ffffff'],
    ['Primary button', '#ffffff', token('green')],
    ['Primary button hover', '#ffffff', token('green-dark')],
    ['Selected navigation', token('green-dark'), token('green-light')],
    ['Debt amount', token('accent'), '#ffffff'],
    ['Danger button', '#ffffff', '#a83531'],
    ['Input placeholder', '#607367', '#ffffff'],
];
const contrast = pairs.map(([name, foreground, background]) => {
    const a = luminance(foreground), b = luminance(background);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(ratio >= 4.5, `${name}: contrast ${ratio.toFixed(2)} is below 4.5:1`);
    return { name, ratio: +ratio.toFixed(2) };
});
console.log(JSON.stringify({ transitions, keyframes, contrast, note: 'Source motion and semantic palette audit; not a complete accessibility or FPS audit.' }, null, 2));
