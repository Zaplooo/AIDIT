// Kontrola kvality: vyrenderuje snímky z každého beatu (a pár běžných míst) a složí je do jednoho obrázku.
// node scripts/stills.mjs <projekt> <výstup.png>
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const [id, out] = process.argv.slice(2);
const ROOT = path.resolve('.');
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const project = JSON.parse(fs.readFileSync(`projects/${id}/project.json`, 'utf-8'));
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/remotion/index.ts'), publicDir: path.join(ROOT, 'public')});
const inputProps = {project, mediaBase: `http://localhost:${config.port}/media/${id}/`, quality: 'preview'};
const comp = await selectComposition({serveUrl, id: 'Edit', inputProps});
const fps = comp.fps;
// časy beatů – stejný výpočet jako layout(): slovo -> výstupní čas
let f = 0;
const laid = [];
for (const c of project.clips) if (c.enabled) {
	const inF = Math.round(c.in * fps);
	const d = Math.max(1, Math.round(c.out * fps) - inF);
	laid.push({...c, fromF: f});
	f += d;
}
const tOf = (wi) => {
	const w = project.words[wi];
	const c = laid.find((k) => Math.min(w.end, k.out) - Math.max(w.start, k.in) >= Math.min(0.5 * (w.end - w.start), 0.12));
	return c ? c.fromF / fps + Math.max(w.start, c.in) - c.in : null;
};
const times = [];
for (const b of project.plan.beats ?? []) {
	const t = tOf(b.wi);
	if (t != null) times.push({t: t + Math.min(0.9, b.dur * 0.5), label: `${b.kind}${b.gfx ? ':' + b.gfx.type : ''}`});
}
for (const s of [0.5, f / fps * 0.33, f / fps * 0.66]) times.push({t: s, label: 'mluvčí'});
times.sort((a, b) => a.t - b.t);
const tmp = path.join(ROOT, 'projects', id, '_stills');
fs.mkdirSync(tmp, {recursive: true});
const files = [];
for (const [i, x] of times.entries()) {
	const file = path.join(tmp, `s${String(i).padStart(2, '0')}.png`);
	await renderStill({composition: comp, serveUrl, output: file, inputProps, frame: Math.min(comp.durationInFrames - 1, Math.round(x.t * fps)), scale: 0.25});
	files.push(file);
	console.log(x.t.toFixed(1), x.label);
}
const cols = 8;
const args = [];
files.forEach((f2) => args.push('-i', f2));
const rows = Math.ceil(files.length / cols);
const pad = rows * cols - files.length;
const filt = files.map((_, i) => `[${i}]`).join('') + (pad ? `${'color=black:s=270x480,'.repeat(0)}` : '') + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * 270}_${Math.floor(i / cols) * 480}`).join('|')}:fill=black`;
const r = spawnSync(config.ffmpeg, ['-v', 'error', '-y', ...args, '-filter_complex', filt, out]);
if (r.status) console.log(r.stderr.toString());
fs.rmSync(tmp, {recursive: true, force: true});
