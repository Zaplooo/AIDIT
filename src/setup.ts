// Nastavení střihu („setup“) – to, co si autor vybere v průvodci krok za krokem (barva, titulky, grafika, zoomy, hook, zvuk, délka).
// Stejný tvar má i uložený styl klienta, takže nové video pro klienta začíná rovnou s jeho stylem.
import catalog from '../shared/catalog.json';
import type {Gfx} from './remotion/gfx';
import type {CaptionStyle} from './model';

export const CATALOG = catalog as unknown as {
	colors: {hex: string; name: string}[];
	bgs: {id: ThemeBg; label: string; desc: string}[];
	fonts: {family: string; label: string; desc: string; cat: string}[];
	fontCats: {id: string; label: string}[];
	types: {id: string; label: string; desc: string; icon: string; format: '9:16' | '16:9' | '1:1'; speech: boolean; music?: string; setup: Partial<Setup>}[];
	captions: {id: string; label: string; desc: string; style: Record<string, unknown>; hl: string}[];
	zooms: {id: ZoomStyle; label: string; desc: string}[];
	hooks: {id: HookVisual; label: string; desc: string}[];
	moods: {id: string; label: string}[];
	gfx: {type: Gfx['type']; label: string; desc: string; overlay?: boolean; sample: Gfx}[];
};

export type ThemeBg = 'dark' | 'cream' | 'brand' | 'glass' | 'white' | 'black';
export type ZoomStyle = 'none' | 'punch' | 'jump' | 'pulse' | 'creep' | 'ken';
export type HookVisual = 'none' | 'title' | 'box' | 'split' | 'full' | 'broll' | 'zoom';
export type CutMode = 'full' | 'pauses' | 'none' | 'montage';

export type Setup = {
	color: string;
	bg: ThemeBg;
	font: string;
	serif?: string; // doplňkové písmo grafiky (kurzíva, zvýraznění)
	caption: string; // id z CATALOG.captions
	captionsOn: boolean;
	captionCustom?: Partial<CaptionStyle>; // vlastní úpravy titulků nad vybraným stylem
	gfx: string[]; // vybrané šablony (prázdné = AI vybere ze všech)
	gfxAmount: 'low' | 'mid' | 'high';
	zoom: ZoomStyle;
	hook: {visual: HookVisual; sfx: boolean; text: string};
	music: {mode: 'auto' | 'mood' | 'track' | 'custom' | 'off'; mood?: string; file?: string; name?: string};
	sfx: 'off' | 'soft' | 'bold';
	sfxSet?: Record<string, string[]>; // vybrané efekty po kategoriích
	broll: 'off' | 'some' | 'lots';
	tempo: 'calm' | 'normal' | 'fast';
	maxLength: number | null;
	layout: 'full' | 'framed';
};

export const defaultSetup = (platform: 'reels' | 'youtube' = 'reels'): Setup => ({
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

export const withDefaults = (s: Partial<Setup> | undefined, platform: 'reels' | 'youtube' = 'reels'): Setup => {
	const d = defaultSetup(platform);
	return {...d, ...(s ?? {}), hook: {...d.hook, ...(s?.hook ?? {})}, music: {...d.music, ...(s?.music ?? {})}};
};

export const label = {
	color: (hex: string) => CATALOG.colors.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex,
	bg: (id: string) => CATALOG.bgs.find((b) => b.id === id)?.label ?? id,
	caption: (id: string) => CATALOG.captions.find((c) => c.id === id)?.label ?? id,
	zoom: (id: string) => CATALOG.zooms.find((z) => z.id === id)?.label ?? id,
	hook: (id: string) => CATALOG.hooks.find((h) => h.id === id)?.label ?? id,
	gfx: (t: string) => CATALOG.gfx.find((g) => g.type === t)?.label ?? t,
	mood: (id?: string) => CATALOG.moods.find((m) => m.id === id)?.label ?? id ?? '',
};

export const musicLabel = (m: Setup['music']) =>
	m.mode === 'off' ? 'Bez hudby' : m.mode === 'auto' ? 'Vybere AI podle nálady' : m.mode === 'mood' ? `Nálada: ${label.mood(m.mood)}` : m.name ?? 'Vlastní skladba';

// motiv grafiky z nastavení (pro náhledy v průvodci)
export const themeFromSetup = (s: Setup) => ({
	accent: s.bg === 'brand' ? (/^#(FFD84D|FACC15|F59E0B|FFFFFF|A3E635)$/i.test(s.color) ? '#111111' : '#FFD84D') : s.color,
	brand: s.color,
	bg: s.bg,
	font: s.font,
	serif: s.serif ?? 'DM Serif Display',
});

// „$color“ v katalogu = hlavní barva autora
const resolve = (v: unknown, color: string): unknown =>
	v === '$color' ? color : Array.isArray(v) ? v.map((x) => resolve(x, color)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, color)])) : v;

// titulky z nastavení: styl z katalogu + vlastní úpravy
export const captionFromSetup = (s: Setup): CaptionStyle => {
	const c = CATALOG.captions.find((x) => x.id === s.caption) ?? CATALOG.captions[0];
	const color = s.color === '#111111' ? '#FFD84D' : s.color;
	const base = resolve(c.style, color) as Omit<CaptionStyle, 'enabled' | 'highlight'>;
	return {enabled: s.captionsOn !== false, highlight: c.hl === 'color' ? color : c.hl, ...base, ...(s.captionCustom ?? {})} as CaptionStyle;
};
