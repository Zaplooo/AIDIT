// AI pomocník: v průvodci (assist), v editoru (command), vyplnění šablony obsahem videa (fillGfx) a návrhy hooku.
// Zásada: co autor napíše, to platí – AI nejen odpoví, ale rovnou změní nastavení / střih, aby to do sebe zapadalo.
import {askClaude} from './ai.mjs';
import {cleanGfx, GFX} from './planner.mjs';
import {CATALOG, describeSetup, withDefaults} from './setup.mjs';
import {prefsText} from './prefs.mjs';

const ids = (list, k = 'id') => list.map((x) => x[k]);
const catalogText = (music) => `MOŽNOSTI (id – popis):
Barvy: ${CATALOG.colors.map((c) => `${c.hex} ${c.name}`).join(', ')}
Pozadí grafiky (bg): ${CATALOG.bgs.map((b) => `${b.id} – ${b.desc}`).join('; ')}
Fonty grafiky (font): ${CATALOG.fonts.map((f) => `${f.family} – ${f.desc}`).join('; ')}
Titulky (caption): ${CATALOG.captions.map((c) => `${c.id} – ${c.label}: ${c.desc}`).join('; ')}
Motion grafika (gfx = seznam typů): ${CATALOG.gfx.map((g) => `${g.type} – ${g.label}: ${g.desc}`).join('; ')}
Zoomy (zoom): ${CATALOG.zooms.map((z) => `${z.id} – ${z.label}: ${z.desc}`).join('; ')}
Hook (hook.visual): ${CATALOG.hooks.map((h) => `${h.id} – ${h.label}: ${h.desc}`).join('; ')}
Nálady hudby (music.mood): ${ids(CATALOG.moods).join(', ')}
Hudební knihovna (music.mode "track", music.file): ${music.map((m) => `${m.file} „${m.name}“ (${m.cat})`).join('; ')}`;

const FONT_LIST = CATALOG.fonts.map((f) => f.family);
export const CAPTION_PROPS = {
	enabled: {type: 'boolean'},
	font: {type: 'string', enum: FONT_LIST},
	mode: {type: 'string', enum: ['goat', 'bold', 'word', 'mix', 'custom']},
	size: {type: 'number'},
	color: {type: 'string'},
	highlight: {type: 'string'},
	textCase: {type: 'string', enum: ['lower', 'upper', 'normal']},
	maxWords: {type: 'integer'},
	y: {type: 'number'},
	animation: {type: 'string', enum: ['typewriter', 'karaoke', 'bounce', 'rise', 'zoom', 'pop', 'fade-up', 'slide', 'blur', 'none']},
	emoji: {type: 'boolean'},
	shadow: {type: 'boolean'},
	italic: {type: 'boolean'},
	stroke: {type: 'number'},
	strokeColor: {type: 'string'},
	box: {type: 'string'},
	alt: {type: 'object', properties: {every: {type: 'string', enum: ['none', 'alternate', 'keyword', 'third']}, font: {type: 'string', enum: FONT_LIST}, italic: {type: 'boolean'}, color: {type: 'string'}, scale: {type: 'number'}}},
	active: {type: 'object', properties: {font: {type: 'string', enum: FONT_LIST}, italic: {type: 'boolean'}, color: {type: 'string'}, scale: {type: 'number'}, box: {type: 'string'}, glow: {type: 'boolean'}}},
};
const CAPTION_HELP = `TITULKY umíš nastavit do detailu (mode "custom" umí všechno najednou): font, size (px při šířce 1080, běžně 44–100), textCase, maxWords (slov na řádek), y (výška 0–1), color, stroke (obrys px) + strokeColor, box (podklad pod řádkem, hex s průhledností např. #000000b8),
alt = druhý font: every "alternate" (každé 2. slovo) / "third" / "keyword" (klíčová slova) + font, italic, color, scale; active = právě vyslovené slovo: font, italic, color, scale (1–1.5), box (barva boxu pod slovem), glow.
Fonty: ${CATALOG.fonts.map((f) => f.family).join(', ')}. Když autor popisuje titulky slovy („jedno slovo jiným fontem“, „aktivní slovo žluté v boxu“), přelož to na tyhle volby a nastav mode "custom".`;

