// Plán střihu v2: AI projde video větu po větě a naplánuje beaty (grafika / B-roll / štítek / přiblížení), náladu hudby a otázky.
import {askClaude} from './ai.mjs';

const SYSTEM = `Jsi špičkový střihač a motion designer krátkých i dlouhých videí (Reels/TikTok/Shorts/YouTube).
Dostaneš finální text videa po slovech [index|čas], recept stylu (odvozený z videí, která se autorovi líbí) a zadání od autora.
Naplánuj střih jako profesionál: rytmus, kdy je vidět mluvčí, kdy přijde grafika, B-roll, štítek nebo důrazné přiblížení.

PRAVIDLA
- Prvních ~1,5 s patří mluvčímu (hook) – nanejvýš štítek (chip) nebo přiblížení (punch).
- KVALITA PŘED MNOŽSTVÍM: grafiku dej jen tam, kde opravdu pomáhá pochopení (čísla, výčty, srovnání, pointa). Raději 3 výborné grafiky za video než 10 průměrných.
  Každá grafika musí přesně sedět k tomu, co mluvčí v tu chvíli říká, a začít na slově, kde o tom začne mluvit.
- NIKDY nedávej text ani prvky PŘES mluvčího (přes obličej nebo tělo) a nic nevyskakuje z boku přes něj. Grafika je buď přes celou obrazovku ("full"),
  nebo v horní polovině nad mluvčím ("split"). Šablony versus/side/pill/lowerthird/counter/marquee NEPOUŽÍVEJ, pokud je autor výslovně nevybral.
- Výčty (list, cards, chips, timeline, kinetic): položky piš přesně slovy, která mluvčí řekne, a grafiku začni na prvním z nich – aplikace pak každou položku ukáže ve chvíli, kdy ji vysloví. Grafika trvá, dokud mluvčí nedořekne poslední bod.
- Když se žádná šablona nehodí, VYMYSLI vlastní grafiku "custom" (buď kreativní, každá může vypadat jinak): layout "hero" (jedno velké číslo/ikona + text), "stack" (2–5 řádků s ikonou/fajfkou/číslem), "row" (2–4 dlaždice vedle sebe), "grid" (2×2); parts = [{kind: text|number|icon|check|cross|badge, text, sub, icon}].
  Navrhni i POHYB podle významu (motion): wipe = odhalení / tajemství, flip = změna / před a po, drop = pád / problém, pop = překvapení / výsledek, slide = srovnání / dvě strany, zoom = důraz, blur = klidná myšlenka, rise = výčet. Jen u \"custom\" můžeš v title jedno klíčové slovo dát do *hvězdiček* a zvolit emph (marker = fix zvýrazňovač, underline, glow).
- Grafika (kind "gfx") ilustruje, co se právě říká. Šablony (vyber tu, která k větě sedí nejlépe, a STŘÍDEJ je):
  • "reveal" – Apple styl: věta se odhalí slovo po slovu s rozostřením, klíčové slovo svítí (pointa, hook, silná věta),
  • "headline" – nadpis s fixem na klíčovém slově (+ malý nadpis "sub"),
  • "stat" – číslo v kruhu (60–90 min, 2–3 h, 80 %); "particles" – velké číslo z tisíců svítících teček + krátký text (dramatická čísla, peníze),
  • "list" – seznam s odškrtáváním (výčet 3–5 věcí); "cards" – 2–4 karty s ikonou a nadpisem (možnosti, nástroje, kroky; items = {icon,title,sub}),
  • "chips" – řada 3–5 tlačítek s ikonami, postupně se rozsvítí (kategorie, krátké výčty; icons = klíče ikon),
  • "step" – velké číslo kroku + název; "chapter" – kapitola: číslo + VELKÝ titulek (nový oddíl videa, typicky YouTube),
  • "compare" – dva sloupce ✗ / ✓ (špatně vs. správně); "versus" – srovnání PŘES záběr mluvčího (ikona + text vlevo a vpravo, např. „Mobil do noci“ vs „Kniha 30 min“),
  • "quote" – citát/pointa v kurzívě; "slam" – 1–3 obří slova přes celou obrazovku (jen dynamické styly),
  • "chat" – zprávy (konverzace, komentář, otázka diváka); "prompt" – AI okno, ve kterém se píše věta (AI, nástroje, otázka),
  • "gauge" – budík/riziko s ručičkou (level 0–1, value = slovo nebo číslo); "crowd" – „ty“ vs. dav ostatních (odlišit se od ostatních),
  • "timer" – odpočet; "note" – ručně psaný text na papíře (osobní, upřímná chvíle; 2–3 krátké řádky),
  • "side" – 2–3 karty s ikonou VEDLE mluvčího (výčet, mluvčí zůstává vidět); "pill" – skleněný štítek s krátkou větou přes záběr (řečnická otázka),
  • "bars" – sloupcový graf (srovnání 2–5 čísel; bars = [{label, value}]); "timeline" – časová osa (postup v čase, rutina; items),
  • "bigicon" – obří ikona + krátký text (jedna věc, symbol); "question" – velký otazník + otázka (řečnická otázka, háček),
  • "progress" – procenta s pruhem (level 0–1, label); "kinetic" – 3–5 slov pod sebou střídavě tučně/kurzívou (silná věta, motto; words),
  • "lowerthird" – jmenovka dole přes záběr (jméno, téma, zdroj); "counter" – číslo se načte nad mluvčím (mluvčí zůstává vidět); "marquee" – šikmý pás s běžícím textem (téma, výkřik).
  Ikony (icon/icons/leftIcon/rightIcon): clock, moon, sun, bed, phone, screen, food, bolt, brain, heart, check, x, star, user, users, chat, play, money, chart, calendar, coffee, fire, target, book, bulb, rocket, eye, lock, music, wind, stress, water, run, pen, code, folder, gift.
  Texty grafiky česky, krátké (max 6 slov na řádek), čísla přesně podle řeči. "highlight" = 1–2 slova z textu.
  Nikdy nepoužij stejnou šablonu dvakrát po sobě; za video použij aspoň 5 různých šablon.
- layout: "full" (grafika přes celou obrazovku, hlas běží dál), "split" (nahoře grafika, dole mluvčí – jen u Reels a jen na tu chvíli),
  "pip" (grafika přes celou plochu a mluvčí v kolečku v rohu – YouTube 16:9), "overlay" (jen pro versus, side, pill – přes záběr mluvčího).
- B-roll (kind "broll"): když mluvčí zmíní konkrétní situaci/věc/pocit („jdu spát“, „telefon v posteli“, „mám se krásně“, „jídlo“).
  broll.query = krátké anglické hledání pro stock web (2–4 slova popisující, co je VIDĚT, např. "woman sleeping bed", ne abstraktní pojmy), broll.alt = jiné hledání stejné situace (jiná slova / jiný úhel pohledu).
- Štítek (kind "chip"): krátký fakt přes záběr mluvčího (2–5 slov), např. „60–90 min před spaním“.
- Přiblížení (kind "punch"): důrazná věta/pointa, mluvčí zůstává vidět (1–3 s). Jen když to recept dovoluje.
- Když mluvčí ukazuje předmět („tato maska“, „těchto brýlí“), NEZAKRÝVEJ ho grafikou ani B-rollem – dej chip nebo nic.
- Délky: gfx 2,4–4,5 s (musí se v klidu přečíst a nesmí to působit uspěchaně), broll 1,8–3,2 s, chip 2–3,5 s, punch 1–3 s. Mezi dvěma grafikami/B-rolly nech aspoň ~2 s mluvčího, ať střih dýchá. Beaty se nepřekrývají (chip může být přes punch).
- Hustotu a typy ber z receptu. Nepřeplácej: video musí dýchat, mluvčí je hlavní.
- wi = index slova, kde beat začíná (slovo, které věc pojmenovává).
- mood: nálada hudby (energetic, motivating, hiphop, lofi, chill, cinematic, dark, happy, corporate, emotional).
Piš česky, stručně a konkrétně.`;

