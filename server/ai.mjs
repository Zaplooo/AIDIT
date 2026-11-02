// AI mozek přes Claude Code (tvoje předplatné, bez API klíče). Volá se bez nástrojů a pluginů, aby to šetřilo limit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

let cached;
export function findClaude(config) {
	if (cached !== undefined) return cached;
	if (config.claude && config.claude !== 'auto') return (cached = fs.existsSync(config.claude) ? config.claude : null);
	// 1) claude v PATH
	const which = spawnSync('where', ['claude'], {encoding: 'utf-8'});
	if (which.status === 0) return (cached = which.stdout.split(/\r?\n/)[0].trim());
	// 2) Claude Code z rozšíření VS Code (nejnovější verze)
	const ext = path.join(os.homedir(), '.vscode', 'extensions');
	if (fs.existsSync(ext)) {
		const dirs = fs.readdirSync(ext).filter((d) => d.startsWith('anthropic.claude-code-')).sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
		for (const d of dirs) {
			const exe = path.join(ext, d, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
			if (fs.existsSync(exe)) return (cached = exe);
		}
	}
	return (cached = null);
}

export function askClaude(config, prompt, system, {timeoutMs = 240000, schema = null, readDir = null, model = null} = {}) {
	const exe = findClaude(config);
	if (!exe) return Promise.reject(new Error('Claude Code nenalezen'));
	return new Promise((resolve, reject) => {
		// readDir: AI smí číst soubory (snímky z videa) jen v téhle složce
		const tools = readDir ? ['--tools', 'Read', '--allowedTools', 'Read', '--add-dir', readDir] : ['--tools', ''];
		const p = spawn(exe, ['-p', '--output-format', 'json', ...tools, '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--system-prompt', system, ...(schema ? ['--json-schema', JSON.stringify(schema)] : []), ...(model ? ['--model', model] : [])], {cwd: readDir ?? os.tmpdir()});
		let out = '';
		let err = '';
		const timer = setTimeout(() => {
			p.kill();
			reject(new Error('Claude neodpověděl včas'));
		}, timeoutMs);
		p.stdout.on('data', (d) => (out += d.toString('utf-8')));
		p.stderr.on('data', (d) => (err += d.toString('utf-8')));
		p.on('close', (code) => {
			clearTimeout(timer);
			try {
				const r = JSON.parse(out);
				if (r.is_error) return reject(new Error(r.result || 'chyba Claude'));
				resolve(schema ? r.structured_output ?? JSON.parse(r.result) : r.result);
			} catch {
				reject(new Error(err.slice(-300) || `Claude skončil s kódem ${code}`));
			}
		});
		p.stdin.end(prompt, 'utf-8');
	});
}

const parseJson = (s) => {
	const m = s.match(/[[{][\s\S]*[\]}]/);
	return JSON.parse(m ? m[0] : s);
};

const SYSTEM_FIX = `Kontroluješ automatický přepis české mluvené řeči (Whisper) pro titulky.
Dostaneš očíslovaná slova. Oprav jen slova, která Whisper rozpoznal špatně: chybná diakritika, zkomolená slova, špatně napsaná jména a značky, čísla.
NEMĚŇ styl mluvy, hovorové tvary ani gramatiku (když řekne „hodinky“ nebo „tě“, nech to), pořadí slov, nic nepřidávej ani neubírej (vatová slova a opakování nech, vystřihnou se jinde).
Jedno slovo = jedno slovo (zachovej interpunkci, pokud tam byla).
Opravuj jen to, co je zjevně špatně rozpoznané; když si nejsi jistý, slovo nech.
Vrať jen opravy (fixes); když je vše správně, vrať prázdný seznam. Neuváděj slova, která se nemění.`;
const FIX_SCHEMA = {type: 'object', properties: {fixes: {type: 'array', items: {type: 'object', properties: {i: {type: 'integer'}, text: {type: 'string'}}, required: ['i', 'text']}}}, required: ['fixes']};

// Kontrola přepisu po dávkách ~500 slov. Časování slov zůstává, mění se jen text.
export async function fixTranscript(words, config, onProgress = () => {}, script = '') {
	const fixed = words.map((w) => ({...w}));
	const changes = [];
	const BATCH = 500;
	// scénář (když ho autor vložil): jména, značky a čísla se opraví podle něj
	const scr = script ? `Scénář, podle kterého autor mluvil (jména, značky a čísla piš podle něj, mluvené tvary nech):\n${script.slice(0, 5000)}\n\n` : '';
	for (let a = 0; a < words.length; a += BATCH) {
		const chunk = words.slice(a, a + BATCH).map((w, k) => `${a + k}:${w.text}`).join(' ');
		const ctx = a > 0 ? `(Předchozí kontext: ${words.slice(Math.max(0, a - 30), a).map((w) => w.text).join(' ')})\n` : '';
		const res = await askClaude(config, `${scr}${ctx}Slova:\n${chunk}`, SYSTEM_FIX, {schema: FIX_SCHEMA});
		for (const c of res.fixes ?? []) {
			const i = Number(c.i);
			if (Number.isInteger(i) && fixed[i] && typeof c.text === 'string' && c.text.trim() && !/\s/.test(c.text.trim()) && c.text.trim() !== fixed[i].text) {
				changes.push({i, from: fixed[i].text, to: c.text.trim()});
				fixed[i].text = c.text.trim();
			}
		}
		onProgress(Math.min((a + BATCH) / words.length, 1));
	}
	return {words: fixed, changes};
}

const SYSTEM_TAKES = `Jsi střihač talking-head videí. Dostaneš surový záznam rozdělený na očíslované úseky (věty a pokusy) s časem.
Mluvčí opakuje věty, dokud se mu nepovedou, a občas zkouší různé formulace téže myšlenky.
Vyber úseky do finálního videa:
- z každé myšlenky nech POSLEDNÍ povedenou verzi (celou, plynulou, bez přeřeknutí); dřívější pokusy zahoď,
- když je poslední verze nedokončená nebo zjevně horší, vezmi poslední celou verzi před ní,
- zahoď nedokončené začátky („Další super věci…“), zdvojené věty, vatová slova a poznámky mimo obsah,
- NIKDY nenech dvě verze stejné věty ani stejné myšlenky (ani s jinými slovy) – divák nesmí slyšet nic dvakrát,
- nenech úsek, který končí uprostřed věty, když po něm nenavazuje její dokončení,
- výsledek musí dávat smysl jako souvislý text od začátku do konce; neměň pořadí,
- konec videa = poslední celá věta, kterou mluvčí uzavírá téma.
Ke každému zahozenému úseku napiš krátký důvod česky (2–4 slova, např. „dřívější pokus“, „nedokončené“).`;
const TAKES_SCHEMA = {
	type: 'object',
	properties: {
		keep: {type: 'array', items: {type: 'string'}},
		dropped: {type: 'array', items: {type: 'object', properties: {id: {type: 'string'}, reason: {type: 'string'}}, required: ['id', 'reason']}},
		summary: {type: 'string'},
	},
	required: ['keep', 'dropped', 'summary'],
};

// AI vybere poslední povedené verze vět (a když je zadaná max. délka, vynechá méně důležité myšlenky)
export async function selectTakes(units, config, {maxLength = null, first = null, script = '', brief = ''} = {}) {
	const list = units.map((u) => `${u.id} [${u.start.toFixed(1)}–${u.end.toFixed(1)} s, ${(u.end - u.start).toFixed(1)} s] ${u.text}`).join('\n');
	let extra = maxLength ? `\nCílová délka hotového videa je nejvýš ${maxLength} s (počítej součet délek vybraných úseků). Když se nevejde, vynech nejméně důležité myšlenky, ale nech hook a závěr.` : '';
	if (script) extra += `\nScénář videa (vyber pokusy, které ho nejlépe odříkají):\n${script.slice(0, 5000)}`;
	if (brief) extra += `\nZadání od autora: ${brief}`;
	const res = await askClaude(config, `Úseky:\n${list}${extra}`, SYSTEM_TAKES, {schema: TAKES_SCHEMA, timeoutMs: 300000});
	const ids = new Set(units.map((u) => u.id));
	const keep = res.keep.filter((id) => ids.has(id));
	if (!keep.length) throw new Error('AI nevybrala žádný úsek');
	return {keep, first, reasons: Object.fromEntries(res.dropped.filter((d) => ids.has(d.id)).map((d) => [d.id, d.reason])), summary: res.summary};
}

const SYSTEM_PLAN = `Jsi zkušený střihač krátkých videí (Reels/TikTok/Shorts) ve stylu nejlepších creatorů.
Dostaneš finální text videa po slovech s indexy [i] a časem v sekundách, styl střihu a délku.
Promysli video jako střihač a vrať plán:
- summary: o čem video je (1 věta česky),
- title: krátký úderný nadpis videa (3–7 slov, česky, bez uvozovek), hodí se do horního panelu nebo jako hook,
- hook: zhodnoť první 3 s (jedna věta: funguje / co by bylo silnější),
- thinking: 3–6 krátkých bodů česky, co a proč ve střihu děláš (tempo, kde jsou karty, co zvýrazňuješ),
- keywords: indexy slov, která se mají zvýraznit barvou/kurzívou (nosná slova, čísla, emoce; zhruba 1 za 2–3 s; nikdy předložky a spojky),
- cards: textové karty přes obrazovku v rytmu řeči – wi = index slova, kde karta naskočí, dur = 0,7–1,6 s, text = max 4–5 slov (zkrácená pointa, číslo, „Tip 1“ apod.), sub = volitelný malý nadpis (např. „Krok 1“). Karty dávej na klíčové momenty (čísla, výčty, pointa), ne do prvních 2 s,
- questions: 2–3 otázky pro autora, které opravdu změní střih tohohle videa. Typy: "hook" (které z 2–3 nabídnutých vět má video začít; value = id úseku ze seznamu úseků), "title" (2–3 varianty nadpisu; value = text nadpisu), "length" (varianty délky; value = počet sekund jako text nebo "none").
Piš česky, stručně, bez vaty.`;
const PLAN_SCHEMA = {
	type: 'object',
	properties: {
		summary: {type: 'string'},
		title: {type: 'string'},
		hook: {type: 'string'},
		thinking: {type: 'array', items: {type: 'string'}},
		keywords: {type: 'array', items: {type: 'integer'}},
		cards: {type: 'array', items: {type: 'object', properties: {wi: {type: 'integer'}, dur: {type: 'number'}, text: {type: 'string'}, sub: {type: 'string'}}, required: ['wi', 'dur', 'text']}},
		questions: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: {type: 'string', enum: ['hook', 'title', 'length']},
					question: {type: 'string'},
					options: {type: 'array', items: {type: 'object', properties: {label: {type: 'string'}, value: {type: 'string'}, hint: {type: 'string'}}, required: ['label', 'value']}},
				},
				required: ['id', 'question', 'options'],
			},
		},
	},
	required: ['summary', 'title', 'hook', 'thinking', 'keywords', 'cards', 'questions'],
};

