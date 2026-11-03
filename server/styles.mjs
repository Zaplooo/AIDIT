// Styl z rozboru reference: AI převede „recept“ (profile.json) na styl aplikace (titulky, barvy, tempo, beaty).
import {askClaude} from './ai.mjs';
import {CAPTION_PROPS} from './assist.mjs';
import {CATALOG} from './setup.mjs';

const SYSTEM = `Převádíš rozbor referenčního videa na nastavení střihové aplikace. Cíl: výsledek má vypadat co nejpodobněji vzoru.
TITULKY nastav VŽDY v režimu mode "custom" – umí všechno najednou: font, size (px při šířce 1080), textCase, maxWords (slov na řádek), y (výška 0–1),
color, stroke (obrys px) + strokeColor, box (podklad pod řádkem, hex s průhledností), shadow, emoji (emoji u klíčových slov),
alt = druhý font (every alternate / third / keyword + font, italic, color, scale), active = právě vyslovené slovo (color, scale 1–1.5, box = barva boxu za slovem, glow, font, italic),
animation: typewriter (slova naskakují), karaoke (řádek stojí, vyslovená se rozsvěcují), bounce (slovo vyskočí), rise (plynulé vynoření), zoom (slovo dosedne z přiblížení), pop, fade-up, slide, blur, none.
Fonty titulků i grafik vybírej JEN z: ${CATALOG.fonts.map((f) => f.family).join(', ')} (nejbližší vzhledem ke vzoru),
rozložení (full = mluvčí přes celou plochu, framed = mluvčí v zaobleném rámečku na černé), barevný tón (none, cinematic, dark, warm),
skoky ve střihu (hard = tvrdý střih, punch = střídání přiblížení), tempo (calm, normal, fast), efekty (off, soft, bold),
pozadí grafik (dark, cream, brand, glass) a beaty: grafika (headline, stat, list, quote, chat, compare, slam, timer, step;
layout full/split/pip), B-roll, štítek (chip), důrazné přiblížení (punch).
Vrať co nejvěrnější nastavení. recipe = konkrétní pokyny pro AI plánovač střihu (česky): jak často a které beaty, poměr času, co nedělat.`;

const SCHEMA = {
	type: 'object',
	properties: {
		name: {type: 'string'},
		description: {type: 'string'},
		platform: {type: 'string', enum: ['reels', 'youtube']},
		look: {
			type: 'object',
			properties: {
				tempo: {type: 'string', enum: ['calm', 'normal', 'fast']},
				jump: {type: 'string', enum: ['hard', 'punch']},
				grade: {type: 'string', enum: ['none', 'cinematic', 'dark', 'warm']},
				layout: {type: 'string', enum: ['full', 'framed']},
				sfx: {type: 'string', enum: ['off', 'soft', 'bold']},
				accent: {type: 'string'},
				music: {type: 'string', enum: ['auto', 'off', 'energetic', 'motivating', 'hiphop', 'lofi', 'chill', 'cinematic', 'dark', 'happy', 'corporate', 'emotional']},
				zoom: {type: 'boolean'},
			},
			required: ['tempo', 'jump', 'grade', 'layout', 'sfx', 'accent', 'music', 'zoom'],
		},
		theme: {type: 'object', properties: {bg: {type: 'string', enum: ['dark', 'cream', 'brand', 'glass']}, font: {type: 'string'}, serif: {type: 'string'}}, required: ['bg', 'font', 'serif']},
		captions: {
			type: 'object',
			properties: CAPTION_PROPS,
			required: ['enabled', 'mode', 'font', 'size', 'color', 'textCase', 'maxWords', 'y', 'animation'],
		},
		recipe: {
			type: 'object',
			properties: {
				beatsPerMinute: {type: 'number'},
				fullscreenShare: {type: 'number'},
				brollShare: {type: 'number'},
				preferredGfx: {type: 'array', items: {type: 'string'}},
				layouts: {type: 'array', items: {type: 'string'}},
				rules: {type: 'array', items: {type: 'string'}},
			},
			required: ['beatsPerMinute', 'fullscreenShare', 'brollShare', 'preferredGfx', 'layouts', 'rules'],
		},
	},
	required: ['name', 'description', 'platform', 'look', 'theme', 'captions', 'recipe'],
};

const FONT_WEIGHT = {'Archivo Black': 400, Anton: 400, 'Bebas Neue': 400, Montserrat: 800, Poppins: 800, Inter: 600, 'Inter Tight': 800};

export async function styleFromProfiles(profiles, config, {name = '', note = ''} = {}) {
	const prompt = `${note ? `Poznámka autora: ${note}\n` : ''}Rozbor ${profiles.length > 1 ? 'referenčních videí' : 'referenčního videa'}:\n${profiles.map((p) => JSON.stringify(p)).join('\n\n')}\n\n${name ? `Název stylu: ${name}` : 'Vymysli krátký český název stylu (2–3 slova).'}`;
	const r = await askClaude(config, prompt, SYSTEM, {schema: SCHEMA, timeoutMs: 300000});
	const fonts = [...new Set(CATALOG.fonts.map((f) => f.family))].sort((a, b) => b.length - a.length);
	const pick = (x, d) => fonts.find((f) => x?.toLowerCase().includes(f.toLowerCase())) ?? d;
	const font = pick(r.captions.font, 'Inter Tight');
	return {
		name: r.name,
		description: r.description,
		platform: r.platform,
		look: {...r.look, cardKind: r.theme.bg === 'cream' ? 'cream' : 'dark'},
		theme: {bg: r.theme.bg, font: pick(r.theme.font, 'Montserrat'), serif: r.theme.serif?.includes('Instrument') ? 'Instrument Serif' : 'DM Serif Display'},
		captions: {
			...r.captions,
			mode: 'custom',
			font,
			weight: FONT_WEIGHT[font] ?? 800,
			shadow: r.captions.shadow ?? !r.captions.stroke,
			size: Math.min(Math.max(r.captions.size, 40), 130),
			y: Math.min(Math.max(r.captions.y > 1 ? r.captions.y / 100 : r.captions.y, 0.2), 0.85),
			...(r.captions.alt ? {alt: r.captions.alt.every === 'none' ? undefined : {...r.captions.alt, font: r.captions.alt.font ? pick(r.captions.alt.font, undefined) : undefined}} : {}),
		},
		cards: {kind: r.theme.bg === 'cream' ? 'cream' : 'dark', every: 0},
		recipe: r.recipe,
	};
}