const SETUP_SCHEMA = {
	type: 'object',
	properties: {
		color: {type: 'string'},
		bg: {type: 'string', enum: ids(CATALOG.bgs)},
		font: {type: 'string', enum: ids(CATALOG.fonts, 'family')},
		serif: {type: 'string', enum: ids(CATALOG.fonts, 'family')},
		caption: {type: 'string', enum: ids(CATALOG.captions)},
		captionsOn: {type: 'boolean'},
		gfx: {type: 'array', items: {type: 'string', enum: ids(CATALOG.gfx, 'type')}},
		gfxAmount: {type: 'string', enum: ['low', 'mid', 'high']},
		zoom: {type: 'string', enum: ids(CATALOG.zooms)},
		hook: {type: 'object', properties: {visual: {type: 'string', enum: ids(CATALOG.hooks)}, sfx: {type: 'boolean'}, text: {type: 'string'}}},
		music: {type: 'object', properties: {mode: {type: 'string', enum: ['auto', 'mood', 'track', 'off']}, mood: {type: 'string', enum: ids(CATALOG.moods)}, file: {type: 'string'}, name: {type: 'string'}}},
		sfx: {type: 'string', enum: ['off', 'soft', 'bold']},
		broll: {type: 'string', enum: ['off', 'some', 'lots']},
		tempo: {type: 'string', enum: ['calm', 'normal', 'fast']},
		maxLength: {type: 'integer'},
		layout: {type: 'string', enum: ['full', 'framed']},
		captionCustom: {type: 'object', properties: CAPTION_PROPS},
	},
};
const PREVIEW = {type: 'object', properties: {kind: {type: 'string', enum: ['gfx', 'zoom', 'hook', 'caption', 'color', 'music', 'font', 'bg']}, id: {type: 'string'}}, required: ['kind', 'id']};

const SYSTEM_ASSIST = `Jsi AI střihač v aplikaci AIDIT. Autor si krok za krokem skládá styl střihu svého videa (barva, titulky, motion grafika, zoomy, hook, hudba, efekty, délka).
Bavíš se s ním a ZÁROVEŇ měníš jeho nastavení – co napíše, je závazné a musí se to propsat do výběru:
- Když chce něco konkrétního (barvu, font, šablony grafiky, zoom, hook, hudbu, délku…), vrať to v "setup" (jen pole, která se mění). Nikdy jen neodpovídej textem bez změny.
- Grafika: "gfx" je CELÝ nový seznam vybraných šablon (když přidává, vrať dosavadní + nové; když ubírá, bez nich).
- Hudba: když chce konkrétní skladbu/interpreta/film, vysvětli, že cizí hudbu kvůli autorským právům stáhnout nemůžeš – ať ji nahraje tlačítkem „Nahrát vlastní skladbu“ (pokud ji má legálně). Mezitím nastav nejpodobnější skladbu z knihovny (music.mode "track" + file + name) nebo náladu.
- „Vyber za mě“ / „nechce se mi vybírat“: vyber sám to, co nejlépe sedí k obsahu videa (přepis), k zadání a k ostatním volbám, nastav to a jednou větou řekni proč.
- Hook je nejdůležitější: když se bavíte o hooku, navrhni silný text (max 7 slov, vzbudí zvědavost, česky) a vhodný vizuál.
- Do "previews" dej položky, které jsi nastavil nebo doporučuješ (aplikace ukáže jejich animovaný náhled).
- "brief" = aktuální souhrn toho, co autor chce (2–4 věty, kumulativně z celé konverzace) – podle něj se pak video stříhá.
- "goto" = krok průvodce, kam autora poslat (chat, color, captions, gfx, zoom, hook, sound, length, summary), nebo prázdné.
Odpovídej česky, krátce (max 3 věty), přátelsky, konkrétně k jeho videu. Ptej se nanejvýš na jednu věc.
Titulky do detailu nastavuješ přes "captionCustom" (přepíše vybraný styl). ${CAPTION_HELP}`;