// AI „přemýšlí nad videem“: shrnutí, nadpis, klíčová slova, karty, otázky pro autora
export async function planVideo({words, units, style, duration, cardEvery}, config) {
	const text = words.map((w) => `[${w.wi}|${w.start.toFixed(1)}]${w.text}`).join(' ');
	const ulist = units.filter((u) => u.keep).map((u) => `${u.id}: ${u.text}`).join('\n');
	const prompt = `Styl střihu: ${style.name} – ${style.description}
Karty: ${cardEvery ? `zhruba 1 karta za ${cardEvery} s` : 'tento styl karty nepoužívá, vrať prázdný seznam'}.
Délka hotového videa: ${duration.toFixed(1)} s.

Použité úseky (pro otázku „hook“):
${ulist}

Text videa po slovech [index|čas]slovo:
${text}`;
	const r = await askClaude(config, prompt, SYSTEM_PLAN, {schema: PLAN_SCHEMA, timeoutMs: 300000});
	const valid = new Set(words.map((w) => w.wi));
	return {
		summary: r.summary,
		title: r.title,
		hook: r.hook,
		thinking: r.thinking.slice(0, 8),
		keywords: r.keywords.filter((i) => valid.has(i)),
		cards: (cardEvery ? r.cards : []).filter((c) => valid.has(c.wi)).map((c, k) => ({id: `k${k + 1}`, wi: c.wi, dur: Math.min(Math.max(c.dur, 0.6), 2), text: c.text, sub: c.sub || undefined})),
		questions: r.questions.slice(0, 3).filter((q) => q.options?.length >= 2),
	};
}
