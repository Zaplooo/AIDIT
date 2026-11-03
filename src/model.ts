// Projekt = jeden JSON. AI i uživatel mění jen tenhle JSON; náhled i render z něj počítají stejný výsledek.
// Obraz + hlas jsou předpřipravené jako jedno souvislé video (base_*.mp4), přes něj se kreslí titulky, karty a zvuky.

export type Word = {text: string; start: number; end: number; p?: number};

export type Clip = {
	id: string;
	in: number; // zdrojový čas (s)
	out: number;
	enabled: boolean;
	reason?: string | null;
	words?: number[];
	face?: {x: number; y: number} | null;
};

// věta / pokus – to, co uživatel vidí v seznamu „Co AI stříhá“
export type Unit = {id: string; text: string; start: number; end: number; keep: boolean; reason?: string | null};

export type Format = '9:16' | '16:9' | '1:1';
export type Kind = 'short' | 'long';
export type CaptionMode = 'goat' | 'bold' | 'word' | 'mix' | 'custom';

export type CaptionStyle = {
	enabled: boolean;
	mode: CaptionMode;
	font: string;
	weight: number;
	size: number; // px při šířce 1080
	color: string;
	highlight: string;
	textCase: 'lower' | 'upper' | 'normal';
	maxWords: number;
	y: number;
	animation: 'fade-up' | 'pop' | 'none' | 'blur' | 'karaoke' | 'typewriter' | 'bounce' | 'slide' | 'rise' | 'zoom';
	emoji?: boolean; // emoji u klíčových slov (vybírá AI -> plan.emojis)
	shadow: boolean;
	// vlastní kombinace (mode 'custom' – a funguje i v ostatních režimech)
	italic?: boolean;
	stroke?: number; // obrys písmen (px při šířce 1080)
	strokeColor?: string;
	box?: string; // podklad pod celým řádkem (např. #000000aa)
	alt?: {every: 'none' | 'alternate' | 'keyword' | 'third'; font?: string; italic?: boolean; color?: string; scale?: number}; // druhý font
	active?: {font?: string; italic?: boolean; color?: string; scale?: number; box?: string; glow?: boolean}; // právě vyslovené slovo
};

export type Look = {
	preset: string;
	tempo: 'calm' | 'normal' | 'fast';
	jump: 'hard' | 'punch';
	grade: 'none' | 'cinematic' | 'dark' | 'warm';
	layout: 'full' | 'framed' | 'split';
	sfx: 'off' | 'soft' | 'bold';
	accent: string;
	cardKind: 'dark' | 'mono' | 'panel' | 'cream' | 'none';
	music: {file: string; name: string; volume: number; custom?: boolean; auto?: boolean; start?: number} | null;
	muteVoice?: boolean; // montáž bez mluvení: zvuk záběrů vypnutý, hraje jen hudba
	sfxSet?: Record<string, string[]>; // vybrané efekty pro kategorie (co autor nechce, tu není)
	maxLength: number | null;
	platform?: 'reels' | 'youtube';
	theme?: {bg: 'dark' | 'cream' | 'brand' | 'glass' | 'white' | 'black'; font: string; serif: string; brand?: string};
	zoom?: boolean; // důrazné přiblížení na klíčových větách
	zoomStyle?: 'none' | 'punch' | 'jump' | 'pulse' | 'creep' | 'ken';
	hook?: {visual: 'none' | 'title' | 'box' | 'split' | 'full' | 'broll' | 'zoom'; sfx: boolean; text: string};
	gfxAllowed?: string[];
	lockCut?: boolean; // „už je sestříhané“ – AI už nevybírá věty ani nestříhá
};

export type Card = {id: string; wi: number; dur: number; text: string; sub?: string};