export const GFX = {
	type: 'object',
	properties: {
		type: {type: 'string', enum: ['headline', 'reveal', 'stat', 'particles', 'list', 'quote', 'chat', 'compare', 'slam', 'timer', 'step', 'chapter', 'chips', 'cards', 'gauge', 'crowd', 'prompt', 'note', 'versus', 'side', 'pill', 'bars', 'timeline', 'bigicon', 'lowerthird', 'counter', 'question', 'marquee', 'progress', 'kinetic', 'custom']},
		icon: {type: 'string'},
		layout: {type: 'string', enum: ['stack', 'row', 'grid', 'hero']},
		motion: {type: 'string', enum: ['rise', 'pop', 'slide', 'flip', 'blur', 'drop', 'zoom', 'wipe']},
		emph: {type: 'string', enum: ['marker', 'underline', 'glow']},
		note: {type: 'string'},
		parts: {type: 'array', items: {type: 'object', properties: {kind: {type: 'string', enum: ['text', 'number', 'icon', 'check', 'cross', 'badge']}, text: {type: 'string'}, sub: {type: 'string'}, icon: {type: 'string'}}, required: ['kind']}},
		bars: {type: 'array', items: {type: 'object', properties: {label: {type: 'string'}, value: {type: 'number'}}, required: ['label', 'value']}},
		text: {type: 'string'},
		highlight: {type: 'string'},
		sub: {type: 'string'},
		value: {type: 'string'},
		label: {type: 'string'},
		title: {type: 'string'},
		items: {type: 'array', items: {type: 'string'}},
		messages: {type: 'array', items: {type: 'object', properties: {from: {type: 'string', enum: ['me', 'them']}, text: {type: 'string'}}, required: ['from', 'text']}},
		left: {type: 'string'},
		right: {type: 'string'},
		leftItems: {type: 'array', items: {type: 'string'}},
		rightItems: {type: 'array', items: {type: 'string'}},
		words: {type: 'array', items: {type: 'string'}},
		n: {type: 'integer'},
		icons: {type: 'array', items: {type: 'string'}},
		cards: {type: 'array', items: {type: 'object', properties: {icon: {type: 'string'}, title: {type: 'string'}, sub: {type: 'string'}}, required: ['title']}},
		level: {type: 'number'},
		you: {type: 'string'},
		them: {type: 'string'},
		lines: {type: 'array', items: {type: 'string'}},
		leftSub: {type: 'string'},
		rightSub: {type: 'string'},
		leftIcon: {type: 'string'},
		rightIcon: {type: 'string'},
	},
	required: ['type'],
};
const QUESTIONS = {
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
};
const SCHEMA = {
	type: 'object',
	properties: {
		summary: {type: 'string'},
		title: {type: 'string'},
		hook: {type: 'string'},
		thinking: {type: 'array', items: {type: 'string'}},
		mood: {type: 'string', enum: ['energetic', 'motivating', 'hiphop', 'lofi', 'chill', 'cinematic', 'dark', 'happy', 'corporate', 'emotional']},
		keywords: {type: 'array', items: {type: 'integer'}},
		beats: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					wi: {type: 'integer'},
					dur: {type: 'number'},
					kind: {type: 'string', enum: ['gfx', 'broll', 'chip', 'punch']},
					layout: {type: 'string', enum: ['full', 'split', 'pip', 'overlay']},
					gfx: GFX,
					broll: {type: 'object', properties: {query: {type: 'string'}, alt: {type: 'string'}}, required: ['query']},
					chip: {type: 'string'},
					why: {type: 'string'},
				},
				required: ['wi', 'dur', 'kind', 'why'],
			},
		},
		questions: QUESTIONS,
	},
	required: ['summary', 'title', 'hook', 'thinking', 'mood', 'keywords', 'beats', 'questions'],
};

