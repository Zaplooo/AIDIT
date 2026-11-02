// Styl z rozboru reference: AI převede „recept“ (profile.json) na styl aplikace (titulky, barvy, tempo, beaty).
import {askClaude} from './ai.mjs';

const SYSTEM = `Převádíš rozbor referenčního videa na nastavení střihové aplikace. Aplikace má: titulky (režim bold = VERZÁLKY ve dvou barvách,
word = minimal bílé slovo + kurzíva s patkami na klíčových slovech, mix = střídání tučného písma a kurzívy s patkami, goat = aktivní slovo barevně),
fonty (Archivo Black, Anton, Bebas Neue, Montserrat, Poppins, Inter, Inter Tight, DM Serif Display, Instrument Serif),
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
			properties: {
				enabled: {type: 'boolean'},
				mode: {type: 'string', enum: ['bold', 'word', 'mix', 'goat']},
				font: {type: 'string'},
				weight: {type: 'integer'},
				size: {type: 'integer'},
				color: {type: 'string'},
				highlight: {type: 'string'},
				textCase: {type: 'string', enum: ['lower', 'upper', 'normal']},
				maxWords: {type: 'integer'},
				y: {type: 'number'},
				animation: {type: 'string', enum: ['blur', 'pop', 'fade-up', 'none']},
			},
			required: ['enabled', 'mode', 'font', 'weight', 'size', 'color', 'highlight', 'textCase', 'maxWords', 'y', 'animation'],
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
	const fonts = Object.keys(FONT_WEIGHT);
	const font = fonts.find((f) => r.captions.font?.toLowerCase().includes(f.toLowerCase())) ?? 'Inter';
	return {
		name: r.name,
		description: r.description,
		platform: r.platform,
		look: {...r.look, cardKind: r.theme.bg === 'cream' ? 'cream' : 'dark'},
		theme: {bg: r.theme.bg, font: fonts.find((f) => r.theme.font?.toLowerCase().includes(f.toLowerCase())) ?? 'Montserrat', serif: r.theme.serif?.includes('Instrument') ? 'Instrument Serif' : 'DM Serif Display'},
		captions: {...r.captions, font, weight: FONT_WEIGHT[font] ?? 600, shadow: true, size: Math.min(Math.max(r.captions.size, 44), 120), y: Math.min(Math.max(r.captions.y > 1 ? r.captions.y / 100 : r.captions.y, 0.2), 0.82)},
		cards: {kind: r.theme.bg === 'cream' ? 'cream' : 'dark', every: 0},
		recipe: r.recipe,
	};
}