import type {Gfx} from './remotion/gfx';
export type {Gfx};
// Beat = jeden „střihový moment“ naplánovaný AI: grafika, B-roll, štítek nebo důrazné přiblížení
export type Beat = {
	id: string;
	wi: number; // index slova, kde beat začíná
	dur: number;
	kind: 'gfx' | 'broll' | 'chip' | 'punch';
	layout?: 'full' | 'split' | 'pip' | 'overlay'; // u grafiky: přes celou obrazovku / nahoře grafika + dole mluvčí / grafika + mluvčí v rohu
	gfx?: Gfx;
	broll?: {query: string; alt?: string; mixkit?: string; title?: string; ready?: boolean; alts?: {id: string; title: string}[]};
	chip?: string;
	why?: string;
	shift?: number; // posun začátku od slova wi (s) – z timeline
	at?: number; // pevný čas začátku (s) – montáž bez mluvení, kde nejsou slova
	pos?: {x: number; y: number; scale: number}; // posun grafiky (podíl šířky/výšky) a velikost
	font?: string; // vlastní font grafiky
	sfx?: string | null; // vlastní zvuk (soubor) nebo null = bez zvuku
};

export type Plan = {
	summary: string;
	title: string;
	hook: string;
	thinking: string[];
	keywords: number[]; // indexy slov, která se zvýrazní
	cards: Card[];
	beats?: Beat[];
	mood?: string;
	questions: {id: string; question: string; options: {label: string; value: string; hint?: string}[]; answer?: string}[];
	emojis?: Record<number, string>; // emoji k slovům (index slova -> emoji)
	sounds?: {id: string; wi: number; shift?: number; file: string; vol?: number; name?: string}[]; // zvuky, které autor přidal sám
	sfxEdit?: Record<string, {off?: boolean; file?: string; vol?: number; dt?: number}>; // úpravy automatických efektů z timeline
};

export type Project = {
	version: 2;
	id: string;
	name: string;
	createdAt: string;
	kind: Kind;
	format: Format;
	styleId: string;
	source: {proxy: string; voice: string; width: number; height: number; fps: number; duration: number};
	words: Word[];
	clips: Clip[];
	units: Unit[];
	captions: CaptionStyle;
	look: Look;
	plan: Plan;
	base: {key: string; preview: string | null; full: string | null};
	segments?: {start: number; end: number; name: string}[] | null;
};

export const FORMATS: Record<Format, {w: number; h: number; label: string}> = {
	'9:16': {w: 1080, h: 1920, label: 'Na výšku 9:16'},
	'16:9': {w: 1920, h: 1080, label: 'Na šířku 16:9'},
	'1:1': {w: 1080, h: 1080, label: 'Čtverec 1:1'},
};

// Safe zóny (px při 1080×1920) – kde Reels/TikTok/Shorts zakrývají video rozhraním. Přibližné hodnoty.
export const SAFE_916 = {top: 220, bottom: 480, left: 60, right: 150};

// co ovlivňuje obraz/zvuk (když se změní, přepočítá se souvislé video)
export const baseKey = (p: Project) =>
	JSON.stringify([p.format, p.look.jump, p.look.grade, p.clips.filter((c) => c.enabled).map((c) => [c.in, c.out, c.face?.x ?? null])]);

export type LaidClip = Clip & {fromF: number; durF: number; inF: number};
export type TlWord = {wi: number; text: string; start: number; end: number; clip: string; key: boolean};
export type Group = {start: number; end: number; words: TlWord[]};
export type LaidCard = Card & {start: number; end: number};
export type LaidBeat = Beat & {start: number; end: number};
export type Layout = {fps: number; clips: LaidClip[]; durationInFrames: number; words: TlWord[]; groups: Group[]; cards: LaidCard[]; beats: LaidBeat[]};