const s = (x) => (typeof x === 'string' ? x.trim() : '');
// *hvězdičky* (zdůraznění slova) umí jen nadpis vlastní grafiky – jinde by se vypsaly doslova
const noStars = (v, keep) => (typeof v === 'string' ? v.replace(/\*/g, '') : Array.isArray(v) ? v.map((x) => noStars(x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === keep ? x : noStars(x)])) : v);
export function cleanGfx(g) {
	const r = cleanGfx0(g);
	return r ? noStars(r, r.type === 'custom' ? 'title' : undefined) : r;
}
function cleanGfx0(g) {
	if (!g) return null;
	switch (g.type) {
		case 'headline':
			return s(g.text) ? {type: 'headline', text: s(g.text), highlight: s(g.highlight) || undefined, sub: s(g.sub) || undefined} : null;
		case 'quote':
			return s(g.text) ? {type: 'quote', text: s(g.text), highlight: s(g.highlight) || undefined, sub: s(g.sub) || undefined} : null;
		case 'stat':
			return s(g.value) ? {type: 'stat', value: s(g.value), label: s(g.label) || s(g.text), sub: s(g.sub) || undefined} : null;
		case 'list':
			return g.items?.length ? {type: 'list', title: s(g.title) || s(g.text), items: g.items.slice(0, 5).map(s)} : null;
		case 'step':
			return {type: 'step', n: g.n ?? 1, title: s(g.title) || s(g.text), sub: s(g.sub) || undefined};
		case 'chat':
			return g.messages?.length ? {type: 'chat', messages: g.messages.slice(0, 5).map((m) => ({from: m.from === 'me' ? 'me' : 'them', text: s(m.text)}))} : null;
		case 'compare':
			return {type: 'compare', left: s(g.left) || 'Špatně', right: s(g.right) || 'Správně', leftItems: (g.leftItems ?? []).map(s), rightItems: (g.rightItems ?? []).map(s)};
		case 'slam':
			return g.words?.length ? {type: 'slam', words: g.words.slice(0, 4).map(s)} : null;
		case 'timer':
			return s(g.value) ? {type: 'timer', value: s(g.value), label: s(g.label) || undefined} : null;
		case 'reveal':
			return s(g.text) ? {type: 'reveal', text: s(g.text), highlight: s(g.highlight) || undefined} : null;
		case 'particles':
			return s(g.value) ? {type: 'particles', value: s(g.value), text: s(g.text) || s(g.label) || undefined} : null;
		case 'chapter':
			return s(g.title) || s(g.text) ? {type: 'chapter', n: g.n ?? 1, title: s(g.title) || s(g.text)} : null;
		case 'chips': {
			const items = (g.items ?? []).map(s).filter(Boolean).slice(0, 6);
			return items.length >= 2 ? {type: 'chips', items, icons: (g.icons ?? []).map(s)} : items.length ? {type: 'reveal', text: items[0]} : null;
		}
		case 'cards':
		case 'side': {
			const items = (g.cards ?? (g.items ?? []).map((t) => ({title: t}))).map((c) => ({icon: s(c.icon) || undefined, title: s(c.title), sub: s(c.sub) || undefined})).filter((c) => c.title).slice(0, 4);
			return items.length ? (g.type === 'cards' ? {type: 'cards', title: s(g.title) || undefined, items} : {type: 'side', items}) : null;
		}
		case 'gauge':
			return {type: 'gauge', value: s(g.value) || s(g.text) || '', label: s(g.label) || s(g.title) || '', level: Math.min(Math.max(Number(g.level) || 0.5, 0), 1)};
		case 'crowd':
			return {type: 'crowd', you: s(g.you) || 'Ty', them: s(g.them) || 'Ostatní'};
		case 'prompt':
			return s(g.text) ? {type: 'prompt', text: s(g.text)} : null;
		case 'note': {
			const lines = (g.lines ?? s(g.text).split(/\n|\s{2,}/)).map(s).filter(Boolean).slice(0, 4);
			return lines.length ? {type: 'note', lines} : null;
		}
		case 'versus':
			return s(g.left) && s(g.right) ? {type: 'versus', left: s(g.left), leftSub: s(g.leftSub) || undefined, leftIcon: s(g.leftIcon) || undefined, right: s(g.right), rightSub: s(g.rightSub) || undefined, rightIcon: s(g.rightIcon) || undefined} : null;
		case 'pill':
			return s(g.text) ? {type: 'pill', text: s(g.text)} : null;
		case 'bars': {
			const items = (g.bars ?? (Array.isArray(g.items) && typeof g.items[0] === 'object' ? g.items : [])).map((b) => ({label: s(b.label), value: Number(b.value) || 0})).filter((b) => b.label).slice(0, 5);
			return items.length >= 2 ? {type: 'bars', title: s(g.title) || undefined, items} : null;
		}
		case 'timeline': {
			const items = (g.items ?? []).map(s).filter(Boolean).slice(0, 5);
			return items.length >= 2 ? {type: 'timeline', title: s(g.title) || undefined, items} : null;
		}
		case 'bigicon':
			return s(g.text) ? {type: 'bigicon', icon: s(g.icon) || 'star', text: s(g.text), sub: s(g.sub) || undefined} : null;
		case 'question':
			return s(g.text) ? {type: 'question', text: s(g.text)} : null;
		case 'progress':
			return {type: 'progress', label: s(g.label) || s(g.title) || s(g.text), level: Math.min(Math.max(Number(g.level) || 0.5, 0), 1), text: s(g.sub) || undefined};
		case 'kinetic': {
			const words = (g.words ?? s(g.text).split(/\s+/)).map(s).filter(Boolean).slice(0, 5);
			return words.length ? {type: 'kinetic', words} : null;
		}
		case 'lowerthird':
			return s(g.title) || s(g.text) ? {type: 'lowerthird', title: s(g.title) || s(g.text), sub: s(g.sub) || undefined} : null;
		case 'counter':
			return s(g.value) ? {type: 'counter', value: s(g.value), label: s(g.label) || undefined} : null;
		case 'marquee':
			return s(g.text) ? {type: 'marquee', text: s(g.text)} : null;
		case 'custom': {
			const items = (g.parts ?? []).map((x) => ({kind: x.kind ?? 'text', text: s(x.text) || undefined, sub: s(x.sub) || undefined, icon: s(x.icon) || undefined})).filter((x) => x.text || x.icon).slice(0, 6);
			const motion = ['rise', 'pop', 'slide', 'flip', 'blur', 'drop', 'zoom', 'wipe'].includes(g.motion) ? g.motion : undefined;
			const emph = ['marker', 'underline', 'glow'].includes(g.emph) ? g.emph : undefined;
			return items.length ? {type: 'custom', title: s(g.title) || undefined, layout: ['stack', 'row', 'grid', 'hero'].includes(g.layout) ? g.layout : 'stack', items, note: s(g.note) || undefined, motion, emph} : null;
		}
		default:
			return null;
	}
}

