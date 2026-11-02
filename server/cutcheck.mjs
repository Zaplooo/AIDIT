// Kontrola čistoty střihu: žádná věta dvakrát, žádné nedokončené začátky, text musí dávat smysl od začátku do konce.
// 1) algoritmus (rychlý, bez AI): téměř stejné / začátek pozdější věty -> nechat jen poslední verzi
// 2) AI si přečte HOTOVÝ text videa v pořadí a označí, co se opakuje, je useknuté nebo nenavazuje
import {askClaude} from './ai.mjs';

const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
const FILL = new Set(['no', 'takze', 'jako', 'ehm', 'eh', 'hm', 'proste', 'a', 'tak', 'vlastne']);
const core = (t) => norm(t).filter((w) => !FILL.has(w));

// podobnost dvou vět: podíl společných slovních dvojic (pořadí se počítá) + shoda začátku
function similar(a, b) {
	if (!a.length || !b.length) return 0;
	const bi = (x) => new Set(x.slice(0, -1).map((w, i) => w + ' ' + x[i + 1]));
	const A = bi(a);
	const B = bi(b);
	if (A.size === 0 || B.size === 0) return a.join(' ') === b.join(' ') ? 1 : 0;
	let n = 0;
	for (const x of A) if (B.has(x)) n++;
	return n / Math.min(A.size, B.size);
}
const isPrefix = (a, b) => a.length >= 2 && a.length < b.length && a.every((w, i) => b[i] === w);

export function dedupeSelection(units, sel) {
	const byId = new Map(units.map((u) => [u.id, u]));
	const kept = sel.keep.map((id) => byId.get(id)).filter(Boolean).sort((x, y) => x.start - y.start);
	const drop = new Map();
	for (let i = 0; i < kept.length; i++) {
		const a = kept[i];
		const ta = core(a.text);
		if (!ta.length) {
			drop.set(a.id, 'jen vatová slova');
			continue;
		}
		for (let j = i + 1; j < kept.length; j++) {
			const b = kept[j];
			if (b.start - a.end > 150) break;
			if (drop.has(b.id)) continue;
			const tb = core(b.text);
			// dřívější pokus téže věty (nebo jen její začátek) -> pryč, nechá se ta pozdější
			if (isPrefix(ta, tb) || (ta.length >= 3 && similar(ta, tb) >= 0.6)) {
				drop.set(a.id, 'opakovaná věta (nechal jsem pozdější verzi)');
				break;
			}
		}
	}
	if (!drop.size) return {sel, dropped: []};
	const out = {...sel, keep: sel.keep.filter((id) => !drop.has(id)), reasons: {...(sel.reasons ?? {}), ...Object.fromEntries(drop)}};
	return {sel: out, dropped: [...drop.keys()]};
}

// Věta rozdělená pauzou na dva úseky: když je vybraná jen druhá půlka (začíná malým písmenem, předchozí úsek
// navazuje a nekončí tečkou), přidá se i začátek – jinak by věta začínala „z ničeho nic“ uprostřed.
export function attachHeads(units, sel) {
	const keep = new Set(sel.keep);
	const sorted = [...units].sort((a, b) => a.start - b.start);
	const added = [];
	for (let round = 0; round < 1; round++) {
		for (let i = 1; i < sorted.length; i++) {
			const u = sorted[i];
			const prev = sorted[i - 1];
			if (!keep.has(u.id) || keep.has(prev.id)) continue;
			const first = u.text.trim()[0] ?? '';
			const midSentence = first && first === first.toLowerCase() && first !== first.toUpperCase();
			if (!midSentence || u.start - prev.end > 2.2 || /[.?!…]\s*$/.test(prev.text) || prev.filler) continue;
			// začátek nesmí být jen dřívější pokus téže věty (ten už je obsažený jinde)
			const pc = core(prev.text);
			// (pokus = začátek + tahle půlka dohromady je skoro stejná věta jako jiný ponechaný úsek; jen stejný začátek „Další mega…“ nestačí)
			const joined = core(prev.text + ' ' + u.text);
			const keptTexts = [...keep].map((id) => core(units.find((x) => x.id === id)?.text ?? ''));
			if (!pc.length || keptTexts.some((t, k) => [...keep][k] !== u.id && similar(joined, t) >= 0.6) || keptTexts.some((t) => pc.length >= 3 && similar(pc, t) >= 0.45)) continue;
			keep.add(prev.id);
			added.push(prev.id);
		}
	}
	if (!added.length) return {sel, added};
	const reasons = {...(sel.reasons ?? {})};
	for (const id of added) delete reasons[id];
	return {sel: {...sel, keep: sorted.filter((u) => keep.has(u.id)).map((u) => u.id), reasons}, added};
}