export async function assist({meta, transcript, messages, setup, step, music}, config) {
	const s = withDefaults(setup, meta.answers?.platform);
	const prompt = `${catalogText(music)}

VIDEO: ${meta.name} · ${meta.answers?.platform === 'youtube' ? 'YouTube 16:9' : 'Reels/TikTok/Shorts 9:16'}
${transcript ? `PŘEPIS (surový): ${transcript.slice(0, 5000)}` : 'Přepis ještě není hotový.'}
${meta.answers?.script ? `SCÉNÁŘ: ${meta.answers.script.slice(0, 2500)}` : ''}
DOSAVADNÍ ZADÁNÍ: ${meta.answers?.brief || '(zatím nic)'}
${prefsText() ? `CO AUTOR (NE)MÁ RÁD (z dřívějších videí):\n${prefsText()}` : ''}
AKTUÁLNÍ NASTAVENÍ:
${describeSetup(s)}
AUTOR JE V KROKU: ${step || 'chat'}

KONVERZACE:
${messages.slice(-16).map((m) => `${m.role === 'user' ? 'AUTOR' : 'TY'}: ${m.text}`).join('\n')}`;
	const schema = {type: 'object', properties: {reply: {type: 'string'}, brief: {type: 'string'}, setup: SETUP_SCHEMA, previews: {type: 'array', items: PREVIEW}, goto: {type: 'string'}}, required: ['reply', 'brief', 'setup', 'previews']};
	const r = await askClaude(config, prompt, SYSTEM_ASSIST, {schema, timeoutMs: 180000});
	const patch = {...(r.setup ?? {})};
	if (patch.color && !/^#[0-9a-f]{6}$/i.test(patch.color)) delete patch.color;
	if (patch.music?.mode === 'track' && !music.some((m) => m.file === patch.music.file)) patch.music = {mode: 'mood', mood: patch.music.mood ?? 'energetic'};
	if (patch.maxLength === 0) patch.maxLength = null;
	return {reply: r.reply, brief: r.brief ?? '', setup: patch, previews: (r.previews ?? []).slice(0, 6), goto: r.goto || null};
}

// ------------------------------------------------------------ editor: příkazy nad hotovým střihem
const SYSTEM_COMMAND = `Jsi AI střihač v editoru aplikace AIDIT. Video je sestříhané a autor ti píše, co změnit.
Přelož pokyn na konkrétní změny v "ops" (vyplň jen to, co se mění) a krátce česky odpověz, co jsi udělal (max 2 věty).
- Grafiku přidávej na slovo (wi), kde se o věci mluví; texty grafiky krátké, česky, podle toho, co se tam říká.
- Úprava existujícího beatu = updateBeats s jeho id (u změny grafiky pošli celou novou grafiku).
- „Už je to sestříhané / nestříhej / nech střih“: lockCut true (a když chce vrátit všechno, co bylo vystřižené: cutMode "none").
- „Natočil jsem to po kouscích, jen zkrať pauzy“: cutMode "pauses". „Vyber povedené pokusy“: cutMode "full".
- Pořadí nahraných klipů: order = indexy klipů od 0 v novém pořadí (jen když video má víc klipů).
- Když chce celkově jinou grafiku/B-roll podle nového zadání, nastav replan true.
- seek = čas (s) ve videu, kde je změna vidět (aplikace tam skočí), jinak nevyplňuj.
- Délka: look.maxLength v sekundách (0 = bez limitu).
- Když autor řekne obecný vkus („tohle se mi nelíbí“, „vždycky chci…“, „nesnáším…“), ulož ho do remember (like / dislike, krátce česky) – aplikace si to zapamatuje i pro další videa.
Nikdy neměň víc, než autor chtěl.
${CAPTION_HELP}`;

const OPS_SCHEMA = {
	type: 'object',
	properties: {
		look: {type: 'object', properties: {accent: {type: 'string'}, bg: {type: 'string', enum: ids(CATALOG.bgs)}, font: {type: 'string', enum: ids(CATALOG.fonts, 'family')}, sfx: {type: 'string', enum: ['off', 'soft', 'bold']}, zoomStyle: {type: 'string', enum: ids(CATALOG.zooms)}, layout: {type: 'string', enum: ['full', 'framed', 'split']}, grade: {type: 'string', enum: ['none', 'cinematic', 'dark', 'warm']}, tempo: {type: 'string', enum: ['calm', 'normal', 'fast']}, maxLength: {type: 'integer'}}},
		captions: {type: 'object', properties: CAPTION_PROPS},
		hook: {type: 'object', properties: {visual: {type: 'string', enum: ids(CATALOG.hooks)}, sfx: {type: 'boolean'}, text: {type: 'string'}}},
		music: {type: 'object', properties: {mode: {type: 'string', enum: ['mood', 'off']}, mood: {type: 'string', enum: ids(CATALOG.moods)}, volume: {type: 'number'}}},
		removeBeats: {type: 'array', items: {type: 'string'}},
		updateBeats: {type: 'array', items: {type: 'object', properties: {id: {type: 'string'}, dur: {type: 'number'}, layout: {type: 'string', enum: ['full', 'split', 'pip', 'overlay']}, gfx: GFX, chip: {type: 'string'}}, required: ['id']}},
		addBeats: {type: 'array', items: {type: 'object', properties: {wi: {type: 'integer'}, dur: {type: 'number'}, kind: {type: 'string', enum: ['gfx', 'chip', 'punch']}, layout: {type: 'string', enum: ['full', 'split', 'pip', 'overlay']}, gfx: GFX, chip: {type: 'string'}}, required: ['wi', 'kind']}},
		lockCut: {type: 'boolean'},
		cutMode: {type: 'string', enum: ['full', 'pauses', 'none']},
		order: {type: 'array', items: {type: 'integer'}},
		replan: {type: 'boolean'},
		seek: {type: 'number'},
		remember: {type: 'object', properties: {like: {type: 'string'}, dislike: {type: 'string'}}},
	},
};

export async function command({project: p, words, meta, text, history, time}, config) {
	const byWi = new Map(words.map((w) => [w.wi, w]));
	const beats = (p.plan.beats ?? [])
		.map((b) => ({b, t: byWi.get(b.wi)?.start}))
		.filter((x) => x.t !== undefined)
		.sort((a, c) => a.t - c.t)
		.map(({b, t}) => `${b.id} | ${b.kind}${b.gfx ? `:${b.gfx.type}` : ''} | ${t.toFixed(1)} s | ${b.dur.toFixed(1)} s | ${b.layout ?? ''} | ${JSON.stringify(b.gfx ?? b.chip ?? b.broll?.title ?? '')}`)
		.join('\n');
	const segs = meta.segments?.length > 1 ? `Video je složené z ${meta.segments.length} nahraných klipů: ${meta.segments.map((s, i) => `${i}: ${s.name}`).join(', ')}. Aktuální pořadí: ${(meta.options?.order ?? meta.segments.map((_, i) => i)).join(', ')}.` : '';
	const pr = prefsText();
	const prompt = `${pr ? `CO AUTOR (NE)MÁ RÁD:\n${pr}\n\n` : ''}STAV PROJEKTU
Vzhled: barva ${p.look.accent}, pozadí grafiky ${p.look.theme?.bg}, font ${p.look.theme?.font}, zoom ${p.look.zoomStyle ?? (p.look.zoom ? 'punch' : 'none')}, efekty ${p.look.sfx}, tempo ${p.look.tempo}, délka ${p.look.maxLength ?? 'bez limitu'}, střih zamčený: ${p.look.lockCut ? 'ano' : 'ne'}, režim střihu ${meta.options?.cutMode ?? 'full'}
Hook: ${JSON.stringify(p.look.hook ?? null)}
Titulky: ${JSON.stringify(p.captions)}
Hudba: ${p.look.music?.name ?? 'žádná'}
${segs}
Autor se teď dívá na čas ${Number(time).toFixed(1)} s.

BEATY (id | druh | začátek | délka | rozložení | obsah):
${beats || '(žádné)'}

TEXT VIDEA [wi|čas]slovo:
${words.map((w) => `[${w.wi}|${w.start.toFixed(1)}]${w.text}`).join(' ').slice(0, 14000)}

${history.length ? `PŘEDCHOZÍ POKYNY:\n${history.slice(-6).map((m) => `${m.role === 'user' ? 'AUTOR' : 'TY'}: ${m.text}`).join('\n')}\n` : ''}POKYN AUTORA: ${text}`;
	const schema = {type: 'object', properties: {reply: {type: 'string'}, ops: OPS_SCHEMA}, required: ['reply', 'ops']};
	const r = await askClaude(config, prompt, SYSTEM_COMMAND, {schema, timeoutMs: 240000});
	const ops = r.ops ?? {};
	ops.addBeats = (ops.addBeats ?? []).map((a) => ({...a, gfx: a.kind === 'gfx' ? cleanGfx(a.gfx) : undefined}));
	ops.updateBeats = (ops.updateBeats ?? []).map((u) => ({...u, gfx: u.gfx ? cleanGfx(u.gfx) ?? undefined : undefined}));
	return {reply: r.reply, ops};
}

// ------------------------------------------------------------ šablona z galerie -> obsah z videa
export async function fillGfx({type, near, all, prev = null, idea = ''}, config) {
	const schema = {type: 'object', properties: {gfx: {...GFX, properties: {...GFX.properties, type: {type: 'string', enum: [type]}}}}, required: ['gfx']};
	const sample = CATALOG.gfx.find((g) => g.type === type);
	const prompt = `Šablona: ${type} – ${sample?.label}: ${sample?.desc}. Příklad vyplnění: ${JSON.stringify(sample?.sample)}
V tomhle místě videa mluvčí říká: „${near}“${prev ? `
Dosud tu byla jiná grafika s tímhle obsahem (zachovej sdělení, jen ho převeď do nové šablony): ${JSON.stringify(prev)}` : ''}
(Celé video pro kontext: ${all})
${type === 'custom' ? `Navrhni VLASTNÍ grafiku na míru tomuhle místu (layout hero = jedno velké číslo/ikona + text, stack = 2–5 řádků, row = 2–4 dlaždice, grid = 2×2; parts = [{kind: text|number|icon|check|cross|badge, text, sub, icon}], volitelně title a note). Vymysli i pohyb podle významu (motion: wipe odhalení, flip změna, drop pád, pop překvapení, slide srovnání, zoom důraz, blur klid, rise výčet) a jedno klíčové slovo v title dej do *hvězdiček* se zdůrazněním emph (marker / underline / glow).${idea ? ` Autor chce: ${idea}.` : ''} Musí vypadat čistě a profesionálně, málo textu.\n` : ''}Vyplň šablonu obsahem přesně k tomu, co se v tomhle místě říká. U výčtů piš položky slovy, která mluvčí opravdu řekne (aplikace podle nich načasuje, kdy která naskočí). Česky, krátce (max 6 slov na řádek), čísla přesně podle řeči. Ikony: clock, moon, sun, bed, phone, screen, food, bolt, brain, heart, check, x, star, user, users, chat, play, money, chart, calendar, coffee, fire, target, book, bulb, rocket, eye, lock, music, wind, stress, water, run, pen, code, folder, gift.`;
	const sys = 'Vyplňuješ šablonu motion grafiky textem z videa. Jen JSON podle schématu.';
	let r;
	try {
		r = await askClaude(config, prompt, sys, {schema, timeoutMs: 90000, model: 'haiku'});
	} catch {
		r = await askClaude(config, prompt, sys, {schema, timeoutMs: 120000});
	}
	const g = cleanGfx({...r.gfx, type});
	if (!g) throw new Error('AI šablonu nevyplnila');
	return {gfx: g};
}

export async function suggestHooks({transcript, script, brief}, config) {
	const schema = {type: 'object', properties: {hooks: {type: 'array', items: {type: 'object', properties: {text: {type: 'string'}, why: {type: 'string'}}, required: ['text', 'why']}}}, required: ['hooks']};
	const prompt = `${brief ? `Zadání: ${brief}\n` : ''}${script ? `Scénář: ${script.slice(0, 3000)}\n` : ''}Přepis videa: ${transcript.slice(0, 5000) || '(není)'}
Navrhni 5 různých hooků = text na obrazovku do prvních 2 sekund (max 7 slov, česky). Každý jiným přístupem: zvědavost, provokace, číslo/fakt, oslovení problému diváka, slib výsledku. Musí odpovídat tomu, o čem video opravdu je.`;
	const r = await askClaude(config, prompt, 'Jsi expert na hooky krátkých videí (Reels/TikTok). Česky, úderně, bez klišé a bez emoji.', {schema, timeoutMs: 120000});
	return {hooks: r.hooks.slice(0, 5)};
}

// emoji k titulkům (jako Submagic): jen u klíčových slov, kde emoji opravdu sedí, nanejvýš jedno za ~4 s
export async function pickEmojis(words, config) {
	const text = words.map((w) => `[${w.wi}|${w.start.toFixed(1)}]${w.text}`).join(' ').slice(0, 12000);
	const schema = {type: 'object', properties: {items: {type: 'array', items: {type: 'object', properties: {wi: {type: 'integer'}, emoji: {type: 'string'}}, required: ['wi', 'emoji']}}}, required: ['items']};
	const sys = 'Vybíráš emoji do titulků krátkých videí (styl Submagic). Jen u klíčových slov (věci, emoce, čísla, akce), kde emoji jasně sedí; nanejvýš jedno emoji za ~4 sekundy, žádné u spojek a zájmen. Vždy jen jeden znak emoji.';
	let r;
	try {
		r = await askClaude(config, `Text videa [index|čas]slovo:\n${text}`, sys, {schema, timeoutMs: 90000, model: 'haiku'});
	} catch {
		r = await askClaude(config, `Text videa [index|čas]slovo:\n${text}`, sys, {schema, timeoutMs: 150000});
	}
	const valid = new Set(words.map((w) => w.wi));
	const out = {};
	let last = -10;
	for (const it of (r.items ?? []).sort((a, b) => a.wi - b.wi)) {
		const w = words.find((x) => x.wi === it.wi);
		if (!valid.has(it.wi) || !w || w.start - last < 3) continue;
		const e = [...String(it.emoji).trim()].slice(0, 2).join('');
		if (!e) continue;
		out[it.wi] = e;
		last = w.start;
	}
	return out;
}