// pravidla z nastavení, které si autor vybral v průvodci (mají přednost před receptem stylu)
function setupRules(setup) {
	if (!setup) return {text: '', allowed: null};
	const per = {none: 0, low: 3, mid: 5, high: 8}[setup.gfxAmount ?? 'mid'];
	const allowed = setup.gfx?.length ? setup.gfx : null;
	const zoomOk = ['punch', 'pulse', 'ken'].includes(setup.zoom);
	const hook = setup.hook ?? {visual: 'none'};
	const lines = [
		setup.gfxAmount === 'none' ? '- ŽÁDNOU motion grafiku (kind "gfx") ani štítky – autor chce čistý střih jen s titulky.' : allowed ? `- Motion grafika: autor vybral TYTO šablony a smíš použít JEN je: ${allowed.join(', ')}. Střídej je a použij každou, kde se hodí.` : '- Motion grafiku vyber sám ze všech šablon.',
		`- Hustota: NANEJVÝŠ ${per} beatů za minutu (grafika + B-roll + štítky + přiblížení dohromady). Je to strop, ne cíl: když se k místu nic doopravdy nehodí, nedávej nic. Každá grafika musí divákovi něco přidat (číslo, výčet, kroky, srovnání, pointa) – grafika jen pro efekt je chyba.`,
		setup.broll === 'off' ? '- B-roll NEPOUŽÍVEJ.' : setup.broll === 'lots' ? '- B-rollu dej hodně (každá konkrétní situace/věc).' : '- B-roll jen u nejsilnějších konkrétních situací.',
		zoomOk ? '- Přiblížení (punch) dávej na důrazné věty a pointy.' : '- Přiblížení (kind "punch") NEPOUŽÍVEJ – autor nechce zoomy na důrazech.',
		hook.visual === 'broll'
			? '- HOOK: hned na prvním slově videa dej B-roll (1,2–1,8 s), který doslova ilustruje první větu.'
			: hook.visual !== 'none'
				? `- HOOK: první ~2,2 s má vlastní grafiku hooku (${hook.visual}) – do té doby NEDÁVEJ žádný beat.`
				: '- Prvních ~1,5 s patří mluvčímu.',
		hook.text ? `- Text hooku napsal autor: „${hook.text}“ – do pole hook ho vrať beze změny.` : '- Do pole "hook" napiš úderný text na obrazovku pro první 2 s (max 7 slov, vyvolá zvědavost, česky).',
	];
	return {text: lines.join('\n'), allowed};
}

