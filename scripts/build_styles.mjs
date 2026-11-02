// Z rozborů referencí (references/study/*/profile.json) složí knihovnu stylů podle formátu.
// node scripts/build_styles.mjs
import fs from 'node:fs';
import path from 'node:path';
import {styleFromProfiles} from '../server/styles.mjs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const prof = (id) => {
	const f = path.join('references', 'study', id, 'profile.json');
	if (!fs.existsSync(f)) return null;
	const p = JSON.parse(fs.readFileSync(f, 'utf-8'));
	delete p.implement; // ať je vstup kratší – stačí popis stylu
	return p;
};
const SOUND = ['Instagram_De9ZM9sMIv2', 'Instagram_DeZqpU8xZvx', 'Instagram_Dd3r5DyxYxX', 'Instagram_DeKCJSlz5BX', 'Instagram_DfBT7LNuykR', 'Instagram_Dc_LiRWx0Yl']
	.map(prof)
	.filter(Boolean)
	.map((p) => `${p.summary} Hudba: ${p.sound.music} Efekty: ${p.sound.sfx}`)
	.join('\n');

const GROUPS = [
	{id: 'storytelling', order: 1, name: 'Storytelling s B-rollem', refs: ['Instagram_C8iK3P-xZbk', 'Instagram_DAzCFqTRxWm', 'Instagram_DfA5xGzxFRy'], note: 'Autor tento styl miluje (Austin Georgas: „naprosto geniální“). Hodně doslovného B-rollu, malá elegantní typografie, kurzíva na klíčových slovech.'},
	{id: 'hype', order: 2, name: 'Hype creator', refs: ['Instagram_DbS2vcfyQxx', 'Instagram_DXo0c5bkn53', 'Instagram_DdWZp6OyyqV', 'Instagram_DetyqaMyvhe'], note: 'Velké výrazné titulky, mockupy, čísla, odpočty, zvukové efekty.'},
	{id: 'explainer', order: 3, name: 'Vysvětlení s grafikou', refs: ['Instagram_Db-zJhiuXP3', 'Instagram_De_5mQ0R8PE'], note: 'Split screen jen při vysvětlování (grafika nahoře, mluvčí dole), jinak mluvčí přes celou plochu.'},
	{id: 'mixfont', order: 4, name: 'Mix fontů', refs: ['Instagram_De-IxT4u2Ow', 'Instagram_DcBwAjvoEqI', 'Instagram_DewTzCzxR9q'], note: 'Elegantní typografie: kombinace tučného písma a kurzívy s patkami, krokové karty.'},
	{id: 'kinetic', order: 5, name: 'Kinetická typografie', refs: ['Instagram_DfA5LKHtbc2', 'Instagram_DcGS94iz3xD', 'Youtube_N63QJxNm8sc'], note: 'Obří slova přes celou obrazovku v rytmu řeči, výrazné barvy, rychlé střihy. Mluvčí se střídá s typografií.'},
	{id: 'yt-vlog', order: 11, name: 'YouTube vlog', refs: ['Youtube_AW2_VWQsw0Q', 'Youtube_TuvFv_o6Vxg'], note: 'Český YouTube: hodně B-rollu, textové karty kondenzovaným písmem, lower-thirdy.'},
	{id: 'yt-explainer', order: 12, name: 'YouTube explainer', refs: ['Youtube_ZRRQFWT17B8', 'Youtube_2moKxAZjwCE', 'Youtube_n50KkoucMpU', 'Youtube_oa13Pqpdd5E', 'Youtube_CBY38V4vnOI'], note: 'Mluvčí v rohu nad grafikou (pip), screenshoty, kapitoly, klidnější titulky.'},
	{id: 'yt-cinematic', order: 13, name: 'YouTube filmový', refs: ['Youtube_c9UKnKVCaSU', 'Youtube_BaWrJajJRjA'], note: 'Filmový obraz, titulky se zvýrazněným slovem, pomalejší a dramatický rytmus.'},
];

const only = process.argv[2];
for (const g of GROUPS) {
	if (only && g.id !== only) continue;
	const profiles = g.refs.map(prof).filter(Boolean);
	if (!profiles.length) {
		console.log('bez rozborů', g.id);
		continue;
	}
	const st = await styleFromProfiles(profiles, config, {name: g.name, note: `${g.note}\nZvukové reference autora (hudba a efekty jsou pro něj stěžejní):\n${SOUND}`});
	const style = {id: g.id, order: g.order, ...st, name: g.name, platform: g.id.startsWith('yt-') ? 'youtube' : 'reels', learnedFrom: g.refs};
	fs.writeFileSync(path.join('styles', `${g.id}.json`), JSON.stringify(style, null, 1));
	console.log('OK', g.id, '|', style.description);
}
