// AI rozbor referenčního videa: podívá se na filmové pásy + čísla (tempo, střihy, zvuk) a sepíše „recept“ stylu.
import fs from 'node:fs';
import path from 'node:path';
import {askClaude} from './ai.mjs';

const SYSTEM = `Jsi špičkový střihač a motion designer (Reels, TikTok, YouTube). Rozebíráš referenční video, které se autorovi líbí,
abys jeho styl střihu převedl do střihové aplikace a použil ho na autorova talking-head videa.
Máš filmové pásy (snímky s časem vlevo nahoře – PŘEČTI SI VŠECHNY soubory sheet_*.jpg nástrojem Read) a naměřená čísla.
Buď konkrétní a technický: velikosti v procentech šířky/výšky, pozice, barvy v HEX, typ písma, animace, časování.
Nevymýšlej si – co ze snímků nepoznáš, označ jako nejisté. Piš česky.`;

const SCHEMA = {
	type: 'object',
	properties: {
		platform: {type: 'string', enum: ['reels', 'youtube', 'other']},
		kind: {type: 'string', description: 'talking-head / tutorial / vlog / motion-only / list / jiný'},
		summary: {type: 'string'},
		whyGreat: {type: 'array', items: {type: 'string'}},
		layouts: {type: 'array', items: {type: 'object', properties: {name: {type: 'string'}, share: {type: 'number'}, description: {type: 'string'}}, required: ['name', 'share', 'description']}},
		captions: {
			type: 'object',
			properties: {
				present: {type: 'boolean'},
				wordsPerGroup: {type: 'string'},
				font: {type: 'string'},
				closestFont: {type: 'string', enum: ['Archivo Black', 'Anton', 'Bebas Neue', 'Montserrat ExtraBold', 'Poppins ExtraBold', 'Inter SemiBold', 'Inter Tight ExtraBold', 'Instrument Serif Italic', 'DM Serif Display Italic', 'jiný']},
				case: {type: 'string'},
				sizePctWidth: {type: 'number'},
				positionYPct: {type: 'number'},
				colors: {type: 'array', items: {type: 'string'}},
				emphasis: {type: 'string'},
				animation: {type: 'string'},
			},
			required: ['present', 'wordsPerGroup', 'font', 'closestFont', 'case', 'sizePctWidth', 'positionYPct', 'colors', 'emphasis', 'animation'],
		},
		graphics: {type: 'array', items: {type: 'object', properties: {type: {type: 'string'}, when: {type: 'string'}, look: {type: 'string'}, animation: {type: 'string'}, frequency: {type: 'string'}}, required: ['type', 'when', 'look', 'animation', 'frequency']}},
		broll: {type: 'object', properties: {used: {type: 'boolean'}, kinds: {type: 'array', items: {type: 'string'}}, share: {type: 'number'}, how: {type: 'string'}}, required: ['used', 'kinds', 'share', 'how']},
		cutting: {type: 'object', properties: {pace: {type: 'string'}, avgShotSec: {type: 'number'}, jumpCuts: {type: 'string'}, zooms: {type: 'string'}, transitions: {type: 'string'}, hook: {type: 'string'}, ending: {type: 'string'}}, required: ['pace', 'avgShotSec', 'jumpCuts', 'zooms', 'transitions', 'hook', 'ending']},
		color: {type: 'object', properties: {grade: {type: 'string'}, palette: {type: 'array', items: {type: 'string'}}}, required: ['grade', 'palette']},
		sound: {type: 'object', properties: {music: {type: 'string'}, sfx: {type: 'string'}}, required: ['music', 'sfx']},
		implement: {type: 'array', items: {type: 'string'}, description: 'konkrétní kroky, jak tento styl postavit v Remotion/FFmpeg na videu mluvčího'},
	},
	required: ['platform', 'kind', 'summary', 'whyGreat', 'layouts', 'captions', 'graphics', 'broll', 'cutting', 'color', 'sound', 'implement'],
};

export async function studyReference(dir, config, {note = ''} = {}) {
	const st = JSON.parse(fs.readFileSync(path.join(dir, 'study.json'), 'utf-8'));
	const prompt = `Referenční video: ${st.file}${note ? ` (poznámka autora: ${note})` : ''}
Rozměr ${st.width}×${st.height}, délka ${st.duration} s, ${st.fps} fps.
Střihy (detekce změny obrazu): ${st.cuts.length} (≈ ${st.cutsPerMin}/min, v prvních 15 s: ${st.cutsFirst15s}). Časy: ${st.cuts.slice(0, 60).join(', ')}
Řeč: ${st.words} slov, ${st.wpm ?? '?'} slov/min, mezery mezi slovy medián ${st.gapP50 ?? '?'} s, 90 % ${st.gapP90 ?? '?'} s, max ${st.gapMax ?? '?'} s. Jazyk ${st.lang}.
Zvuk: hladina v mezerách ${st.audio.gapMedianDb} dB vs. podlaha ${st.audio.floorDb} dB, řeč ${st.audio.speechDb} dB → hudba pravděpodobně: ${st.audio.musicLikely ? 'ANO' : 'ne'}. Výrazné zvukové nástupy mimo řeč (efekty?) v časech: ${st.audio.sfxOnsets.join(', ') || 'žádné'}
Přepis (čas v [s]): ${st.transcript ?? ''}

Filmové pásy ve složce: ${st.sheets.slice(0, 4).map((s) => path.join(dir, s)).join(', ')}
Přečti všechny pásy a vrať rozbor podle schématu.`;
	const r = await askClaude(config, prompt, SYSTEM, {schema: SCHEMA, readDir: dir, timeoutMs: 600000});
	fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({...r, file: st.file, stats: {duration: st.duration, width: st.width, height: st.height, cutsPerMin: st.cutsPerMin, wpm: st.wpm, gapP90: st.gapP90, music: st.audio.musicLikely}}, null, 1));
	return r;
}

// CLI: node server/refai.mjs <složka rozboru> [poznámka]
if (process.argv[1] && process.argv[1].endsWith('refai.mjs')) {
	const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf-8'));
	const r = await studyReference(path.resolve(process.argv[2]), config, {note: process.argv[3] ?? ''});
	console.log(r.platform, '|', r.kind, '|', r.summary);
}
