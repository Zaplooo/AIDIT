// Načasování grafiky podle řeči: položky seznamu / karet / tlačítek / slov naskočí přesně ve chvíli,
// kdy je mluvčí vysloví („první je já, druhý ty, třetí on“ -> já … ty … on, ne všechno naráz).
const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
const STOP = new Set(['a', 'i', 'je', 'to', 'na', 'v', 've', 's', 'se', 'z', 'do', 'od', 'po', 'pro', 'za', 'k', 'ke', 'o', 'u', 'bez', 'nebo', 'jak', 'co', 'ten', 'ta', 'tu', 'si', 'mit', 'byt']);
const stem = (w) => w.slice(0, Math.max(3, Math.min(5, w.length - 1)));

// texty položek grafiky (v pořadí, jak se animují)
export function itemTexts(g) {
	if (!g) return null;
	switch (g.type) {
		case 'list':
		case 'chips':
		case 'timeline':
			return g.items;
		case 'cards':
		case 'side':
			return g.items.map((c) => `${c.title} ${c.sub ?? ''}`);
		case 'bars':
			return g.items.map((b) => b.label);
		case 'kinetic':
		case 'slam':
			return g.words;
		case 'custom':
			return g.items.map((x) => `${x.text ?? ''} ${x.sub ?? ''}`);
		case 'chat':
			return g.messages.map((m) => m.text);
		default:
			return null;
	}
}

// words: [{wi, text, start}] v čase výstupu. Vrátí časy položek (s od začátku beatu) nebo null.
export function itemTimes(g, beatStart, words) {
	const items = itemTexts(g);
	if (!items || items.length < 2) return null;
	const win = words.filter((w) => w.start >= beatStart - 0.3 && w.start <= beatStart + 16);
	const toks = win.map((w) => stem(norm(w.text)[0] ?? ''));
	const times = [];
	let cursor = 0;
	for (const it of items) {
		const keys = norm(it).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);
		let hit = -1;
		for (let j = cursor; j < toks.length && hit < 0; j++) if (keys.some((k) => toks[j] && (toks[j].startsWith(k) || k.startsWith(toks[j])) && toks[j].length >= 3)) hit = j;
		if (hit < 0) {
			times.push(null);
			continue;
		}
		times.push(Math.max(0, win[hit].start - beatStart - 0.08));
		cursor = hit + 1;
	}
	const found = times.filter((t) => t !== null).length;
	if (found < Math.ceil(items.length / 2)) return null; // většina se nenašla -> raději rovnoměrně
	// chybějící dopočítat mezi sousedy, zajistit rostoucí pořadí
	for (let i = 0; i < times.length; i++) {
		if (times[i] !== null) continue;
		const prev = i > 0 ? times[i - 1] : 0.2;
		const next = times.slice(i + 1).find((t) => t !== null);
		times[i] = next !== undefined ? (prev + next) / 2 : prev + 0.6;
	}
	for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1] + 0.18);
	return times.map((t) => +t.toFixed(2));
}

// projde beaty plánu: doplní časy položek a prodlouží grafiku, aby vydržela do posledního bodu (+ chvilka na přečtení)
export function syncBeats(beats, words) {
	const byWi = new Map(words.map((w) => [w.wi, w]));
	for (const b of beats) {
		if (b.kind !== 'gfx' || !b.gfx) continue;
		const w = byWi.get(b.wi);
		if (!w) continue;
		const t = itemTimes(b.gfx, w.start + (b.shift ?? 0), words);
		if (!t) {
			delete b.gfx.times;
			continue;
		}
		b.gfx.times = t;
		b.dur = Math.min(Math.max(b.dur, t[t.length - 1] + 1.4), 9);
	}
	return beats;
}