// šablony přes záběr -> varianta přes celou obrazovku / nad mluvčím (nic nesmí být přes člověka)
function toFullscreen(g) {
	if (g.type === 'versus') return {type: 'compare', left: g.left, right: g.right, leftItems: g.leftSub ? [g.leftSub] : [], rightItems: g.rightSub ? [g.rightSub] : []};
	if (g.type === 'side') return {type: 'cards', items: g.items};
	if (g.type === 'pill' || g.type === 'marquee') return {type: 'reveal', text: g.text};
	if (g.type === 'counter') return {type: 'stat', value: g.value, label: g.label ?? ''};
	if (g.type === 'lowerthird') return {type: 'headline', text: g.title, sub: g.sub};
	return null;
}

export async function planVideo2({words, units, style, duration, platform, brief = '', setup = null, script = '', prefs = ''}, config) {
	const text = words.map((w) => `${w.cut ? '✂ ' : ''}[${w.wi}|${w.start.toFixed(1)}]${w.text}`).join(' ');
	const ulist = units.filter((u) => u.keep).map((u) => `${u.id}: ${u.text}`).join('\n');
	const recipe = style.recipe ? JSON.stringify(style.recipe) : style.description;
	const rules = setupRules(setup);
	const prompt = `PLATFORMA: ${platform === 'youtube' ? 'YouTube 16:9 (dlouhé video)' : 'Reels / TikTok / Shorts 9:16'}
STYL: ${style.name} – ${style.description}
RECEPT STYLU: ${recipe}
ZADÁNÍ OD AUTORA (nejdůležitější, řiď se jím): ${brief || '(autor nic nepsal – rozhodni sám podle obsahu)'}
${rules.text ? `NASTAVENÍ OD AUTORA (má přednost před receptem):\n${rules.text}\n` : ''}${prefs ? `CO AUTOR (ne)MÁ RÁD – naučeno z jeho dřívějších videí:\n${prefs}\n` : ''}${script ? `SCÉNÁŘ (pro kontext a správné názvy): ${script.slice(0, 3000)}\n` : ''}DÉLKA VIDEA: ${duration.toFixed(1)} s

Použité úseky (pro otázku „hook“):
${ulist}

Značka ✂ = místo střihu (skok v obraze). Profi střihači skoky schovávají: když se B-roll nebo celoobrazovková grafika OBSAHOVĚ hodí k místu kolem ✂, začni ji 1–2 slova před ✂ a nech ji doběhnout za něj. Kvůli schování střihu ale nic nevymýšlej – když se tam nic nehodí, nech čistý střih.
Text videa po slovech [index|čas]slovo:
${text}`;
	const schema = structuredClone(SCHEMA);
	if (rules.allowed) schema.properties.beats.items.properties.gfx.properties.type.enum = rules.allowed;
	const r = await askClaude(config, prompt, SYSTEM, {schema, timeoutMs: 420000});
	const valid = new Set(words.map((w) => w.wi));
	const beats = [];
	r.beats.forEach((b, k) => {
		if (!valid.has(b.wi)) return;
		const beat = {id: `b${k + 1}`, wi: b.wi, dur: Math.min(Math.max(Number(b.dur) || 1.5, 0.8), 4.5), kind: b.kind, why: b.why};
		if (setup?.broll === 'off' && b.kind === 'broll') return;
		if (setup?.gfxAmount === 'none' && (b.kind === 'gfx' || b.kind === 'chip')) return;
		if (b.kind === 'punch' && setup && !['punch', 'pulse', 'ken'].includes(setup.zoom)) return;
		if (b.kind === 'gfx') {
			const g = cleanGfx(b.gfx);
			if (!g) return;
			if (rules.allowed && !rules.allowed.includes(g.type) && g.type !== 'custom') return;
			// přes mluvčího nic (pokud si to autor sám nevybral) – převést na grafiku nad ním / přes celou obrazovku
			const OVER = ['versus', 'side', 'pill', 'lowerthird', 'counter', 'marquee'];
			if (OVER.includes(g.type) && !(rules.allowed ?? []).includes(g.type)) {
				const conv = toFullscreen(g);
				if (!conv) return;
				Object.keys(g).forEach((k) => delete g[k]);
				Object.assign(g, conv);
			}
			beat.gfx = g;
			if (b.layout === 'overlay') b.layout = platform === 'youtube' ? 'full' : 'split';
			beat.layout = ['versus', 'side', 'pill', 'lowerthird', 'counter', 'marquee'].includes(g.type) ? 'overlay' : platform === 'youtube' ? (b.layout === 'split' ? 'pip' : b.layout === 'overlay' ? 'full' : b.layout ?? 'full') : b.layout === 'pip' || b.layout === 'overlay' ? 'full' : b.layout ?? 'full';
		}
		if (b.kind === 'broll') {
			if (!b.broll?.query) return;
			beat.broll = {query: b.broll.query, alt: b.broll.alt};
		}
		if (b.kind === 'chip') {
			if (!s(b.chip)) return;
			beat.chip = s(b.chip);
		}
		beats.push(beat);
	});
	return {
		summary: r.summary,
		title: r.title,
		hook: setup?.hook?.text || r.hook,
		thinking: r.thinking.slice(0, 8),
		mood: r.mood,
		keywords: r.keywords.filter((i) => valid.has(i)),
		beats,
		cards: [],
		questions: r.questions.slice(0, 3).filter((q) => q.options?.length >= 2),
	};
}

