// Připraví ukázkový záběr pro náhledy v průvodci (zoomy, hooky, titulky) z autorova vlastního videa.
// node scripts/make_demo.mjs <projekt> <od_s>
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const [id, from = '2'] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const dir = `projects/${id}`;
const p = JSON.parse(fs.readFileSync(`${dir}/project.json`, 'utf-8'));
const t0 = Number(from);
const DUR = 4.5;
fs.mkdirSync('public/demo', {recursive: true});
const base = p.base.preview.split('?')[0];
spawnSync(config.ffmpeg, ['-v', 'error', '-y', '-ss', String(t0), '-i', `${dir}/${base}`, '-t', String(DUR), '-an', '-c:v', 'libx264', '-crf', '24', '-preset', 'veryfast', '-g', '15', '-movflags', '+faststart', 'public/demo/speaker.mp4'], {stdio: 'inherit'});
// slova v čase výstupu (stejně jako layout() v aplikaci)
const fps = p.source.fps;
let f = 0;
const laid = [];
for (const c of p.clips) if (c.enabled) {
	const inF = Math.round(c.in * fps);
	const durF = Math.max(1, Math.round(c.out * fps) - inF);
	laid.push({...c, fromF: f});
	f += durF;
}
const words = [];
p.words.forEach((w, wi) => {
	const c = laid.find((k) => Math.min(w.end, k.out) - Math.max(w.start, k.in) >= Math.min(0.5 * (w.end - w.start), 0.12));
	if (!c) return;
	const s = c.fromF / fps + Math.max(w.start, c.in) - c.in;
	const e = c.fromF / fps + Math.min(w.end, c.out) - c.in;
	if (s >= t0 && s < t0 + DUR - 0.2) words.push({text: w.text, start: +(s - t0).toFixed(3), end: +(Math.min(e, t0 + DUR) - t0).toFixed(3)});
});
fs.writeFileSync('public/demo/words.json', JSON.stringify(words, null, 1));
const br = (p.plan.beats ?? []).find((b) => b.kind === 'broll' && b.broll?.ready);
if (br) fs.copyFileSync(`${dir}/broll/${br.id}.mp4`, 'public/demo/broll.mp4');
console.log(words.map((w) => w.text).join(' '), br ? '+ broll' : '');
