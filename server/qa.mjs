// Závěrečná kontrola hotového střihu (bez AI, čistě měření): najde chyby, které by divák viděl, a opraví je dřív, než se složí náhled.
// Vrací {fixed: [...], warnings: [...]} – řádky jdou do průběhu zpracování a do project.qa.
import fs from 'node:fs';
import path from 'node:path';

const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const FULL = (b) => b.kind === 'broll' || (b.kind === 'gfx' && (b.layout ?? 'full') === 'full');
const hasText = (v) => (typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.some(hasText) : v && typeof v === 'object' ? Object.entries(v).some(([k, x]) => !['type', 'times', 'layout', 'motion', 'emph', 'icon', 'kind'].includes(k) && hasText(x)) : typeof v === 'number');

export function verifyProject(p, dir) {
	const fixed = [];
	const warnings = [];
	const fps = p.source.fps;
	// rozložení klipů a slov ve výstupu (stejné pravidlo jako titulky)
	const laid = [];
	let f = 0;
	for (const c of p.clips)
		if (c.enabled) {
			const inF = Math.round(c.in * fps);
			const durF = Math.max(1, Math.round(c.out * fps) - inF);
			laid.push({c, from: f / fps, dur: durF / fps});
			f += durF;
		}
	const total = f / fps;
	const heard = (c) => p.words.map((w, wi) => ({...w, wi})).filter((w) => Math.min(w.end, c.out) - Math.max(w.start, c.in) >= Math.min(0.5 * (w.end - w.start), 0.12));
	const outStart = new Map();
	for (const l of laid) for (const w of heard(l.c)) if (!outStart.has(w.wi)) outStart.set(w.wi, l.from + Math.max(w.start, l.c.in) - l.c.in);

	// 1) stejná pasáž dvakrát (4 slova po sobě ve dvou různých klipech)
	const seen = new Map();
	for (const [k, l] of laid.entries()) {
		const ws = heard(l.c).map((w) => norm(w.text)).filter(Boolean);
		const mine = new Set();
		for (let i = 0; i + 4 <= ws.length; i++) mine.add(ws.slice(i, i + 4).join(' '));
		const hit = [...mine].find((g) => seen.has(g));
		if (hit) warnings.push(`Možné zdvojení: „${hit}“ zazní v klipu ${seen.get(hit) + 1} i ${k + 1}`);
		for (const g of mine) if (!seen.has(g)) seen.set(g, k);
	}
	// 2) útržky: klip kratší než 0,35 s působí jako zaseknutí
	for (const l of laid) if (l.dur < 0.35 && laid.length > 1) warnings.push(`Velmi krátký klip (${l.dur.toFixed(2)} s) v čase ${l.from.toFixed(1)} s`);

	// 3) prvky střihu: prázdné, mimo video, nepřipravené, přes sebe, moc brzo po sobě
	const plan = p.plan ?? {};
	const cuts = laid.slice(1).map((l) => l.from);
	const hookEnd = p.look?.hook?.visual && !['none', 'zoom'].includes(p.look.hook.visual) ? 2.2 : 0;
	let beats = (plan.beats ?? []).map((b) => ({b, start: b.at !== undefined ? b.at : outStart.has(b.wi) ? outStart.get(b.wi) + (b.shift ?? 0) : null}));
	const drop = (x, why) => {
		x.gone = true;
		fixed.push(why);
	};
	for (const x of beats) {
		const {b} = x;
		if (x.start === null) drop(x, `Prvek „${b.kind}“ ukazoval na vystřižené slovo – odebrán`);
		else if (x.start > total - 0.6) drop(x, `Prvek „${b.kind}“ by začínal až na konci videa – odebrán`);
		else if (b.kind === 'gfx' && !hasText(b.gfx)) drop(x, 'Grafika bez obsahu – odebrána');
		else if (b.kind === 'chip' && !b.chip?.trim()) drop(x, 'Prázdný štítek – odebrán');
		else if (b.kind === 'broll' && !(b.broll?.mixkit && b.broll.ready && fs.existsSync(path.join(dir, 'broll', `${b.id}.mp4`)))) drop(x, 'B-roll se nepodařilo připravit – odebrán');
		else if (b.kind !== 'chip' && b.kind !== 'punch' && x.start < hookEnd - 0.05 && b.at === undefined) drop(x, 'Prvek by překryl úvodní hook – odebrán');
	}
	beats = beats.filter((x) => !x.gone).sort((a, b) => a.start - b.start);
	const big = beats.filter((x) => x.b.kind !== 'chip' && x.b.kind !== 'punch');
	for (let i = 0; i < big.length; i++) {
		const x = big[i];
		const next = big[i + 1];
		// dost času na přečtení
		const min = x.b.kind === 'gfx' ? 1.6 : 1.2;
		let end = x.start + x.b.dur;
		if (next && next.start < end + 0.25) {
			// dva prvky nalepené na sebe: první zkrátit; když by na něj nezbyl čas, slabší (pozdější) jde pryč
			if (next.start - 0.25 - x.start >= min) {
				x.b.dur = Number((next.start - 0.25 - x.start).toFixed(2));
				fixed.push(`Prvky se překrývaly v ${next.start.toFixed(1)} s – první zkrácen`);
			} else {
				next.gone = true;
				fixed.push(`Dva prvky hned po sobě v ${next.start.toFixed(1)} s – druhý odebrán`);
				big.splice(i + 1, 1);
				i--;
				continue;
			}
			end = x.start + x.b.dur;
		}
		if (end > total) x.b.dur = Number(Math.max(0.5, total - x.start).toFixed(2));
		// střih těsně za koncem / před začátkem celoobrazovkového prvku: prvek ho přikryje (skok v obraze není vidět)
		if (FULL(x.b) && x.b.at === undefined) {
			// B-roll má připravený záběr jen o 0,4 s delší -> menší okno a jen jedno prodloužení
			const win = x.b.kind === 'broll' ? 0.2 : 0.3;
			const after = cuts.find((c) => c > end - 0.05 && c < end + win);
			let grown = false;
			if (after && (!next || next.start > after + 0.4) && after + 0.12 < total) {
				x.b.dur = Number((after + 0.12 - x.start).toFixed(2));
				fixed.push(`Prvek v ${x.start.toFixed(1)} s prodloužen přes střih (skok v obraze není vidět)`);
				grown = true;
			}
			const before = grown && x.b.kind === 'broll' ? null : cuts.find((c) => c < x.start + 0.05 && c > x.start - win);
			const prev = big[i - 1];
			if (before && before - 0.12 > hookEnd && (!prev || prev.start + prev.b.dur < before - 0.4)) {
				const d = x.start - (before - 0.12);
				x.b.shift = Number(((x.b.shift ?? 0) - d).toFixed(2));
				x.b.dur = Number((x.b.dur + d).toFixed(2));
				// položky grafiky načasované na slova zůstanou na svých slovech
				if (x.b.gfx?.times) x.b.gfx.times = x.b.gfx.times.map((t) => Number((t + d).toFixed(2)));
				x.start -= d;
				fixed.push(`Prvek v ${x.start.toFixed(1)} s začíná těsně před střihem (skok v obraze není vidět)`);
			}
		}
	}
	const keep = new Set(beats.filter((x) => !x.gone).map((x) => x.b.id));
	if (plan.beats) plan.beats = plan.beats.filter((b) => keep.has(b.id));
	// 4) zvuky a emoji na vystřižených slovech
	if (plan.sounds) {
		const n = plan.sounds.length;
		plan.sounds = plan.sounds.filter((s) => s.at !== undefined || outStart.has(s.wi));
		if (plan.sounds.length < n) fixed.push(`${n - plan.sounds.length} zvuků ukazovalo na vystřižená slova – odebrány`);
	}
	if (plan.emojis) for (const wi of Object.keys(plan.emojis)) if (!outStart.has(Number(wi))) delete plan.emojis[wi];
	// 5) hudba
	const mf = p.look?.music?.file;
	if (mf && !fs.existsSync(path.join(dir, '..', '..', 'public', mf)) && !fs.existsSync(path.join(dir, mf))) warnings.push(`Hudba „${p.look.music.name ?? mf}“ nebyla nalezena`);
	p.qa = {at: new Date().toISOString(), fixed, warnings, clips: laid.length, duration: Number(total.toFixed(1))};
	return p.qa;
}