// ---------------------------------------------------------------- montáž bez mluvení (produkt, nemovitost, reklama): popisky přes záběry
const SYSTEM_MONTAGE = `Jsi motion designer reklamních a produktových videí. Video je montáž hezkých záběrů do rytmu hudby, BEZ mluvení.
Navrhni textové popisky přes záběry – málo, elegantně, čitelně (jako u prémiových reklam, realitních a produktových videí).
- Používej JEN informace od autora (název, parametry, cena, lokalita, výhody, kontakt). NIC si nevymýšlej – žádná čísla ani fakta navíc.
- Popisky: "lowerthird" (název + podnadpis dole), "pill" (krátká vlastnost), "counter" (číslo/cena, které se načte), "kinetic" (2–4 slova přes obraz), "reveal" (krátká věta přes obraz).
- Začátek: úvodní popisek v prvních 2 s. Konec: poslední 2–3 s výzva / kontakt / cena, pokud ji autor uvedl.
- Mezi popisky nech prostor (aspoň 1 záběr bez textu). at = začátek v sekundách (zarovnej na začátek záběru), dur 1,6–3,5 s.
- Když autor nic neuvedl, vrať 0–2 obecné popisky jen z toho, co víš (nebo žádné).
Piš česky (nebo jazykem, kterým píše autor).`;
const MONTAGE_SCHEMA = {
	type: 'object',
	properties: {
		title: {type: 'string'},
		summary: {type: 'string'},
		beats: {type: 'array', items: {type: 'object', properties: {at: {type: 'number'}, dur: {type: 'number'}, gfx: GFX}, required: ['at', 'dur', 'gfx']}},
	},
	required: ['title', 'summary', 'beats'],
};