const GLUE = new Set(['a', 'i', 'k', 'ke', 'o', 's', 'se', 'u', 'v', 've', 'z', 'ze', 'na', 'do', 'od', 'po', 'za', 'pro', 'při', 'bez', 'nad', 'pod', 'před', 'přes', 'mezi', 'to', 'je', 'že', 'aby', 'abys', 'jak', 'co', 'the', 'a', 'to', 'of', 'in']);
const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function layout(p: Project): Layout {
	const fps = p.source.fps;
	const clips: LaidClip[] = [];
	let f = 0;
	for (const c of p.clips) {
		if (!c.enabled) continue;
		const inF = Math.round(c.in * fps);
		const durF = Math.max(1, Math.round(c.out * fps) - inF);
		clips.push({...c, fromF: f, durF, inF});
		f += durF;
	}
	const keys = new Set(p.plan?.keywords ?? []);
	const words: TlWord[] = [];
	p.words.forEach((w, wi) => {
		let best: LaidClip | null = null;
		let bestOv = 0;
		for (const c of clips) {
			const ov = Math.min(w.end, c.out) - Math.max(w.start, c.in);
			if (ov > bestOv) {
				bestOv = ov;
				best = c;
			}
		}
		// slovo patří do klipu, když je v něm aspoň polovina slova NEBO aspoň 0,12 s (Whisper často natáhne začátek slova přes ticho před ním)
		if (!best || bestOv < Math.max(Math.min(0.5 * (w.end - w.start), 0.12), 0.02)) return;
		const base = best.fromF / fps - best.in;
		const s = Math.max(w.start, best.in) + base;
		const e = Math.min(w.end, best.out) + base;
		words.push({wi, text: w.text, start: s, end: Math.max(e, s + 0.05), clip: best.id, key: keys.has(wi)});
	});
	words.sort((a, b) => a.start - b.start);
	const total = Math.max(f, 1) / fps;
	const byWi = new Map(words.map((w) => [w.wi, w]));
	const cards: LaidCard[] = [];
	for (const c of p.plan?.cards ?? []) {
		const w = byWi.get(c.wi);
		if (!w) continue; // karta je u slova, které je vystřižené
		const start = w.start;
		cards.push({...c, start, end: Math.min(start + c.dur, total)});
	}
	cards.sort((a, b) => a.start - b.start);
	for (let i = 0; i < cards.length - 1; i++) cards[i].end = Math.min(cards[i].end, cards[i + 1].start - 0.05);
	// beaty: začátek na slově, konec nejpozději před dalším beatem stejného druhu (chip může běžet přes jiné)
	const beats: LaidBeat[] = [];
	for (const b of p.plan?.beats ?? []) {
		const w = byWi.get(b.wi);
		if (!w && b.at === undefined) continue;
		const start = Math.max(0, b.at !== undefined ? b.at : w!.start + (b.shift ?? 0));
		beats.push({...b, start, end: Math.min(start + b.dur, total)});
	}
	beats.sort((a, b) => a.start - b.start);
	const big = beats.filter((b) => b.kind !== 'chip');
	for (let i = 0; i < big.length - 1; i++) big[i].end = Math.min(big[i].end, big[i + 1].start - 0.02);
	return {fps, clips, durationInFrames: Math.max(f, 1), words, groups: groupWords(words, p.captions.maxWords), cards, beats};
}

export function groupWords(words: TlWord[], maxWords: number): Group[] {
	const groups: Group[] = [];
	let cur: TlWord[] = [];
	const flush = () => {
		if (cur.length) groups.push({start: cur[0].start, end: cur[cur.length - 1].end, words: cur});
		cur = [];
	};
	for (let i = 0; i < words.length; i++) {
		const w = words[i];
		const prev = cur[cur.length - 1];
		if (prev && (w.start - prev.end > 0.6 || w.clip !== prev.clip)) flush();
		cur.push(w);
		const next = words[i + 1];
		const sentenceEnd = /[.?!]$/.test(w.text);
		const glue = maxWords > 1 && GLUE.has(bare(w.text)) && next && next.clip === w.clip;
		if (sentenceEnd || (cur.length >= maxWords && !glue)) flush();
	}
	flush();
	for (let i = 0; i < groups.length; i++) {
		const n = groups[i + 1];
		groups[i].end = n && n.start - groups[i].end < 0.6 ? n.start : groups[i].end + 0.3;
	}
	return groups;
}

export function caseText(t: string, c: CaptionStyle['textCase']) {
	if (c === 'lower') return t.toLowerCase().replace(/[.,;:]+$/u, '');
	if (c === 'upper') return t.toUpperCase().replace(/[.,;:]+$/u, '');
	return t.replace(/[.,;:]+$/u, '');
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
