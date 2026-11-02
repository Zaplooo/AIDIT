// Nastavení z průvodce (setup) -> vzhled projektu (look + titulky). Stejný katalog jako v aplikaci (shared/catalog.json).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'catalog.json'), 'utf-8'));

export const defaultSetup = (platform = 'reels') => ({
	color: '#3D7BFF',
	bg: platform === 'youtube' ? 'brand' : 'dark',
	font: 'Inter Tight',
	caption: platform === 'youtube' ? 'minimal' : 'goat',
	captionsOn: true,
	gfx: [],
	gfxAmount: 'mid',
	zoom: 'none',
	hook: {visual: 'title', sfx: true, text: ''},
	music: {mode: 'auto'},
	sfx: 'soft',
	broll: 'some',
	tempo: platform === 'youtube' ? 'normal' : 'fast',
	maxLength: null,
	layout: 'full',
});

export const withDefaults = (s, platform = 'reels') => {
	const d = defaultSetup(platform);
	return {...d, ...(s ?? {}), hook: {...d.hook, ...(s?.hook ?? {})}, music: {...d.music, ...(s?.music ?? {})}};
};

const resolveColor = (v, color) => (v === '$color' ? color : Array.isArray(v) ? v.map((x) => resolveColor(x, color)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveColor(x, color)])) : v);

const accentFor = (s) => (s.bg === 'brand' ? (/^#(FFD84D|FACC15|F59E0B|FFFFFF|A3E635)$/i.test(s.color) ? '#111111' : '#FFD84D') : s.color);

// přepíše vzhled podle nastavení; hudbu řeší makePlan (potřebuje náladu z AI plánu)
export function applySetup(look, captions, setup) {
	const s = withDefaults(setup, look.platform);
	const cap = CATALOG.captions.find((c) => c.id === s.caption) ?? CATALOG.captions[0];
	const accent = accentFor(s);
	return {
		look: {
			...look,
			accent,
			tempo: s.tempo,
			sfx: s.sfx,
			maxLength: s.maxLength,
			layout: s.layout,
			jump: s.zoom === 'jump' ? 'punch' : 'hard',
			zoom: s.zoom !== 'none',
			zoomStyle: s.zoom,
			hook: {...s.hook},
			theme: {bg: s.bg, font: s.font, serif: s.serif ?? look.theme?.serif ?? 'DM Serif Display', brand: s.color},
			gfxAllowed: s.gfx,
			sfxSet: s.sfxSet ?? look.sfxSet,
		},
		captions: {
			// styl titulků z katalogu ($color = hlavní barva) + vlastní úpravy autora; nepoužité volby předchozího stylu se smažou
			...Object.fromEntries(Object.entries(captions).filter(([k]) => !['alt', 'active', 'stroke', 'strokeColor', 'box', 'italic'].includes(k))),
			...resolveColor(cap.style, s.color === '#111111' ? '#FFD84D' : s.color),
			enabled: s.captionsOn !== false,
			highlight: cap.hl === 'color' ? (s.color === '#111111' ? '#FFD84D' : s.color) : cap.hl,
			...(s.captionCustom ?? {}),
		},
	};
}

// popis nastavení pro AI (plánovač, chat)
export function describeSetup(setup) {
	const s = withDefaults(setup);
	const lab = (list, id, k = 'id') => list.find((x) => x[k] === id)?.label ?? id;
	return [
		`hlavní barva ${s.color}, pozadí grafiky ${lab(CATALOG.bgs, s.bg)}, font grafiky ${s.font}`,
		`titulky: ${s.captionsOn === false ? 'vypnuté' : lab(CATALOG.captions, s.caption)}`,
		`motion grafika: ${s.gfx.length ? s.gfx.map((t) => lab(CATALOG.gfx, t, 'type')).join(', ') : 'vybere AI'}; množství ${s.gfxAmount}`,
		`zoom: ${lab(CATALOG.zooms, s.zoom)}`,
		`hook: ${lab(CATALOG.hooks, s.hook.visual)}${s.hook.sfx ? ' + výrazný zvuk' : ''}${s.hook.text ? ` – text „${s.hook.text}“` : ''}`,
		`hudba: ${s.music.mode === 'off' ? 'bez hudby' : s.music.mode === 'auto' ? 'AI podle nálady' : s.music.mode === 'mood' ? `nálada ${s.music.mood}` : `skladba ${s.music.name ?? s.music.file}`}`,
		`zvukové efekty ${s.sfx}, B-roll ${s.broll}, tempo ${s.tempo}, délka ${s.maxLength ? `do ${s.maxLength} s` : 'bez limitu'}`,
	].join('\n');
}

// styl (z referencí nebo z odkazu) -> nastavení průvodce, aby šel dál upravit kartami
export function styleToSetup(st) {
	const look = st.look ?? {};
	const cap = st.captions ?? {};
	const rec = st.recipe ?? {};
	const types = new Set(CATALOG.gfx.map((g) => g.type));
	const bpm = Number(rec.beatsPerMinute) || 9;
	const capId = {goat: 'goat', bold: 'bold', mix: 'mix', word: 'word'}[cap.mode] ?? 'duo';
	return withDefaults({
		color: /^#[0-9a-f]{6}$/i.test(look.accent ?? '') ? look.accent.toUpperCase() : '#3D7BFF',
		bg: st.theme?.bg ?? 'dark',
		font: st.theme?.font ?? 'Inter Tight',
		caption: capId,
		captionCustom: Object.fromEntries(Object.entries({font: cap.font, size: cap.size, textCase: cap.textCase, maxWords: cap.maxWords, y: cap.y, animation: cap.animation, color: cap.color}).filter(([, v]) => v !== undefined && v !== null)),
		gfx: (rec.preferredGfx ?? []).filter((t) => types.has(t)),
		gfxAmount: bpm < 7 ? 'low' : bpm < 12 ? 'mid' : 'high',
		zoom: look.zoom ? 'punch' : look.jump === 'punch' ? 'jump' : 'none',
		hook: {visual: 'title', sfx: (look.sfx ?? 'soft') !== 'off', text: ''},
		music: look.music === 'off' ? {mode: 'off'} : {mode: 'auto'},
		sfx: look.sfx ?? 'soft',
		broll: (rec.brollShare ?? 0.1) > 0.25 ? 'lots' : (rec.brollShare ?? 0.1) > 0.03 ? 'some' : 'off',
		tempo: look.tempo ?? 'normal',
		layout: look.layout === 'framed' ? 'framed' : 'full',
	}, st.platform);
}
