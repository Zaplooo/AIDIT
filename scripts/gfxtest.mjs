// Ukázka všech šablon grafiky na projektu: node scripts/gfxtest.mjs <projekt> <výstup.png> [cream|dark]
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const [id, out, bg = 'dark', only = ''] = process.argv.slice(2);
const perFile = /[\/]$/.test(out);
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const project = JSON.parse(fs.readFileSync(`projects/${id}/project.json`, 'utf-8'));
const G = JSON.parse(fs.readFileSync('shared/catalog.json', 'utf-8')).gfx.filter((g) => !only || only.split(',').includes(g.type)).map((g) => g.sample);
const fps = project.source.fps;
const w0 = project.words.findIndex(() => true);
project.look.theme = {...(project.look.theme ?? {font: 'Archivo Black', serif: 'DM Serif Display'}), bg};
// beaty rozmístit na slova po ~5 s
let f = 0;
const laid = [];
for (const c of project.clips) if (c.enabled) {
	const inF = Math.round(c.in * fps);
	laid.push({...c, fromF: f});
	f += Math.max(1, Math.round(c.out * fps) - inF);
}
const words = [];
project.words.forEach((w, wi) => {
	const c = laid.find((k) => Math.min(w.end, k.out) - Math.max(w.start, k.in) >= Math.min(0.5 * (w.end - w.start), 0.12));
	if (c) words.push({wi, t: c.fromF / fps + Math.max(w.start, c.in) - c.in});
});
const spacing = Math.max(1.2, (words[words.length - 1].t - 3) / G.length);
const beats = G.map((g, i) => {
	const target = 1 + (i * Math.max(1.2, (words[words.length - 1].t - 3) / G.length));
	const w = words.reduce((a, b) => (Math.abs(b.t - target) < Math.abs(a.t - target) ? b : a));
	return {id: `g${i}`, wi: w.wi, dur: 2.5, kind: 'gfx', layout: ['versus', 'side', 'pill', 'lowerthird', 'counter', 'marquee'].includes(g.type) ? 'overlay' : 'full', gfx: g, t: w.t};
});
project.plan = {...project.plan, beats: beats.map(({t, ...b}) => b)};
void w0;
const serveUrl = await bundle({entryPoint: path.resolve('src/remotion/index.ts'), publicDir: path.resolve('public')});
const inputProps = {project, mediaBase: `http://localhost:${config.port}/media/${id}/`, quality: 'preview'};
const comp = await selectComposition({serveUrl, id: 'Edit', inputProps});
const tmp = path.resolve('projects', id, '_gfx');
fs.mkdirSync(tmp, {recursive: true});
const files = [];
for (const [i, b] of beats.entries()) {
	const file = path.join(tmp, `g${i}.png`);
	await renderStill({composition: comp, serveUrl, output: file, inputProps, frame: Math.round((b.t + Math.min(1.9, spacing - 0.12)) * fps), scale: 0.3});
	files.push(file);
	if (perFile) {
		fs.mkdirSync(out, {recursive: true});
		spawnSync(config.ffmpeg, ['-v', 'error', '-y', '-i', file, '-q:v', '4', path.join(out, `${G[i].type}.jpg`)]);
	}
}
if (perFile) {
	fs.rmSync(tmp, {recursive: true, force: true});
	console.log('ok');
	process.exit(0);
}
const args = files.flatMap((x) => ['-i', x]);
const r = spawnSync(config.ffmpeg, ['-v', 'error', '-y', ...args, '-filter_complex', `${files.map((_, i) => `[${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % 8) * 324}_${Math.floor(i / 8) * 576}`).join('|')}:fill=black`, out]);
if (r.status) console.log(r.stderr.toString());
fs.rmSync(tmp, {recursive: true, force: true});
console.log('ok');