export async function planMontage({brief, typeLabel, duration, shots, prefs = ''}, config) {
	const prompt = `TYP VIDEA: ${typeLabel}
DÉLKA: ${duration.toFixed(1)} s, záběry začínají v časech: ${shots.map((x) => x.toFixed(2)).join(', ')}
INFORMACE OD AUTORA: ${brief || '(nic neuvedl)'}
${prefs ? `CO AUTOR (NE)MÁ RÁD:\n${prefs}\n` : ''}`;
	const r = await askClaude(config, prompt, SYSTEM_MONTAGE, {schema: MONTAGE_SCHEMA, timeoutMs: 180000});
	const beats = [];
	(r.beats ?? []).forEach((b, k) => {
		const g = cleanGfx(b.gfx);
		if (!g || !['lowerthird', 'pill', 'counter', 'kinetic', 'reveal', 'headline', 'marquee'].includes(g.type)) return;
		const at = Math.min(Math.max(0, Number(b.at) || 0), Math.max(0, duration - 1));
		beats.push({id: `m${k + 1}`, wi: -1, at, dur: Math.min(Math.max(Number(b.dur) || 2.4, 1.2), 4), kind: 'gfx', layout: 'overlay', gfx: g, why: 'popisek montáže'});
	});
	return {summary: r.summary, title: r.title, hook: '', thinking: [], mood: '', keywords: [], beats, cards: [], questions: []};
}

