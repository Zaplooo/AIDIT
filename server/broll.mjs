// B-roll ze stocku zdarma (Mixkit – licence Mixkit Free, smí se do videí). AI navrhne hledání a vybere záběr podle náhledů.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {askClaude} from './ai.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const cache = new Map();

// stránka z Mixkitu (curl používá certifikáty Windows – Node fetch by kvůli proxy/antiviru neprošel; -L: hledání přesměrovává)
const get = (u) => spawnSync('curl.exe', ['-sL', '--ssl-no-revoke', '-A', UA, u], {encoding: 'utf-8', maxBuffer: 1 << 26}).stdout || '';

// nepoužitelné záběry (zelené plátno, prázdné pozadí, text, loga, animace)
const BAD = /green screen|chroma|blank|background loop|text|logo|animation|animated|3d|render|abstract|frame|intro|template|particles|loop of/;

export function searchMixkit(query) {
	const slug = query.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	if (!slug) return [];
	if (cache.has(slug)) return cache.get(slug);
	const seen = new Set();
	const out = [];
	const parse = (html) => {
		for (const m of html.matchAll(/free-stock-video\/([a-z0-9-]+)-(\d+)\//g)) {
			if (seen.has(m[2]) || m[1].startsWith('discover')) continue;
			seen.add(m[2]);
			out.push({id: m[2], title: m[1].replace(/-/g, ' ')});
		}
	};
	// fulltext hledání, druhá stránka výsledků, pak záložně kratší dotaz
	parse(get(`https://mixkit.co/free-stock-video/discover/${slug}/`));
	if (out.length && out.length < 24) parse(get(`https://mixkit.co/free-stock-video/discover/${slug}/?page=2`));
	if (out.length < 6) parse(get(`https://mixkit.co/free-stock-video/discover/${slug.split('-').slice(0, 2).join('-')}/`));
	// nové záběry (id > 100000) nemají přímý odkaz ke stažení -> jen starší
	cache.set(slug, out.filter((c) => !BAD.test(c.title) && Number(c.id) < 100000).slice(0, 30));
	return cache.get(slug);
}

const run = (exe, args) =>
	new Promise((resolve) => {
		const p = spawn(exe, args, {stdio: 'ignore'});
		p.on('close', (code) => resolve(code === 0));
		p.on('error', () => resolve(false));
	});

// náhledy kandidátů jednoho místa -> jedna mřížka (AI ji projde očima: kvalita, světlo, jestli záběr opravdu sedí)
async function contactSheet(cands, dir, i, ffmpeg) {
	const ok = [];
	await Promise.all(
		cands.map(async (c, k) => {
			const f = path.join(dir, `b${i}_${k}.jpg`);
			if (await run('curl.exe', ['-s', '-f', '--ssl-no-revoke', '-A', UA, '-o', f, `https://assets.mixkit.co/videos/${c.id}/${c.id}-thumb-360-0.jpg`])) ok[k] = c;
		}),
	);
	let list = cands.filter((c, k) => ok[k]);
	const n = list.length >= 8 ? 8 : list.length > 4 ? list.length - (list.length % 2) : list.length;
	if (!n) return null;
	list = list.slice(0, n);
	// seřazené náhledy do souvislé řady (vzor b<i>_s00.jpg) -> mřížka 4×2 / n×1
	list.forEach((c) => fs.renameSync(path.join(dir, `b${i}_${cands.indexOf(c)}.jpg`), path.join(dir, `b${i}_s${String(list.indexOf(c)).padStart(2, '0')}.jpg`)));
	const sheet = path.join(dir, `misto-${i}.jpg`);
	const tile = n <= 4 ? `${n}x1` : `${n / 2}x2`;
	const done = await run(ffmpeg, ['-v', 'error', '-y', '-i', path.join(dir, `b${i}_s%02d.jpg`), '-vf', `scale=400:225:force_original_aspect_ratio=increase,crop=400:225,tile=${tile}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', sheet]);
	return done ? {file: path.basename(sheet), list, tile} : null;
}

const SYSTEM = `Jsi zkušený střihač a vybíráš B-roll (stock záběry) do krátkého videa. Ke každému místu ve videu dostaneš, co mluvčí říká, a kandidáty.
Vyber záběr, který danou větu nejlépe ilustruje: doslovně nebo jasnou metaforou, aby divák hned pochopil souvislost.
Záběr musí působit prémiově a filmově (hezké světlo, ostrý, moderní, přirozený), hodit se k náladě videa a k ostatním vybraným záběrům.
Nevybírej: zastaralé nebo levně působící záběry, prázdné pozadí, zelené plátno, animace, text v obraze, kýčovité pózy do kamery.
Nevybírej stejný záběr dvakrát. Když se nic opravdu nehodí, vrať id "none" – je lepší B-roll vynechat než dát nesouvisející. Piš česky.`;
const SCHEMA = {type: 'object', properties: {picks: {type: 'array', items: {type: 'object', properties: {beat: {type: 'integer'}, id: {type: 'string'}, why: {type: 'string'}}, required: ['beat', 'id', 'why']}}}, required: ['picks']};

// beats: [{text, query, alt?}] -> [{id, title, why, alts} | null]
export async function pickBroll(beats, config, mood = '') {
	const cands = beats.map((b) => {
		// víc hledání na jedno místo -> víc kandidátů; nejdřív ty, které vrátilo víc dotazů (sedí lépe)
		const qs = [b.query, b.alt, b.query?.split(/\s+/).slice(0, 2).join(' ')].filter((q, k, a) => q && a.indexOf(q) === k);
		const score = new Map();
		for (const q of qs) searchMixkit(q).forEach((c, r) => score.set(c.id, {...c, s: (score.get(c.id)?.s ?? 0) + 1 + (30 - r) / 60}));
		return [...score.values()].sort((a, b) => b.s - a.s).slice(0, 16).map(({s, ...c}) => c);
	});
	// náhledy: AI se podívá na skutečné záběry (ne jen na název)
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidit-broll-'));
	let sheets = [];
	try {
		sheets = await Promise.all(cands.map((c, i) => (c.length ? contactSheet(c.slice(0, 8), dir, i, config.ffmpeg || 'ffmpeg') : null)));
	} catch {
		sheets = [];
	}
	const line = (b, i) => {
		const sh = sheets[i];
		const head = `MÍSTO ${i}: mluvčí říká „${b.text}“ (hledáno: ${b.query})`;
		if (sh) return `${head}\nNáhledy: soubor ${sh.file} (mřížka ${sh.tile}, pořadí zleva doprava, shora dolů): ${sh.list.map((c, k) => `${k + 1}) ${c.id}=${c.title}`).join('; ')}\nDalší kandidáti bez náhledu: ${cands[i].slice(8).map((c) => `${c.id}=${c.title}`).join('; ') || 'žádní'}`;
		return `${head}\nKandidáti: ${cands[i].map((c) => `${c.id}=${c.title}`).join('; ') || 'žádní'}`;
	};
	const prompt = `Nálada videa: ${mood}\n${sheets.some(Boolean) ? 'U každého místa si nejdřív prohlédni soubor s náhledy (nástroj Read) a vyber podle toho, jak záběr opravdu vypadá.\n' : ''}\n${beats.map(line).join('\n\n')}`;
	let r;
	try {
		r = await askClaude(config, prompt, SYSTEM, {schema: SCHEMA, timeoutMs: 420000, ...(sheets.some(Boolean) ? {readDir: dir} : {})});
	} catch {
		r = await askClaude(config, beats.map((b, i) => `MÍSTO ${i}: mluvčí říká „${b.text}“\nKandidáti: ${cands[i].map((c) => `${c.id}=${c.title}`).join('; ') || 'žádní'}`).join('\n\n'), SYSTEM, {schema: SCHEMA, timeoutMs: 240000});
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
	const used = new Set();
	return beats.map((b, i) => {
		const p = r.picks.find((x) => x.beat === i);
		const c = p && p.id !== 'none' ? cands[i].find((x) => x.id === String(p.id)) : null;
		if (!c || used.has(c.id)) return null;
		used.add(c.id);
		// další kandidáti: autor si v timeline může vybrat jiný záběr
		return {...c, why: p.why, alts: cands[i].filter((x) => x.id !== c.id).slice(0, 10)};
	});
}
