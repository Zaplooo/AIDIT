// Co autor má rád a co ne – aplikace si to pamatuje napříč videi a AI se tím řídí (plán střihu, chat, pokyny).
// Zdroje: autor sám (stránka „Můj styl“, věty typu „tohle se mi nelíbí“ v AI liště) a jeho úpravy (co maže / přidává).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CATALOG} from './setup.mjs';

const FILE = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'prefs.json');
const EMPTY = {notes: '', likes: [], dislikes: [], removed: {}, added: {}, learned: []};

export const readPrefs = () => {
	try {
		return {...EMPTY, ...JSON.parse(fs.readFileSync(FILE, 'utf-8'))};
	} catch {
		return {...EMPTY};
	}
};
export const writePrefs = (p) => fs.writeFileSync(FILE, JSON.stringify({...EMPTY, ...p}, null, 1), 'utf-8');

export function remember({like, dislike}) {
	const p = readPrefs();
	const add = (list, x) => (x && !list.some((y) => y.toLowerCase() === x.toLowerCase()) ? [...list, x].slice(-40) : list);
	p.likes = add(p.likes, like?.trim());
	p.dislikes = add(p.dislikes, dislike?.trim());
	writePrefs(p);
	return p;
}

// ruční úpravy: které šablony autor maže a které přidává (rozdíl mezi uloženými verzemi projektu)
export function learnFromEdit(oldP, newP) {
	if (!oldP?.plan?.beats || !newP?.plan?.beats) return;
	const types = (p) => p.plan.beats.filter((b) => b.kind === 'gfx' && b.gfx).map((b) => ({id: b.id, t: b.gfx.type}));
	const before = types(oldP);
	const after = types(newP);
	const ids = new Set(after.map((x) => x.id));
	const old = new Set(before.map((x) => x.id));
	const removed = before.filter((x) => !ids.has(x.id));
	const added = after.filter((x) => !old.has(x.id));
	if (!removed.length && !added.length) return;
	const p = readPrefs();
	for (const r of removed) p.removed[r.t] = (p.removed[r.t] ?? 0) + 1;
	for (const a of added) p.added[a.t] = (p.added[a.t] ?? 0) + 1;
	writePrefs(p);
}

// text pro AI
export function prefsText() {
	const p = readPrefs();
	const lab = (t) => CATALOG.gfx.find((g) => g.type === t)?.label ?? t;
	const often = (o) => Object.entries(o).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${lab(t)} (${n}×)`);
	const lines = [];
	if (p.notes.trim()) lines.push(`Autor o svém stylu: ${p.notes.trim()}`);
	if (p.likes.length) lines.push(`Má rád: ${p.likes.join('; ')}`);
	if (p.dislikes.length) lines.push(`NEMÁ rád (nedělej to): ${p.dislikes.join('; ')}`);
	const rm = often(p.removed);
	if (rm.length) lines.push(`Tyhle šablony často maže – používej je málo: ${rm.join(', ')}`);
	const ad = often(p.added);
	if (ad.length) lines.push(`Tyhle šablony si často přidává sám – používej je rád: ${ad.join(', ')}`);
	if (p.learned?.length) lines.push(`Videa, která se autorovi líbí (naučeno z jeho odkazů): ${p.learned.slice(0, 6).map((x) => `„${x.name}“ – ${x.summary}`).join(' | ')}`);
	return lines.join('\n');
}
