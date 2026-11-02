// Snímky v daných časech: node scripts/stillsat.mjs <projekt> <výstup.png> <čas1> <čas2> …
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
const [id, out, ...times] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const project = JSON.parse(fs.readFileSync(`projects/${id}/project.json`, 'utf-8'));
const serveUrl = await bundle({entryPoint: path.resolve('src/remotion/index.ts'), publicDir: path.resolve('public')});
const inputProps = {project, mediaBase: `http://localhost:${config.port}/media/${id}/`, quality: 'preview'};
const comp = await selectComposition({serveUrl, id: 'Edit', inputProps});
const tmp = path.resolve('projects', id, '_st');
fs.mkdirSync(tmp, {recursive: true});
const files = [];
for (const [i, t] of times.entries()) {
	const f = path.join(tmp, `s${i}.png`);
	await renderStill({composition: comp, serveUrl, output: f, inputProps, frame: Math.round(Number(t) * comp.fps), scale: 0.3});
	files.push(f);
}
const args = files.flatMap((x) => ['-i', x]);
spawnSync(config.ffmpeg, ['-v', 'error', '-y', ...args, '-filter_complex', `${files.map((_, i) => `[${i}]`).join('')}hstack=inputs=${files.length}`, out]);
fs.rmSync(tmp, {recursive: true, force: true});
console.log('ok');
