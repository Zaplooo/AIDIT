// Rozbor všech referencí: node scripts/study_all.mjs  (každé video jen jednou; stažená videa po rozboru smaže)
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {studyReference} from '../server/refai.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf-8'));
const IN = path.join(ROOT, 'references', '_incoming');
const OUT = path.join(ROOT, 'references', 'study');
const notes = {};
// poznámky uživatele z links.txt (komentář nad odkazem platí pro následující odkazy)
let note = '';
for (const l of fs.readFileSync(path.join(ROOT, 'references', 'links.txt'), 'utf-8').split(/\r?\n/)) {
	if (l.startsWith('# „')) note = l.slice(2);
	const m = l.match(/(?:reels?|shorts|watch\?v=)\/?([\w-]+)/);
	if (m && !l.startsWith('#')) notes[m[1]] = note;
}
const only = process.argv[2] ?? '';
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.mp4') && x.startsWith(only)).sort()) {
	const id = f.replace(/\.mp4$/, '');
	const dir = path.join(OUT, id);
	if (fs.existsSync(path.join(dir, 'profile.json'))) continue;
	if (!fs.existsSync(path.join(dir, 'study.json'))) {
		const r = spawnSync(config.python, [path.join(ROOT, 'worker', 'refstudy.py'), path.join(IN, f), dir], {encoding: 'utf-8', env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
		if (r.status !== 0) {
			console.log('CHYBA studie', f, r.stderr.slice(-300));
			continue;
		}
	}
	try {
		const key = id.replace(/^(Instagram|Youtube)_/, '');
		const p = await studyReference(dir, config, {note: notes[key] ?? ''});
		console.log('OK', id, '|', p.platform, '|', p.kind);
	} catch (e) {
		console.log('CHYBA AI', id, e.message);
	}
}