const SYSTEM_REVIEW = `Jsi přísný korektor střihu talking-head videa. Dostaneš HOTOVÝ text videa rozdělený na očíslované úseky přesně v pořadí, jak jdou ve videu za sebou.
Najdi úseky, které ve finálním videu NEMAJÍ být:
- stejná myšlenka/věta je tam dvakrát (nech tu lepší, obvykle pozdější a celou),
- nedokončená věta nebo useknutý začátek, na který nic nenavazuje („A teď další…“, „Takže to je…“),
- přeřeknutí, poznámky mimo obsah („počkej, ještě jednou“, „to vystřihnu“),
- úsek, po kterém text nedává smysl.
Zároveň hlídej opak: věta, která začíná UPROSTŘED („…zlepšit svůj spánek je…“ bez „Nejlepší způsob, jak“). U každého úseku máš v [před: …] text,
který ve zdroji stojí těsně před ním a ve videu NENÍ. Když ten text je chybějící začátek věty (a ne zkažený pokus téže věty), vrať jeho id v "add".
NEVYHAZUJ úseky jen proto, že jsou hovorové nebo krátké, když dávají smysl. Nikdy nevyhoď hook (začátek) ani závěr, pokud nejsou zdvojené.
Když je vše v pořádku, vrať prázdný seznam. Ke každému vyhozenému napiš krátký důvod (2–5 slov, česky).`;
const SCHEMA = {type: 'object', properties: {drop: {type: 'array', items: {type: 'object', properties: {id: {type: 'string'}, reason: {type: 'string'}}, required: ['id', 'reason']}}, add: {type: 'array', items: {type: 'string'}}, ok: {type: 'string'}}, required: ['drop', 'add', 'ok']};

// units v pořadí ve videu (jen ponechané)
export async function reviewCut(orderedUnits, config, {brief = '', script = '', allUnits = []} = {}) {
	if (orderedUnits.length < 3) return {drop: [], add: [], ok: 'krátké video'};
	const kept = new Set(orderedUnits.map((u) => u.id));
	const sorted = [...allUnits].sort((a, b) => a.start - b.start);
	const before = (id) => {
		const i = sorted.findIndex((x) => x.id === id);
		const p = i > 0 ? sorted[i - 1] : null;
		return p && !kept.has(p.id) && !p.filler ? ` [před: ${p.id}: ${p.text}]` : '';
	};
	const list = orderedUnits.map((u) => `${u.id}: ${u.text}${before(u.id)}`).join('\n');
	const ctx = (brief ? `Zadání: ${brief}\n` : '') + (script ? `Scénář: ${script.slice(0, 3000)}\n` : '');
	const r = await askClaude(config, `${ctx}Hotový text videa (úseky v pořadí):\n${list}`, SYSTEM_REVIEW, {schema: SCHEMA, timeoutMs: 240000});
	const ids = new Set(orderedUnits.map((u) => u.id));
	const all = new Set(sorted.map((u) => u.id));
	const drop = (r.drop ?? []).filter((d) => ids.has(d.id));
	const add = (r.add ?? []).filter((id) => all.has(id) && !ids.has(id)).slice(0, 8);
	// pojistka: nikdy nevyhodit víc než třetinu videa
	return {drop: drop.length > orderedUnits.length / 3 ? [] : drop, add, ok: r.ok};
}
