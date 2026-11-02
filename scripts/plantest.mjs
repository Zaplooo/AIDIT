// test plánovače: node scripts/plantest.mjs <projekt> [styl] [zadání]
import fs from 'node:fs';
import {planVideo2} from '../server/planner.mjs';
import {pickBroll} from '../server/broll.mjs';
const [id, styleId = 'creator', brief = ''] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const p = JSON.parse(fs.readFileSync(`projects/${id}/project.json`, 'utf-8'));
const style = JSON.parse(fs.readFileSync(`styles/${styleId}.json`, 'utf-8'));
const fps = p.source.fps;
let f = 0;
const laid = [];
for (const c of p.clips) if (c.enabled) { const inF = Math.round(c.in * fps); const d = Math.max(1, Math.round(c.out * fps) - inF); laid.push({...c, fromF: f}); f += d; }
const words = [];
p.words.forEach((w, wi) => { const c = laid.find((k) => Math.min(w.end, k.out) - Math.max(w.start, k.in) >= Math.min(0.5 * (w.end - w.start), 0.12)); if (c) words.push({wi, text: w.text, start: c.fromF / fps + Math.max(w.start, c.in) - c.in}); });
words.sort((a, b) => a.start - b.start);
const t0 = Date.now();
const plan = await planVideo2({words, units: p.units, style, duration: f / fps, platform: p.format === '16:9' ? 'youtube' : 'reels', brief}, config);
console.log('plán', ((Date.now() - t0) / 1000).toFixed(0), 's, nálada', plan.mood);
const tx = (wi) => p.words.slice(wi, wi + 8).map((w) => w.text).join(' ');
for (const b of plan.beats) console.log(b.kind.padEnd(5), (b.layout ?? '').padEnd(5), b.dur.toFixed(1), '|', b.gfx ? JSON.stringify(b.gfx).slice(0, 110) : b.broll ? b.broll.query : b.chip ?? '', '| @', tx(b.wi).slice(0, 50));
const br = plan.beats.filter((b) => b.kind === 'broll');
if (br.length) {
	const picks = await pickBroll(br.map((b) => ({text: tx(b.wi), query: b.broll.query, alt: b.broll.alt})), config, plan.mood);
	br.forEach((b, i) => { if (picks[i]) { b.broll.mixkit = picks[i].id; b.broll.title = picks[i].title; } });
	console.log('B-roll:', br.map((b) => `${b.broll.query} -> ${b.broll.title ?? 'nic'}`).join(' | '));
}
p.plan = {...p.plan, ...plan, questions: plan.questions};
fs.writeFileSync(`projects/${id}/plan_test.json`, JSON.stringify(p.plan, null, 1));
