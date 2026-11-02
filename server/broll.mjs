// B-roll ze stocku zdarma (Mixkit – licence Mixkit Free, smí se do videí). AI navrhne hledání, vybere nejlepší záběr.
import {spawnSync} from 'node:child_process';
import {askClaude} from './ai.mjs';

const UA = 'Mozilla/5.0';
const cache = new Map();

// hledání na Mixkitu (curl používá certifikáty Windows – Node fetch by kvůli proxy/antiviru neprošel)
export function searchMixkit(query) {
	const slug = query.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	if (cache.has(slug)) return cache.get(slug);
	const get = (u) => spawnSync('curl.exe', ['-s', '--ssl-no-revoke', '-A', UA, u], {encoding: 'utf-8', maxBuffer: 1 << 26}).stdout || '';
	const seen = new Set();
	const out = [];
	const parse = (html) => {
		for (const m of html.matchAll(/free-stock-video\/([a-z0-9-]+)-(\d+)\//g)) {
			if (seen.has(m[2]) || m[1].startsWith('discover')) continue;
			seen.add(m[2]);
			out.push({id: m[2], title: m[1].replace(/-/g, ' ')});
		}
	};
	// fulltext hledání Mixkitu, pak záložně štítek podle prvního slova
	parse(get(`https://mixkit.co/free-stock-video/discover/${slug}/`));
	if (out.length < 6) parse(get(`https://mixkit.co/free-stock-video/${slug}/`));
	if (out.length < 6) parse(get(`https://mixkit.co/free-stock-video/discover/${slug.split('-').slice(0, 2).join('-')}/`));
	// nepoužitelné záběry (zelené plátno, prázdné pozadí, text, loga) pryč
	const bad = /green screen|chroma|blank|background loop|text|logo|animation|3d|render|abstract|frame/;
	// nové záběry (id > 100000) nemají přímý odkaz ke stažení -> jen starší
	cache.set(slug, out.filter((c) => !bad.test(c.title) && Number(c.id) < 100000).slice(0, 18));
	return cache.get(slug);
}

const SYSTEM = `Vybíráš B-roll (stock záběry) do krátkého videa. Ke každému místu ve videu dostaneš, co mluvčí říká, a seznam kandidátů (id + popis záběru).
Vyber záběr, který danou větu nejlépe a doslovně ilustruje, působí prémiově/filmově a hodí se k náladě videa.
Nevybírej stejný záběr dvakrát. Nevybírej záběry, které by v reálném videu působily divně (zelené plátno, prázdné pozadí, animace). Když se nic nehodí, vrať id "none". Piš česky.`;
const SCHEMA = {type: 'object', properties: {picks: {type: 'array', items: {type: 'object', properties: {beat: {type: 'integer'}, id: {type: 'string'}, why: {type: 'string'}}, required: ['beat', 'id', 'why']}}}, required: ['picks']};

// beats: [{text, query, alt?}] -> [{id, title} | null]
export async function pickBroll(beats, config, mood = '') {
	const cands = beats.map((b) => {
		let list = searchMixkit(b.query);
		if (list.length < 4 && b.alt) list = [...list, ...searchMixkit(b.alt)];
		return list.slice(0, 14);
	});
	const prompt = `Nálada videa: ${mood}\n\n` + beats.map((b, i) => `MÍSTO ${i}: mluvčí říká „${b.text}“ (hledáno: ${b.query})\nKandidáti: ${cands[i].map((c) => `${c.id}=${c.title}`).join('; ') || 'žádní'}`).join('\n\n');
	const r = await askClaude(config, prompt, SYSTEM, {schema: SCHEMA, timeoutMs: 240000});
	const used = new Set();
	return beats.map((b, i) => {
		const p = r.picks.find((x) => x.beat === i);
		const c = p && p.id !== 'none' ? cands[i].find((x) => x.id === p.id) : null;
		if (!c || used.has(c.id)) return null;
		used.add(c.id);
		// další kandidáti: autor si v timeline může vybrat jiný záběr
		return {...c, why: p.why, alts: cands[i].filter((x) => x.id !== c.id).slice(0, 8)};
	});
}
