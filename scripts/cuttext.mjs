// Výpis hotového textu po klipech (kontrola zdvojených pokusů): node scripts/cuttext.mjs <projekt>
import fs from 'node:fs';
const id = process.argv[2];
const q = JSON.parse(fs.readFileSync(`projects/${id}/project.json`, 'utf-8'));
const fps = q.source.fps;
let f = 0;
for (const c of q.clips.filter((c) => c.enabled)) {
	const ws = q.words.filter((w) => Math.min(w.end, c.out) - Math.max(w.start, c.in) >= Math.min(0.5 * (w.end - w.start), 0.12)).map((w) => w.text);
	console.log(`${(f / fps).toFixed(1).padStart(5)}  [${c.in.toFixed(1)}–${c.out.toFixed(1)}]  ${ws.join(' ')}`);
	f += Math.max(1, Math.round(c.out * fps) - Math.round(c.in * fps));
}