// ---------------------------------------------------------------- kritik grafiky: každý beat znovu posoudí proti tomu, co se říká
// Grafika, B-roll nebo štítek, který k místu nesedí (nic nepřidá, opakuje titulky, je mimo téma), se vyhodí – lepší čistý záběr.
const SYSTEM_CRITIC = `Jsi přísný šéfstřihač prémiových krátkých videí. Dostaneš plán střihu: u každého prvku (motion grafika, B-roll, štítek, přiblížení)
vidíš, kdy přijde, co v tu chvíli mluvčí říká a co prvek ukazuje. Ohodnoť každý prvek 1–10:
10 = divák díky němu líp pochopí / zapamatuje si pointu (číslo, výčet, kroky, srovnání, silná pointa), obsah přesně odpovídá řeči;
5 = neškodí, ale nic nepřidává (jen opakuje titulky, obecná fráze);
1 = nesedí (jiné téma, špatné číslo, ruší, přichází moc brzo po jiném prvku, působí lacině).
Hodnoť i celek: když jdou prvky moc hustě za sebou, slabší z nich dej nízko. Rozhoduj podle typu videa a zadání. Důvod piš česky, 2–6 slov.`;
const CRITIC_SCHEMA = {type: 'object', properties: {items: {type: 'array', items: {type: 'object', properties: {id: {type: 'string'}, score: {type: 'integer'}, reason: {type: 'string'}}, required: ['id', 'score', 'reason']}}}, required: ['items']};

const describe = (b) => {
	if (b.kind === 'broll') return `B-roll: ${b.broll?.query ?? ''}`;
	if (b.kind === 'chip') return `štítek: ${b.chip}`;
	if (b.kind === 'punch') return 'přiblížení na důraz';
	const g = b.gfx ?? {};
	// všechen text grafiky (words, items, steps, bars…), ať kritik vidí, co přesně ukazuje
	const bits = [];
	const walk = (v, k) => (typeof v === 'string' ? k !== 'type' && k !== 'icon' && bits.push(v) : typeof v === 'number' ? k !== 'times' && bits.push(String(v)) : v && typeof v === 'object' ? Object.entries(v).forEach(([kk, x]) => kk !== 'times' && walk(x, Array.isArray(v) ? k : kk)) : null);
	walk(g, '');
	return `grafika ${g.type}: ${bits.join(' | ').slice(0, 160)}`;
};

// beats + words (výstupní, s časy) -> {beats, dropped: [{beat, reason}]}
export async function criticBeats(beats, words, config, {brief = '', type = '', min = 6} = {}) {
	const judged = beats.filter((b) => b.kind !== 'punch');
	if (judged.length < 2) return {beats, dropped: []};
	const pos = new Map(words.map((w, i) => [w.wi, i]));
	const lines = judged.map((b) => {
		const i = pos.get(b.wi) ?? 0;
		const t = words[i]?.start ?? 0;
		return `${b.id} @${t.toFixed(1)}s (${b.dur.toFixed(1)} s) ${describe(b)}\n   mluvčí: „${words.slice(Math.max(0, i - 4), i + 14).map((w) => w.text).join(' ')}“`;
	});
	const prompt = `Typ videa: ${type || 'krátké video'}\nZadání: ${brief || '—'}\nDélka: ${(words[words.length - 1]?.start ?? 0).toFixed(0)} s\n\nPrvky plánu:\n${lines.join('\n')}`;
	let r;
	try {
		r = await askClaude(config, prompt, SYSTEM_CRITIC, {schema: CRITIC_SCHEMA, timeoutMs: 150000});
	} catch {
		return {beats, dropped: []};
	}
	const bad = new Map((r.items ?? []).filter((x) => Number(x.score) < min).map((x) => [x.id, x.reason]));
	return {beats: beats.filter((b) => !bad.has(b.id)), dropped: beats.filter((b) => bad.has(b.id)).map((b) => ({beat: b, reason: bad.get(b.id)}))};
}
