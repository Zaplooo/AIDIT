// Knihovna zvukových efektů: Mixkit (public/sfx2, zdarma i komerčně) + autorovy vlastní (public/sfx).
// Kategorie odpovídají tomu, kde se efekt ve videu použije (look.sfxSet[kategorie] = vybrané soubory).
export type SfxItem = {id: string; file: string; cat: string; name: string; own?: boolean};

export const SFX_CATS: {cat: string; label: string; use: string}[] = [
	{cat: 'whoosh', label: 'Whoosh', use: 'nástup grafiky a B-rollu'},
	{cat: 'transition', label: 'Přechody', use: 'přechod mezi částmi'},
	{cat: 'swipe', label: 'Swipe', use: 'karty, posun'},
	{cat: 'pop', label: 'Pop', use: 'štítky, tlačítka'},
	{cat: 'click', label: 'Click', use: 'body seznamu'},
	{cat: 'impact', label: 'Náraz / hit', use: 'čísla, důraz, hook'},
	{cat: 'boom', label: 'Bass / boom', use: 'velký důraz, obří slova'},
	{cat: 'riser', label: 'Riser', use: 'náběh před pointou'},
	{cat: 'notification', label: 'Notifikace', use: 'chat zprávy'},
	{cat: 'typing', label: 'Psaní', use: 'AI okno, text'},
	{cat: 'tick', label: 'Tikání', use: 'odpočet, čas'},
	{cat: 'cash', label: 'Peníze', use: 'částky, ceny'},
	{cat: 'success', label: 'Úspěch', use: 'fajfky, výsledek'},
	{cat: 'error', label: 'Chyba', use: 'špatně, ✗'},
	{cat: 'ding', label: 'Ding', use: 'tip, nápad'},
	{cat: 'magic', label: 'Kouzlo / třpyt', use: 'odhalení, wow'},
	{cat: 'glitch', label: 'Glitch', use: 'digitální přechod'},
	{cat: 'camera', label: 'Foťák', use: 'snímek, záběr'},
];

let cache: Promise<SfxItem[]> | null = null;
export const resetSfx = () => (cache = null);
export const loadSfx = () =>
	(cache ??= Promise.all([fetch('/sfx2/library.json').then((r) => r.json()), fetch('/sfx/library.json?v=' + Date.now()).then((r) => r.json()).catch(() => [])]).then(([a, b]: [SfxItem[], SfxItem[]]) => {
		const all = [...b, ...a];
		const n: Record<string, number> = {};
		return all.map((x) => ({...x, name: x.own ? x.name : `${SFX_CATS.find((c) => c.cat === x.cat)?.label ?? x.cat} ${(n[x.cat] = (n[x.cat] ?? 0) + 1)}`}));
	}));
