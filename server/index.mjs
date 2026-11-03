// AIDIT – lokální server: klienti, nahrání, zpracování (Python + AI), projekt (JSON), náhled (souvislé video), export (Remotion).
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {askClaude, fixTranscript, findClaude, selectTakes} from './ai.mjs';
import {planMontage, planVideo2} from './planner.mjs';
import {pickBroll, searchMixkit} from './broll.mjs';
import {studyReference} from './refai.mjs';
import {styleFromProfiles} from './styles.mjs';
import {applySetup, CATALOG, withDefaults} from './setup.mjs';
import {assist, command, fillGfx, pickEmojis, suggestHooks} from './assist.mjs';
import {attachHeads, dedupeSelection, reviewCut} from './cutcheck.mjs';
import {learnFromEdit, prefsText, readPrefs, remember, writePrefs} from './prefs.mjs';
import {styleToSetup} from './setup.mjs';
import {itemTimes, syncBeats} from './sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf-8'));
const PROJECTS = path.join(ROOT, 'projects');
const STYLES = path.join(ROOT, 'styles');
const CLIENTS = path.join(ROOT, 'clients');
fs.mkdirSync(PROJECTS, {recursive: true});
fs.mkdirSync(CLIENTS, {recursive: true});

// Pauzy podle tempa: ticho delší než maxPause se ZKRÁTÍ (ne smaže) – uvnitř věty na intraKeep, mezi větami na breakKeep.
// Reference mají mezery mezi slovy 0,05–0,12 s, ale mezi větami krátký nádech – jinak věty „naskakují z ničeho nic“.
const TEMPO = {
	calm: {maxPause: 0.6, intraKeep: 0.3, breakKeep: 0.45},
	normal: {maxPause: 0.4, intraKeep: 0.18, breakKeep: 0.32},
	fast: {maxPause: 0.28, intraKeep: 0.12, breakKeep: 0.24},
};

const readJson = async (f, fallback = null) => {
	try {
		return JSON.parse(await fsp.readFile(f, 'utf-8'));
	} catch {
		return fallback;
	}
};
const writeJson = (f, data) => fsp.writeFile(f, JSON.stringify(data, null, 1), 'utf-8');
const pdir = (id) => {
	if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('špatné id');
	return path.join(PROJECTS, id);
};
// výchozí styl podle formátu: Reels = storytelling (autorův oblíbený), YouTube = explainer
const defaultPreset = (a = {}) => (a.platform === 'youtube' || a.format === '16:9' ? 'yt-explainer' : 'storytelling');
const loadStyle = async (id) => (await readJson(path.join(STYLES, `${id}.json`))) ?? (await readJson(path.join(STYLES, 'goat-zaklad.json')));

// ------------------------------------------------------------ joby
const jobs = new Map();
const activeJob = new Map(); // projectId -> běžící job, aby se nespouštěly dva naráz
const newJob = (projectId, kind) => {
	const job = {id: `${kind}-${Date.now().toString(36)}`, projectId, kind, progress: 0, step: 'Začínám', status: 'running', error: null, result: null, log: []};
	jobs.set(job.id, job);
	return job;
};
const say = (job, line) => {
	job.log.push({t: Date.now(), line});
	job.step = line;
};

const runPython = (args, onProgress = () => {}) =>
	new Promise((resolve, reject) => {
		const p = spawn(CONFIG.python, [path.join(ROOT, 'worker', 'pipeline.py'), ...args], {env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
		let err = '';
		let buf = '';
		p.stdout.on('data', (d) => {
			buf += d.toString('utf-8');
			const lines = buf.split(/\r?\n/);
			buf = lines.pop();
			for (const l of lines) {
				const m = l.match(/^PROGRESS ([\d.]+) ?(.*)$/);
				if (m) onProgress(parseFloat(m[1]), m[2]);
			}
		});
		p.stderr.on('data', (d) => (err += d.toString('utf-8')));
		p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.split('\n').filter(Boolean).slice(-6).join('\n') || `python skončil s kódem ${code}`))));
	});

const median = (a) => {
	if (!a.length) return null;
	const s = [...a].sort((x, y) => x - y);
	return s[Math.floor(s.length / 2)];
};

// výchozí vzhled z presetu + odpovědi z průvodce
async function lookFor(styleId, answers = {}) {
	const st = await loadStyle(styleId);
	return {
		style: st,
		look: {
			preset: st.id,
			tempo: answers.tempo ?? st.look.tempo,
			jump: answers.jump ?? st.look.jump,
			grade: st.look.grade,
			layout: st.look.layout,
			sfx: answers.sfx ?? st.look.sfx,
			accent: st.look.accent,
			cardKind: st.cards?.kind ?? st.look.cardKind ?? 'dark',
			music: null,
			maxLength: answers.maxLength ?? null,
			platform: st.platform ?? 'reels',
			theme: st.theme ?? undefined,
			zoom: answers.zoom ?? st.look.zoom ?? false,
		},
		captions: {...st.captions, enabled: answers.captions !== false},
	};
}
const pickAnswers = (a) => Object.fromEntries(['tempo', 'jump', 'sfx', 'maxLength'].filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));

// složí project.json z výsledků zpracování (ruční úpravy vzhledu zůstanou, když keepLook)
async function assemble(id, {keepLook = true} = {}) {
	const dir = pdir(id);
	const meta = await readJson(path.join(dir, 'meta.json'));
	const old = await readJson(path.join(dir, 'project.json'));
	const words = (await readJson(path.join(dir, 'words_fixed.json'))) ?? (await readJson(path.join(dir, 'words.json')));
	const clips = await readJson(path.join(dir, 'clips.json'));
	const faces = (await readJson(path.join(dir, 'faces.json'), [])) ?? [];
	const units = (await readJson(path.join(dir, 'units.json'), [])) ?? [];
	const sel = await readJson(path.join(dir, 'selection.json'));
	const ans = meta.answers ?? {};
	const preset = keepLook && old?.look?.preset ? old.look.preset : ans.preset ?? defaultPreset(ans);
	const def = await lookFor(preset, ans);
	const all = {x: median(faces.map((f) => f.x)), y: median(faces.map((f) => f.y))};
	for (const c of clips) {
		const inClip = faces.filter((f) => f.t >= c.in - 0.25 && f.t <= c.out + 0.25);
		const fx = median(inClip.map((f) => f.x)) ?? all.x;
		const fy = median(inClip.map((f) => f.y)) ?? all.y;
		c.face = fx == null ? null : {x: fx, y: fy};
		// stabilní výřez: malé rozdíly polohy obličeje mezi klipy by na každém střihu poskočily (vypadá to jako lag)
		if (c.face && all.x != null && Math.abs(c.face.x - all.x) < 0.07 && Math.abs(c.face.y - all.y) < 0.07) c.face = {x: all.x, y: all.y};
	}
	const keepIds = sel ? new Set(sel.keep) : null;
	const project = {
		version: 2,
		id,
		name: meta.name,
		createdAt: meta.createdAt,
		// typ podle délky HOTOVÉHO střihu (surový záznam s pokusy bývá dlouhý, i když z něj je reel)
		kind: clips.filter((c) => c.enabled).reduce((s, c) => s + c.out - c.in, 0) > 90 ? 'long' : 'short',
		format: old?.format ?? ans.format ?? '9:16',
		styleId: preset,
		source: {proxy: 'proxy.mp4', voice: 'voice.wav', width: meta.width, height: meta.height, fps: meta.fps, duration: meta.duration},
		words: words.map(({text, start, end, p}) => ({text, start, end, p})),
		clips,
		units: units.map((u) => ({
			id: u.id,
			text: u.text,
			start: u.start,
			end: u.end,
			keep: keepIds ? keepIds.has(u.id) : !u.retake && !u.filler,
			reason: sel?.reasons?.[u.id] ?? (u.filler ? 'vatové slovo' : u.retake ? 'přeřeknutí' : null),
		})),
		captions: keepLook && old?.captions ? old.captions : def.captions,
		look: keepLook && old?.look ? {...old.look, ...pickAnswers(ans)} : def.look,
		plan: old?.plan ?? {summary: '', title: '', hook: '', thinking: [], keywords: [], cards: [], questions: []},
		base: old?.base ?? {key: '', preview: null, full: null},
	};
	if (!keepLook) {
		project.look = def.look;
		// nastavení z průvodce / styl klienta má přednost před výchozím stylem
		if (ans.setup) Object.assign(project, applySetup(def.look, def.captions, ans.setup));
	}
	project.segments = meta.segments ?? null;
	await writeJson(path.join(dir, 'project.json'), project);
	return project;
}

const keyOf = (p) => JSON.stringify([p.format, p.look.jump, p.look.grade, p.clips.filter((c) => c.enabled).map((c) => [c.in, c.out, c.face?.x ?? null])]);

async function renderBase(id, quality, onProgress = () => {}) {
	const dir = pdir(id);
	await runPython(['base', dir, quality], onProgress);
	const p = await readJson(path.join(dir, 'project.json'));
	const v = Date.now().toString(36);
	const file = `base_${quality}.mp4`;
	// verze v URL, aby prohlížeč nepřehrál staré video z cache
	if (quality === 'preview') p.base = {...p.base, key: keyOf(p), preview: `${file}?v=${v}`};
	else p.base = {...p.base, full: `${file}?v=${v}`};
	await writeJson(path.join(dir, 'project.json'), p);
	return p;
}

// výstupní časy slov (stejný výpočet jako layout() v aplikaci)
function outWords(p) {
	const fps = p.source.fps;
	let f = 0;
	const laid = [];
	for (const c of p.clips)
		if (c.enabled) {
			const inF = Math.round(c.in * fps);
			const durF = Math.max(1, Math.round(c.out * fps) - inF);
			laid.push({...c, fromF: f});
			f += durF;
		}
	const words = [];
	p.words.forEach((w, wi) => {
		const c = laid.find((k) => Math.min(w.end, k.out) - Math.max(w.start, k.in) >= Math.min(0.5 * (w.end - w.start), 0.12));
		if (c) words.push({wi, text: w.text, start: c.fromF / fps + Math.max(w.start, c.in) - c.in});
	});
	return {words: words.sort((a, b) => a.start - b.start), duration: f / fps};
}

const MUSIC_LIB = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'music', 'library.json'), 'utf-8'));

// AI promyslí střih (beaty: grafika / B-roll / štítek / přiblížení), vybere B-roll a hudbu, připraví záběry
async function makePlan(id, job) {
	const dir = pdir(id);
	const p = await readJson(path.join(dir, 'project.json'));
	const meta = await readJson(path.join(dir, 'meta.json'));
	const ans = meta.answers ?? {};
	const st = await loadStyle(p.look.preset);
	const {words, duration} = outWords(p);
	const platform = p.format === '16:9' ? 'youtube' : 'reels';
	const setup = ans.setup ? withDefaults(ans.setup, platform) : null;
	const plan = await planVideo2({words, units: p.units, style: st, duration, platform, brief: ans.brief ?? '', setup, script: ans.script ?? '', prefs: prefsText()}, CONFIG);
	await setMeta(id, {planBrief: ans.brief ?? '', planSetup: JSON.stringify(ans.setup ?? null)});
	syncBeats(plan.beats, words); // položky grafiky naskočí, když je mluvčí vysloví
	if (p.captions?.emoji) {
		try {
			plan.emojis = await pickEmojis(words, CONFIG);
		} catch {
			/* bez emoji */
		}
	}
	if (job) {
		say(job, `AI: ${plan.summary}`);
		for (const t of plan.thinking) job.log.push({t: Date.now(), line: `• ${t}`});
	}
	// B-roll: AI vybere z kandidátů stock záběrů
	const br = plan.beats.filter((b) => b.kind === 'broll');
	if (br.length) {
		if (job) say(job, `Hledám ${br.length} B-roll záběrů ke slovům`);
		const text = (wi) => p.words.slice(wi, wi + 10).map((w) => w.text).join(' ');
		try {
			const picks = await pickBroll(br.map((b) => ({text: text(b.wi), query: b.broll.query, alt: b.broll.alt})), CONFIG, plan.mood);
			br.forEach((b, i) => {
				if (picks[i]) Object.assign(b.broll, {mixkit: picks[i].id, title: picks[i].title, alts: picks[i].alts});
			});
		} catch (e) {
			if (job) say(job, `B-roll se nepovedl vybrat (${e.message})`);
		}
		plan.beats = plan.beats.filter((b) => b.kind !== 'broll' || b.broll.mixkit);
		if (job) for (const b of plan.beats.filter((x) => x.kind === 'broll')) job.log.push({t: Date.now(), line: `• B-roll: ${b.broll.title}`});
	}
	const cur = await readJson(path.join(dir, 'project.json'));
	cur.plan = {...plan, questions: plan.questions};
	cur.plan.hook = plan.hook;
	if (setup) cur.look.hook = {...setup.hook, text: setup.hook.text || plan.hook || ''};
	// hudba přesně podle toho, co autor vybral (skladba / nálada / vlastní / bez hudby); jinak AI podle nálady videa
	const sm = setup?.music;
	const lib = MUSIC_LIB();
	if (sm?.mode === 'track' && sm.file) {
		const tr = lib.find((m) => m.file === sm.file);
		cur.look.music = {file: sm.file, name: tr ? `${tr.name} (Mixkit, ${tr.cat})` : sm.name ?? sm.file, volume: 0.5};
		if (job) job.log.push({t: Date.now(), line: `• Hudba: ${cur.look.music.name} – vybral jsi ji ty`});
	} else if (sm?.mode === 'custom' && sm.file) {
		cur.look.music = {file: sm.file, name: sm.name ?? 'Vlastní skladba', volume: 0.35, custom: true};
	}
	const musicMode = sm ? (sm.mode === 'mood' ? sm.mood : sm.mode === 'off' ? 'off' : sm.mode === 'auto' ? 'auto' : 'keep') : ans.music ?? st.look.music ?? 'auto';
	if (musicMode !== 'off' && musicMode !== 'keep' && !cur.look.music?.custom) {
		const cat = musicMode === 'auto' ? plan.mood : musicMode;
		const pool = lib.filter((m) => m.cat === cat);
		const pickM = (pool.length ? pool : lib)[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % (pool.length || lib.length)];
		cur.look.music = {file: pickM.file, name: `${pickM.name} (Mixkit, ${cat})`, volume: 0.5, auto: true};
		if (job) job.log.push({t: Date.now(), line: `• Hudba: ${pickM.name} – nálada ${cat}`});
	}
	if (musicMode === 'off') cur.look.music = null;
	await writeJson(path.join(dir, 'project.json'), cur);
	if (plan.beats.some((b) => b.kind === 'broll')) await runPython(['broll', dir]);
	return cur;
}

async function setMeta(id, patch) {
	const f = path.join(pdir(id), 'meta.json');
	const m = await readJson(f);
	Object.assign(m, patch);
	await writeJson(f, m);
	return m;
}

// AI si přečte hotový text v pořadí, jak jde ve videu, a vyhodí zdvojené / useknuté / nenavazující úseky -> nový střih
async function cleanPass(id, job) {
	const dir = pdir(id);
	try {
		const clips = await readJson(path.join(dir, 'clips.json'));
		const units = await readJson(path.join(dir, 'units.json'));
		const sel = await readJson(path.join(dir, 'selection.json'));
		if (!sel) return;
		const unitOf = new Map();
		for (const u of units) for (const w of u.words) unitOf.set(w, u);
		const ordered = [];
		for (const c of clips) if (c.enabled) for (const w of c.words ?? []) {
			const u = unitOf.get(w);
			if (u && ordered[ordered.length - 1] !== u && !ordered.includes(u)) ordered.push(u);
		}
		const meta = await readJson(path.join(dir, 'meta.json'));
		say(job, 'AI kontroluje hotový text: žádná věta dvakrát, nic useknutého');
		const r = await reviewCut(ordered.map((u) => ({id: u.id, text: u.text})), CONFIG, {brief: meta.answers?.brief ?? '', script: meta.answers?.script ?? '', allUnits: units});
		if (!r.drop.length && !r.add.length) return say(job, 'Kontrola střihu: text dává smysl, nic se neopakuje ani nechybí');
		const drop = new Set(r.drop.map((d) => d.id));
		sel.keep = [...sel.keep.filter((k) => !drop.has(k)), ...r.add];
		sel.reasons = {...(sel.reasons ?? {}), ...Object.fromEntries(r.drop.map((d) => [d.id, d.reason]))};
		for (const id of r.add) delete sel.reasons[id];
		await writeJson(path.join(dir, 'selection.json'), sel);
		say(job, `Kontrola střihu: ${drop.size ? `vyhodil jsem ${drop.size} úseků (${r.drop.slice(0, 3).map((d) => d.reason).join(', ')})` : ''}${drop.size && r.add.length ? ', ' : ''}${r.add.length ? `vrátil jsem ${r.add.length} chybějících začátků vět` : ''}`);
		await runPython(['cut', dir]);
	} catch (e) {
		say(job, `Kontrola střihu se nepovedla (${e.message}) – nechávám střih, jak je`);
	}
}


// ---------------------------------------------------------------- styl z odkazu: stáhnout jen na rozbor -> recept -> styl aplikace (video se pak smaže)
// Každý naučený odkaz se ukládá do „naučených stylů“ a do preferencí, ať se aplikace učí, co se autorovi líbí.
async function learnReference(url, note, report = () => {}) {
	const key = Buffer.from(url).toString('base64url').slice(-16).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
	const id = `ref-${key}`;
	const known = await readJson(path.join(STYLES, `${id}.json`));
	if (known) {
		report(`Styl z tohohle odkazu už znám: „${known.name}“`, 1);
		return {styleId: id, name: known.name, summary: known.summary ?? '', whyGreat: known.whyGreat ?? []};
	}
	const dir = path.join(ROOT, 'references', 'user', key);
	report('Stahuji video z odkazu (jen pro rozbor stylu)', 0.02);
	await new Promise((resolve, reject) => {
		const pr = spawn(CONFIG.python, [path.join(ROOT, 'worker', 'fetch.py'), url, path.join(dir, 'video.mp4')], {env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
		let err = '';
		pr.stdout.on('data', (d) => {
			const m = d.toString().match(/PROGRESS ([\d.]+)/g);
			if (m) report(null, 0.25 * parseFloat(m[m.length - 1].split(' ')[1]));
		});
		pr.stderr.on('data', (d) => (err += d));
		pr.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-400) || 'stažení selhalo'))));
	});
	report('Rozebírám střihy, tempo, zvuk a snímky vzoru', 0.3);
	await new Promise((resolve, reject) => {
		const pr = spawn(CONFIG.python, [path.join(ROOT, 'worker', 'refstudy.py'), path.join(dir, 'video.mp4'), dir], {env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
		let err = '';
		pr.stderr.on('data', (d) => (err += d));
		pr.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-400)))));
	});
	report('AI se dívá na vzor a sepisuje recept stylu', 0.55);
	const prof = await studyReference(dir, CONFIG, {note});
	for (const w of prof.whyGreat.slice(0, 3)) report(`• ${w}`);
	report('Převádím recept na styl aplikace', 0.85);
	const st = await styleFromProfiles([prof], CONFIG);
	const style = {id, order: 0, ...st, learnedFrom: [url], summary: prof.summary, whyGreat: prof.whyGreat, learnedAt: new Date().toISOString()};
	await writeJson(path.join(STYLES, `${id}.json`), style);
	for (const f of await fsp.readdir(dir)) if (/^video\./.test(f)) await fsp.rm(path.join(dir, f), {force: true});
	// učení: co se autorovi líbí (posledních 12 vzorů jde do každého plánu střihu)
	const pr = readPrefs();
	pr.learned = [{name: style.name, summary: prof.summary, why: prof.whyGreat.slice(0, 3), url}, ...(pr.learned ?? []).filter((x) => x.url !== url)].slice(0, 12);
	writePrefs(pr);
	return {styleId: id, name: style.name, summary: prof.summary, whyGreat: prof.whyGreat};
}

// naučený styl -> nastavení videa (typ videa a autorova přání zůstávají)
async function applyRefStyle(id, styleId) {
	const st = await readJson(path.join(STYLES, `${styleId}.json`));
	if (!st) return;
	const meta = await readJson(path.join(pdir(id), 'meta.json'));
	const ans = meta.answers ?? {};
	await setMeta(id, {answers: {...ans, preset: styleId, setup: {...styleToSetup(st), ...(ans.typeSetup ?? {})}}});
}

const typeOf = (ans) => (CATALOG.types ?? []).find((t) => t.id === ans?.videoType) ?? null;

// ---------------------------------------------------------------- montáž bez mluvení (produkt, nemovitost, reklama)
async function processMontage(id, job, vtype, refP, stage) {
	const dir = pdir(id);
	await writeJson(path.join(dir, 'words.json'), []);
	await writeJson(path.join(dir, 'units.json'), []);
	await writeJson(path.join(dir, 'faces.json'), []);
	if (refP) {
		const r = await refP;
		if (r?.styleId) await applyRefStyle(id, r.styleId);
	}
	let meta = await readJson(path.join(dir, 'meta.json'));
	let ans = meta.answers ?? {};
	const platform = ans.platform ?? 'reels';
	const setup = withDefaults(ans.setup, platform);
	const lib = MUSIC_LIB();
	let track = null;
	if (setup.music.mode === 'track') track = lib.find((m) => m.file === setup.music.file) ?? null;
	if (!track && setup.music.mode !== 'custom') {
		const mood = setup.music.mode === 'mood' ? setup.music.mood : vtype?.music ?? 'cinematic';
		const pool = lib.filter((m) => m.cat === mood);
		track = (pool.length ? pool : lib)[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % (pool.length || lib.length)];
	}
	const musicFile = setup.music.mode === 'custom' && setup.music.file ? setup.music.file : track?.file;
	await setMeta(id, {options: {...meta.options, musicFile, targetLen: setup.maxLength ?? ans.maxLength ?? null, order: ans.order ?? null}});
	say(job, `Vybírám nejhezčí kousky ze záběrů a stříhám do rytmu hudby${track ? ` („${track.name}“)` : ''}`);
	await runPython(['montage', dir], stage(0.15, 0.4));
	await assemble(id, {keepLook: false});
	const p = await readJson(path.join(dir, 'project.json'));
	const info = (await readJson(path.join(dir, 'montage.json'))) ?? {};
	if (info.bpm) say(job, `Hudba má ${info.bpm} BPM – ${info.count} záběrů po ${info.shot.toFixed(2)} s, střihy padají na takt`);
	p.look.music = musicFile ? {file: musicFile, name: track ? `${track.name} (Mixkit, ${track.cat})` : setup.music.name ?? 'Vlastní skladba', volume: 0.9, start: info.musicStart ?? 0, custom: !track} : null;
	p.look.muteVoice = true;
	p.look.hook = {visual: 'none', sfx: false, text: ''};
	p.look.zoomStyle = setup.zoom === 'none' ? 'none' : setup.zoom || 'creep';
	p.captions.enabled = false;
	const fps = p.source.fps;
	const shots = [];
	let f = 0;
	for (const c of p.clips.filter((c) => c.enabled)) {
		shots.push(f / fps);
		f += Math.max(1, Math.round(c.out * fps) - Math.round(c.in * fps));
	}
	say(job, 'AI navrhuje popisky přes záběry (jen z toho, co jsi napsal)');
	try {
		p.plan = await planMontage({brief: ans.brief ?? '', typeLabel: vtype?.label ?? 'Montáž záběrů', duration: f / fps, shots, prefs: prefsText()}, CONFIG);
		if (p.plan.summary) say(job, `AI: ${p.plan.summary}`);
	} catch (e) {
		say(job, `Popisky se nepovedly (${e.message}) – video je hotové i bez nich`);
	}
	await writeJson(path.join(dir, 'project.json'), p);
}

async function processProject(id) {
	const job = newJob(id, 'process');
	activeJob.set(id, job);
	const dir = pdir(id);
	await setMeta(id, {status: 'processing', jobId: job.id});
	const stage = (a, b) => (p, msg) => {
		job.progress = a + (b - a) * p;
		if (msg) job.step = msg;
	};
	(async () => {
		try {
			const a00 = (await readJson(path.join(dir, 'meta.json'))).answers ?? {};
			const vtype = typeOf(a00);
			// odkaz: rozbor stylu vzoru běží souběžně se zpracováním videa
			const refP = a00.refUrl
				? learnReference(a00.refUrl, '', (line) => line && say(job, line)).catch((e) => {
						say(job, `Rozbor odkazu se nepovedl (${e.message.slice(0, 120)}) – stříhám podle výchozího stylu`);
						return null;
					})
				: null;
			say(job, 'Převádím video a zvuk');
			await runPython(['ingest', dir], stage(0, 0.1));
			if (vtype?.speech === false || a00.cutMode === 'montage') {
				await processMontage(id, job, vtype, refP, stage);
				say(job, 'Skládám náhled');
				await renderBase(id, 'preview', stage(0.9, 1));
				await saveVersion(id, await readJson(path.join(dir, 'project.json')), 'Původní střih od AI');
				const mm = await readJson(path.join(dir, 'meta.json'));
				await setMeta(id, {status: 'ready', answers: {...(mm.answers ?? {}), ...(mm.answers?.autoRun ? {done: true} : {})}});
				job.progress = 1;
				job.status = 'done';
				say(job, 'Hotovo');
				return;
			}
			say(job, 'Přepisuji řeč (Whisper, čeština)');
			await runPython(['transcribe', dir], stage(0.1, 0.6));
			say(job, 'AI kontroluje přepis – diakritika a zkomolená slova');
			try {
				const words = await readJson(path.join(dir, 'words.json'));
				const m0 = await readJson(path.join(dir, 'meta.json'));
				const {words: fixed, changes} = await fixTranscript(words, CONFIG, (p) => (job.progress = 0.6 + 0.06 * p), m0.answers?.script ?? '');
				await writeJson(path.join(dir, 'words_fixed.json'), fixed);
				say(job, changes.length ? `AI opravila ${changes.length} slov (např. ${changes.slice(0, 3).map((c) => `„${c.from}“ → „${c.to}“`).join(', ')})` : 'Přepis je v pořádku');
			} catch (e) {
				say(job, `Kontrola přepisu se nepovedla (${e.message}), jedu s přepisem z Whisperu`);
			}
			await runPython(['units', dir], stage(0.66, 0.67));
			const units = await readJson(path.join(dir, 'units.json'));
			const meta = await readJson(path.join(dir, 'meta.json'));
			const ans = meta.answers ?? {};
			const cutMode = ans.cutMode ?? 'full';
			await fsp.rm(path.join(dir, 'selection.json'), {force: true});
			if (cutMode === 'full') {
				say(job, `Rozdělil jsem řeč na ${units.length} vět a pokusů. AI vybírá poslední povedené verze…`);
				try {
					const raw = await selectTakes(units, CONFIG, {maxLength: ans.setup?.maxLength ?? ans.maxLength ?? null, script: ans.script ?? '', brief: ans.brief ?? ''});
					const {sel: s1, dropped} = dedupeSelection(units, raw);
					const {sel, added} = attachHeads(units, s1);
					await writeJson(path.join(dir, 'selection.json'), sel);
					say(job, `AI: ${sel.summary}`);
					if (dropped.length) say(job, `Kontrola: vyhodil jsem ${dropped.length} zdvojených / nedokončených vět`);
					if (added.length) say(job, `Kontrola: doplnil jsem ${added.length} začátků vět, které by jinak chyběly`);
				} catch (e) {
					say(job, `AI výběr vět se nepovedl (${e.message}), přeřeknutí hledám jednodušší metodou`);
				}
			} else say(job, cutMode === 'none' ? 'Video je už sestříhané – nic nevystřihuji, nechávám ho, jak je' : 'Natočeno po kouscích – nechávám všechny věty, jen zkracuji pauzy');
			job.progress = 0.72;
			// styl z odkazu: počkat na rozbor vzoru a převzít jeho tempo, titulky, grafiku, hudbu
			if (refP) {
				const r = await refP;
				if (r?.styleId) {
					await applyRefStyle(id, r.styleId);
					say(job, `Stříhám ve stylu „${r.name}“`);
				}
			}
			say(job, 'Zpřesňuji časy slov u vybraných vět');
			await runPython(['retime', dir], stage(0.72, 0.8));
			const m2 = await readJson(path.join(dir, 'meta.json'));
			const a2 = m2.answers ?? {};
			const st = await lookFor(a2.preset ?? defaultPreset(a2), a2);
			const tempo = a2.setup?.tempo ?? st.look.tempo;
			await setMeta(id, {options: {...m2.options, ...(TEMPO[tempo] ?? TEMPO.normal), cutMode: a2.cutMode ?? 'full', order: a2.order ?? null}});
			say(job, a2.cutMode === 'none' ? 'Skládám klipy v pořadí, jak jsi je nahrál' : 'Stříhám přesně podle zvuku – bez useknutých slov a bez pauz');
			await runPython(['cut', dir], stage(0.8, 0.82));
			if ((a2.cutMode ?? 'full') === 'full') await cleanPass(id, job);
			say(job, 'Hledám obličej pro výřez');
			await runPython(['faces', dir], stage(0.82, 0.86));
			await assemble(id, {keepLook: false});
			say(job, 'AI promýšlí střih: nadpis, klíčová slova, textové karty a otázky pro tebe');
			job.progress = 0.87;
			try {
				await makePlan(id, job);
			} catch (e) {
				say(job, `AI plán se nepovedl (${e.message}) – střih je hotový i bez karet`);
			}
			say(job, 'Skládám náhled');
			await renderBase(id, 'preview', stage(0.9, 1));
			const p = await readJson(path.join(dir, 'project.json'));
			await saveVersion(id, p, 'Původní střih od AI');
			const mf = await readJson(path.join(dir, 'meta.json'));
			// rychlý režim: bez průvodce rovnou do editoru
			await setMeta(id, {status: 'ready', answers: {...(mf.answers ?? {}), ...(mf.answers?.autoRun ? {done: true} : {})}});
			job.progress = 1;
			job.status = 'done';
			say(job, 'Hotovo');
		} catch (e) {
			console.error(e);
			job.status = 'error';
			job.error = e.message;
			await setMeta(id, {status: 'error', error: e.message});
		} finally {
			activeJob.delete(id);
		}
	})();
	return job;
}

// změna, která potřebuje nový výběr vět / nový střih / nový AI plán / nový náhled
async function applyChange(id, {reselect = false, recut = false, replan = false}) {
	const job = newJob(id, 'apply');
	activeJob.set(id, job);
	const dir = pdir(id);
	(async () => {
		try {
			let p = await readJson(path.join(dir, 'project.json'));
			const m0 = await readJson(path.join(dir, 'meta.json'));
			// „už je to sestříhané“ / zamčený střih: věty se znovu nevybírají
			if (p.look.lockCut || (m0.options?.cutMode ?? 'full') !== 'full') reselect = false;
			if (reselect) {
				say(job, p.look.maxLength ? `AI vybírá věty, aby se video vešlo do ${p.look.maxLength} s` : 'AI znovu vybírá věty');
				const units = await readJson(path.join(dir, 'units.json'));
				const old = await readJson(path.join(dir, 'selection.json'));
				const raw = await selectTakes(units, CONFIG, {maxLength: p.look.maxLength, first: old?.first ?? null, script: m0.answers?.script ?? '', brief: m0.answers?.brief ?? ''});
				const {sel} = attachHeads(units, dedupeSelection(units, raw).sel);
				await writeJson(path.join(dir, 'selection.json'), sel);
				say(job, `AI: ${sel.summary}`);
				job.progress = 0.3;
				recut = true;
				replan = true;
			}
			if (recut) {
				say(job, 'Stříhám podle zvuku');
				const meta = await readJson(path.join(dir, 'meta.json'));
				await setMeta(id, {options: {...meta.options, ...(TEMPO[p.look.tempo] ?? TEMPO.normal)}});
				await runPython(['retime', dir]);
				await runPython(['cut', dir]);
				if (reselect) await cleanPass(id, job);
				await runPython(['faces', dir]);
				p = await assemble(id, {keepLook: true});
				job.progress = 0.5;
			}
			if (replan) {
				say(job, 'AI přepočítává karty a klíčová slova');
				try {
					p = await makePlan(id, job);
				} catch (e) {
					say(job, `AI plán se nepovedl (${e.message})`);
				}
			}
			if (keyOf(p) !== p.base.key) {
				say(job, 'Skládám náhled');
				await renderBase(id, 'preview', (x) => (job.progress = 0.6 + 0.4 * x));
			}
			job.progress = 1;
			job.status = 'done';
			say(job, 'Hotovo');
		} catch (e) {
			console.error(e);
			job.status = 'error';
			job.error = e.message;
		} finally {
			activeJob.delete(id);
		}
	})();
	return job;
}

// ------------------------------------------------------------ verze
async function saveVersion(id, project, label) {
	const vdir = path.join(pdir(id), 'versions');
	await fsp.mkdir(vdir, {recursive: true});
	const v = {id: Date.now().toString(36), label: label || 'Verze', createdAt: new Date().toISOString()};
	await writeJson(path.join(vdir, `${v.id}.json`), {...v, project});
	return v;
}

// ------------------------------------------------------------ export
const PRESETS = {
	reels: {label: 'Instagram Reels', format: '9:16', bitrate: '16M', suffix: 'reels'},
	tiktok: {label: 'TikTok', format: '9:16', bitrate: '16M', suffix: 'tiktok'},
	shorts: {label: 'YouTube Shorts', format: '9:16', bitrate: '16M', suffix: 'shorts'},
	youtube: {label: 'YouTube 16:9', format: '16:9', bitrate: '20M', suffix: 'youtube'},
};
let bundlePromise = null;
const getBundle = async () => {
	if (!bundlePromise) {
		const {bundle} = await import('@remotion/bundler');
		bundlePromise = bundle({entryPoint: path.join(ROOT, 'src', 'remotion', 'index.ts'), publicDir: path.join(ROOT, 'public')}).catch((e) => {
			bundlePromise = null;
			throw e;
		});
	}
	return bundlePromise;
};

const ffmpeg = (args) =>
	new Promise((resolve, reject) => {
		const p = spawn(CONFIG.ffmpeg, args);
		let err = '';
		p.stderr.on('data', (d) => (err += d));
		p.on('close', (c) => (c === 0 ? resolve(err) : reject(new Error(err.slice(-1500)))));
	});

async function exportProject(id, presetKey) {
	const preset = PRESETS[presetKey];
	const job = newJob(id, 'export');
	const dir = pdir(id);
	(async () => {
		try {
			let project = await readJson(path.join(dir, 'project.json'));
			if (preset.format !== project.format) {
				project.format = preset.format;
				await writeJson(path.join(dir, 'project.json'), project);
			}
			say(job, 'Skládám video v plné kvalitě');
			project = await renderBase(id, 'full', (x) => (job.progress = 0.3 * x));
			say(job, 'Připravuji render titulků a grafiky');
			const serveUrl = await getBundle();
			const {selectComposition, renderMedia} = await import('@remotion/renderer');
			const inputProps = {project, mediaBase: `http://localhost:${CONFIG.port}/media/${id}/`, quality: 'full'};
			const composition = await selectComposition({serveUrl, id: 'Edit', inputProps, timeoutInMilliseconds: 180000});
			const raw = path.join(dir, 'render_raw.mp4');
			say(job, 'Renderuji');
			await renderMedia({
				composition,
				serveUrl,
				codec: 'h264',
				outputLocation: raw,
				inputProps,
				concurrency: 2,
				timeoutInMilliseconds: 180000,
				videoBitrate: preset.bitrate,
				audioBitrate: '320k',
				onProgress: ({progress}) => (job.progress = 0.3 + 0.62 * progress),
			});
			say(job, 'Hlasitost na −14 LUFS');
			job.progress = 0.94;
			const m = (await ffmpeg(['-hide_banner', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])).match(/\{[\s\S]*\}/);
			const ln = JSON.parse(m[0]);
			const outDir = CONFIG.exportDir || path.join(dir, 'exports');
			await fsp.mkdir(outDir, {recursive: true});
			const safe = project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '');
			let out = path.join(outDir, `${safe}_${preset.suffix}.mp4`);
			for (let n = 2; fs.existsSync(out); n++) out = path.join(outDir, `${safe}_${preset.suffix}_${n}.mp4`);
			await ffmpeg([
				'-v', 'error', '-y', '-i', raw, '-c:v', 'copy', '-af',
				`loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${ln.input_i}:measured_TP=${ln.input_tp}:measured_LRA=${ln.input_lra}:measured_thresh=${ln.input_thresh}:offset=${ln.target_offset}:linear=true`,
				'-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', out,
			]);
			await fsp.rm(raw, {force: true});
			job.result = {file: out};
			job.progress = 1;
			job.status = 'done';
			say(job, 'Hotovo');
		} catch (e) {
			console.error(e);
			job.status = 'error';
			job.error = e.message;
		}
	})();
	return job;
}

// ------------------------------------------------------------ HTTP
export async function createApp({dev = true} = {}) {
	const app = express();
	app.use(express.json({limit: '50mb'}));
	const upload = multer({
		storage: multer.diskStorage({
			destination: (req, file, cb) => {
				// víc souborů v jednom požadavku = jeden projekt (id se vytvoří u prvního souboru)
				const id = req.params.id ?? req.projectId ?? `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;
				req.projectId = id;
				fs.mkdirSync(pdir(id), {recursive: true});
				cb(null, pdir(id));
			},
			filename: (req, file, cb) => {
			const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
			if (file.fieldname === 'music') return cb(null, `music_${Date.now().toString(36)}${ext}`);
			req.nFiles = (req.nFiles ?? 0) + 1;
			cb(null, `source_${String(req.nFiles).padStart(2, '0')}${ext}`);
		},
		}),
	});
	// prohlížeč posílá název v UTF-8, multer ho čte jako latin1
	const decodeName = (n) => {
		const utf = Buffer.from(n, 'latin1').toString('utf-8');
		return utf.includes('�') ? n : utf;
	};

	app.use('/media', express.static(PROJECTS, {acceptRanges: true}));

	app.get('/api/status', async (req, res) => res.json({claude: Boolean(findClaude(CONFIG)), cpus: os.cpus().length}));

	app.get('/api/styles', async (req, res) => {
		const files = (await fsp.readdir(STYLES)).filter((f) => f.endsWith('.json'));
		const list = await Promise.all(files.map((f) => readJson(path.join(STYLES, f))));
		res.json(list.filter(Boolean).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
	});

	app.get('/api/projects', async (req, res) => {
		const ids = (await fsp.readdir(PROJECTS, {withFileTypes: true})).filter((d) => d.isDirectory()).map((d) => d.name);
		const list = (await Promise.all(ids.map((id) => readJson(path.join(PROJECTS, id, 'meta.json'))))).filter(Boolean);
		res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
	});

	// nahrání jednoho nebo víc klipů (v pořadí, jak je autor seřadil) – spojí se za sebe
	app.post('/api/projects', upload.array('files', 40), async (req, res) => {
		const id = req.projectId;
		const answers = JSON.parse(req.body.answers || '{}');
		const files = req.files ?? [];
		if (!files.length) return res.status(400).json({error: 'Žádné video'});
		const sources = files.map((f) => ({file: f.filename, name: decodeName(f.originalname)}));
		const name = (req.body.name || '').trim() || path.parse(sources[0].name).name + (sources.length > 1 ? ` (+${sources.length - 1})` : '');
		const clientId = req.body.clientId && /^[a-z0-9-]+$/i.test(req.body.clientId) ? req.body.clientId : null;
		// typ videa (produkt, nemovitost, podcast…) -> jeho přednastavení
		const vt = typeOf(answers);
		if (vt) {
			answers.typeSetup = vt.setup ?? {};
			if (!answers.setup) answers.setup = withDefaults(vt.setup ?? {}, answers.platform);
			if (vt.speech === false) answers.cutMode = 'montage';
		}
		// nové video klienta začíná s jeho uloženým stylem
		if (clientId && !answers.setup) {
			const c = await readJson(path.join(CLIENTS, `${clientId}.json`));
			if (c?.setup) answers.setup = c.setup;
			if (c?.preset && !answers.preset) answers.preset = c.preset;
		}
		await writeJson(path.join(pdir(id), 'meta.json'), {id, name, clientId, createdAt: new Date().toISOString(), sourceFile: sources[0].file, sources, options: {}, answers, status: 'queued'});
		const job = await processProject(id);
		res.json({id, jobId: job.id});
	});

	// ---------------- klienti: každý má uložený styl střihu (setup), nová videa ho převezmou
	const clientFile = (id) => {
		if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('špatné id');
		return path.join(CLIENTS, `${id}.json`);
	};
	app.get('/api/clients', async (req, res) => {
		const list = (await Promise.all((await fsp.readdir(CLIENTS)).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(CLIENTS, f))))).filter(Boolean);
		const metas = (await Promise.all((await fsp.readdir(PROJECTS, {withFileTypes: true})).filter((d) => d.isDirectory()).map((d) => readJson(path.join(PROJECTS, d.name, 'meta.json'))))).filter(Boolean);
		res.json(list.map((c) => ({...c, videos: metas.filter((m) => m.clientId === c.id).length})).sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)));
	});
	app.post('/api/clients', async (req, res) => {
		const name = String(req.body.name ?? '').trim() || 'Nový klient';
		const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'klient';
		let id = slug;
		for (let n = 2; fs.existsSync(clientFile(id)); n++) id = `${slug}-${n}`;
		const c = {id, name, note: req.body.note ?? '', platform: req.body.platform ?? 'reels', format: req.body.format ?? '9:16', setup: withDefaults(req.body.setup, req.body.platform), createdAt: new Date().toISOString()};
		await writeJson(clientFile(id), c);
		res.json(c);
	});
	app.get('/api/clients/:id', async (req, res) => {
		const c = await readJson(clientFile(req.params.id));
		if (!c) return res.status(404).json({error: 'Klient nenalezen'});
		res.json(c);
	});
	app.put('/api/clients/:id', async (req, res) => {
		const c = await readJson(clientFile(req.params.id));
		if (!c) return res.status(404).json({error: 'Klient nenalezen'});
		const n = {...c, ...req.body, id: c.id, updatedAt: new Date().toISOString()};
		await writeJson(clientFile(c.id), n);
		res.json(n);
	});
	app.delete('/api/clients/:id', async (req, res) => {
		await fsp.rm(clientFile(req.params.id), {force: true});
		res.json({ok: true});
	});

	// ---------------- průvodce: nastavení střihu je hotové -> přepočítat vzhled, střih a AI plán
	app.post('/api/projects/:id/setup', async (req, res) => {
		const id = req.params.id;
		if (activeJob.get(id)) return res.json(activeJob.get(id));
		const dir = pdir(id);
		const meta = await readJson(path.join(dir, 'meta.json'));
		const ans = {...(meta.answers ?? {}), ...(req.body.answers ?? {}), done: true};
		const setup = withDefaults(ans.setup, ans.platform);
		ans.setup = setup;
		await setMeta(id, {answers: ans});
		const cur = await readJson(path.join(dir, 'project.json'));
		const next = applySetup(cur.look, cur.captions, setup);
		const cutMode = ans.cutMode ?? 'full';
		let recut = next.look.tempo !== cur.look.tempo || JSON.stringify(ans.order ?? null) !== JSON.stringify(meta.options?.order ?? null) || cutMode !== (meta.options?.cutMode ?? 'full');
		let reselect = (next.look.maxLength ?? null) !== (cur.look.maxLength ?? null) || (cutMode === 'full' && (meta.options?.cutMode ?? 'full') !== 'full');
		if (cutMode !== 'full') reselect = false;
		// odpovědi na otázky AI: čím začít (věta na začátek), vlastní nadpis
		if (req.body.answers?.first) {
			const sel = (await readJson(path.join(dir, 'selection.json'))) ?? {keep: cur.units.filter((u) => u.keep).map((u) => u.id), reasons: {}};
			sel.first = req.body.answers.first;
			await writeJson(path.join(dir, 'selection.json'), sel);
			recut = true;
		}
		const plan = req.body.answers?.title ? {...cur.plan, title: req.body.answers.title} : cur.plan;
		await writeJson(path.join(dir, 'project.json'), {...cur, ...next, plan, look: {...next.look, music: cur.look.music}});
		await setMeta(id, {options: {...meta.options, order: ans.order ?? null, cutMode}});
		const planned = meta.planSetup === JSON.stringify(setup) && meta.planBrief === (ans.brief ?? '');
		res.json(await applyChange(id, {reselect, recut, replan: !planned || reselect}));
	});

	// ---------------- AI pomocník v průvodci: odpovídá A ZÁROVEŇ mění výběr (co napíšeš, to platí)
	const transcriptOf = async (dir) => {
		const words = (await readJson(path.join(dir, 'words_fixed.json'))) ?? (await readJson(path.join(dir, 'words.json')));
		return words ? words.map((w) => w.text).join(' ') : '';
	};
	app.post('/api/projects/:id/assist', async (req, res) => {
		try {
			const dir = pdir(req.params.id);
			const meta = await readJson(path.join(dir, 'meta.json'));
			const r = await assist({meta, transcript: await transcriptOf(dir), messages: req.body.messages ?? [], setup: req.body.setup, step: req.body.step, music: MUSIC_LIB()}, CONFIG);
			const chat = [...(req.body.messages ?? []), {role: 'ai', text: r.reply, previews: r.previews}];
			await setMeta(req.params.id, {answers: {...(meta.answers ?? {}), chat, brief: r.brief || meta.answers?.brief || ''}});
			res.json(r);
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});
	// styl klienta: stejný pomocník, bez videa
	app.post('/api/assist', async (req, res) => {
		try {
			res.json(await assist({meta: {name: req.body.name ?? 'klient', answers: {}}, transcript: '', messages: req.body.messages ?? [], setup: req.body.setup, step: req.body.step, music: MUSIC_LIB()}, CONFIG));
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});
	app.post('/api/projects/:id/hooks', async (req, res) => {
		try {
			const dir = pdir(req.params.id);
			const meta = await readJson(path.join(dir, 'meta.json'));
			res.json(await suggestHooks({transcript: await transcriptOf(dir), script: meta.answers?.script ?? '', brief: meta.answers?.brief ?? ''}, CONFIG));
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});
	// grafika ze šablony vyplněná obsahem toho, co se ve videu zrovna říká
	app.post('/api/projects/:id/gfxfill', async (req, res) => {
		try {
			const p = await readJson(path.join(pdir(req.params.id), 'project.json'));
			const {words} = outWords(p);
			const at = Number(req.body.time) || 0;
			const near = words.filter((w) => w.start >= at - 4 && w.start <= at + 8).map((w) => w.text).join(' ');
			const r = await fillGfx({type: req.body.type, near, all: words.map((w) => w.text).join(' ').slice(0, 3000), prev: req.body.prev ?? null, idea: req.body.idea ?? ''}, CONFIG);
			const times = itemTimes(r.gfx, at, words);
			if (times) r.gfx.times = times;
			res.json({...r, dur: times ? Math.min(times[times.length - 1] + 1.4, 9) : null});
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});
	// vlastní zvukový efekt autora -> knihovna (public/sfx), vyrovnaná hlasitost, použitelný ve všech videích
	const sfxUpload = multer({dest: path.join(os.tmpdir(), 'goatcut-sfx')});
	app.post('/api/sfx', sfxUpload.single('sfx'), async (req, res) => {
		try {
			const name = decodeName(req.file.originalname).replace(/\.[^.]+$/, '');
			const id = `user_${Date.now().toString(36)}`;
			const out = path.join(ROOT, 'public', 'sfx', `${id}.mp3`);
			await ffmpeg(['-v', 'error', '-y', '-i', req.file.path, '-t', '12', '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-ar', '48000', '-ac', '2', '-b:a', '192k', out]);
			await fsp.rm(req.file.path, {force: true});
			const lf = path.join(ROOT, 'public', 'sfx', 'library.json');
			const lib = (await readJson(lf, [])) ?? [];
			const item = {id, file: `sfx/${id}.mp3`, cat: String(req.body.cat || 'whoosh'), name, own: true};
			lib.push(item);
			await writeJson(lf, lib);
			res.json(item);
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});

	// emoji k titulkům (AI) – uloží se do plan.emojis a zapne se zobrazení
	app.post('/api/projects/:id/emoji', async (req, res) => {
		try {
			const f = path.join(pdir(req.params.id), 'project.json');
			const p = await readJson(f);
			p.plan.emojis = await pickEmojis(outWords(p).words, CONFIG);
			p.captions.emoji = true;
			await writeJson(f, p);
			res.json({count: Object.keys(p.plan.emojis).length});
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});

	// načasovat položky grafiky podle řeči (všechny beaty, nebo jeden)
	app.post('/api/projects/:id/sync', async (req, res) => {
		const f = path.join(pdir(req.params.id), 'project.json');
		const p = await readJson(f);
		const {words} = outWords(p);
		const only = req.body.beatId;
		syncBeats((p.plan.beats ?? []).filter((b) => !only || b.id === only), words);
		await writeJson(f, p);
		res.json({ok: true});
	});

	// ---------------- můj styl (preference napříč videi)
	app.get('/api/prefs', (req, res) => res.json(readPrefs()));
	app.put('/api/prefs', (req, res) => {
		writePrefs({...readPrefs(), ...req.body});
		res.json(readPrefs());
	});
	// styl (např. naučený z odkazu) -> nastavení průvodce
	app.get('/api/styles/:id/setup', async (req, res) => {
		const st = await readJson(path.join(STYLES, `${req.params.id.replace(/[^a-z0-9-]/gi, '')}.json`));
		if (!st) return res.status(404).json({error: 'Styl nenalezen'});
		res.json(styleToSetup(st));
	});

	// ---------------- B-roll: hledání záběrů a výměna / přidání záběru na místo
	app.post('/api/projects/:id/broll-search', async (req, res) => {
		const q = String(req.body.query ?? '').trim();
		res.json(q ? searchMixkit(q) : []);
	});
	app.post('/api/projects/:id/broll-set', async (req, res) => {
		const id = req.params.id;
		if (activeJob.get(id)) return res.status(409).json({error: 'Ještě dokončuji předchozí změnu'});
		try {
			const dir = pdir(id);
			const p = await readJson(path.join(dir, 'project.json'));
			const {beatId, mixkit, title, wi, shift, dur, alts} = req.body;
			let b = beatId ? p.plan.beats.find((x) => x.id === beatId) : null;
			if (!b) {
				b = {id: `r${Date.now().toString(36)}`, wi, shift: shift ?? 0, dur: dur ?? 1.8, kind: 'broll', broll: {query: title ?? ''}, why: 'přidáno ručně'};
				p.plan.beats.push(b);
			}
			const old = b.broll?.mixkit ? {id: b.broll.mixkit, title: b.broll.title} : null;
			b.broll = {...b.broll, mixkit: String(mixkit), title, ready: false, alts: [...(alts ?? b.broll?.alts ?? []).filter((x) => x.id !== String(mixkit)), ...(old && old.id !== String(mixkit) ? [old] : [])].slice(0, 10)};
			if (dur) b.dur = dur;
			await writeJson(path.join(dir, 'project.json'), p);
			await runPython(['broll', dir]);
			res.json({ok: true, beatId: b.id});
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});

	// AI lišta v editoru: „udělej titulky větší“, „dej tam víc B-rollu“, „už je to sestříhané, nech to“…
	app.post('/api/projects/:id/command', async (req, res) => {
		const id = req.params.id;
		if (activeJob.get(id)) return res.status(409).json({error: 'Ještě dokončuji předchozí změnu'});
		try {
			const dir = pdir(id);
			const p = await readJson(path.join(dir, 'project.json'));
			const meta = await readJson(path.join(dir, 'meta.json'));
			const {words} = outWords(p);
			const r = await command({project: p, words, meta, text: req.body.text, history: req.body.history ?? [], time: req.body.time ?? 0}, CONFIG);
			const o = r.ops ?? {};
			let reselect = false;
			let recut = false;
			let replan = false;
			if (o.look) {
				for (const k of ['accent', 'sfx', 'zoomStyle', 'layout', 'grade']) if (o.look[k]) p.look[k] = o.look[k];
				if (o.look.zoomStyle) {
					p.look.zoom = o.look.zoomStyle !== 'none';
					p.look.jump = o.look.zoomStyle === 'jump' ? 'punch' : 'hard';
				}
				if (o.look.bg) p.look.theme = {...(p.look.theme ?? {font: 'Inter Tight', serif: 'DM Serif Display'}), bg: o.look.bg};
				if (o.look.font) p.look.theme = {...(p.look.theme ?? {bg: 'dark', serif: 'DM Serif Display'}), font: o.look.font};
				if (o.look.accent) p.look.theme = {...(p.look.theme ?? {bg: 'dark', font: 'Inter Tight', serif: 'DM Serif Display'}), brand: o.look.accent};
				if (o.look.tempo && o.look.tempo !== p.look.tempo && !p.look.lockCut) {
					p.look.tempo = o.look.tempo;
					recut = true;
				}
				if (o.look.maxLength !== undefined && o.look.maxLength !== null && o.look.maxLength !== p.look.maxLength) {
					p.look.maxLength = o.look.maxLength || null;
					reselect = true;
				}
			}
			if (o.captions) p.captions = {...p.captions, ...Object.fromEntries(Object.entries(o.captions).filter(([, v]) => v !== null && v !== ''))};
			if (o.hook) p.look.hook = {...(p.look.hook ?? {visual: 'none', sfx: false, text: ''}), ...Object.fromEntries(Object.entries(o.hook).filter(([, v]) => v !== null))};
			if (o.music) {
				const lib = MUSIC_LIB();
				if (o.music.mode === 'off') p.look.music = null;
				else if (o.music.mood) {
					const pool = lib.filter((m) => m.cat === o.music.mood);
					const cur = pool.findIndex((m) => m.file === p.look.music?.file);
					const pick = pool[(cur + 1) % pool.length] ?? lib[0];
					p.look.music = {file: pick.file, name: `${pick.name} (Mixkit, ${pick.cat})`, volume: p.look.music?.volume ?? 0.5};
				}
				if (o.music.volume) p.look.music && (p.look.music.volume = o.music.volume);
			}
			const beats = p.plan.beats ?? [];
			if (o.removeBeats?.length) p.plan.beats = beats.filter((b) => !o.removeBeats.includes(b.id));
			for (const u of o.updateBeats ?? []) {
				const b = p.plan.beats.find((x) => x.id === u.id);
				if (!b) continue;
				if (u.dur) b.dur = Math.min(Math.max(u.dur, 0.6), 6);
				if (u.layout) b.layout = u.layout;
				if (u.gfx) b.gfx = u.gfx;
				if (u.chip) b.chip = u.chip;
			}
			const valid = new Set(words.map((w) => w.wi));
			for (const a of o.addBeats ?? []) {
				if (!valid.has(a.wi) || (a.kind === 'gfx' && !a.gfx)) continue;
				p.plan.beats.push({id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, wi: a.wi, dur: Math.min(Math.max(a.dur || 2.4, 0.8), 5), kind: a.kind, layout: a.layout ?? (['versus', 'side', 'pill', 'lowerthird', 'counter', 'marquee'].includes(a.gfx?.type) ? 'overlay' : 'full'), gfx: a.gfx, chip: a.chip, why: 'přidáno podle tvého pokynu'});
			}
			if (o.lockCut !== undefined && o.lockCut !== null) p.look.lockCut = Boolean(o.lockCut);
			if (o.remember && (o.remember.like || o.remember.dislike)) remember(o.remember);
			const opts = {...meta.options};
			if (o.cutMode && o.cutMode !== (opts.cutMode ?? 'full')) {
				opts.cutMode = o.cutMode;
				recut = true;
				if (o.cutMode === 'none') p.look.lockCut = true;
			}
			if (o.order?.length) {
				opts.order = o.order;
				recut = true;
			}
			if (o.replan) {
				replan = true;
				await setMeta(id, {answers: {...(meta.answers ?? {}), brief: `${meta.answers?.brief ?? ''}\nÚprava od autora: ${req.body.text}`.trim()}});
			}
			await setMeta(id, {options: opts});
			if (o.addBeats?.length || o.updateBeats?.length) syncBeats(p.plan.beats, words);
			await writeJson(path.join(dir, 'project.json'), p);
			const needJob = reselect || recut || replan || keyOf(p) !== p.base.key;
			res.json({reply: r.reply, seek: o.seek ?? null, job: needJob ? await applyChange(id, {reselect, recut, replan}) : null});
		} catch (e) {
			console.error(e);
			res.status(500).json({error: e.message});
		}
	});

	app.get('/api/projects/:id', async (req, res) => {
		const dir = pdir(req.params.id);
		const meta = await readJson(path.join(dir, 'meta.json'));
		if (!meta) return res.status(404).json({error: 'Projekt nenalezen'});
		const job = activeJob.get(req.params.id) ?? (meta.jobId ? jobs.get(meta.jobId) : null) ?? null;
		res.json({meta, project: meta.status === 'ready' ? await readJson(path.join(dir, 'project.json')) : null, job});
	});

	// odpovědi z průvodce (můžou přijít i během zpracování)
	app.put('/api/projects/:id/answers', async (req, res) => {
		const meta = await readJson(path.join(pdir(req.params.id), 'meta.json'));
		meta.answers = {...(meta.answers ?? {}), ...req.body};
		await writeJson(path.join(pdir(req.params.id), 'meta.json'), meta);
		res.json(meta.answers);
	});

	// ruční úpravy (titulky, karty, vzhled, který nemění střih)
	app.put('/api/projects/:id/project', async (req, res) => {
		const f = path.join(pdir(req.params.id), 'project.json');
		learnFromEdit(await readJson(f), req.body); // co autor maže / přidává -> preference
		await writeJson(f, req.body);
		res.json({ok: true, needsBase: keyOf(req.body) !== req.body.base?.key});
	});

	// změny, které vyžadují AI / nový střih / nový náhled
	app.post('/api/projects/:id/apply', async (req, res) => {
		const id = req.params.id;
		if (activeJob.get(id)) return res.json(activeJob.get(id));
		const dir = pdir(id);
		const {project, units, first, preset} = req.body;
		let reselect = false;
		let recut = false;
		let replan = Boolean(req.body.replan);
		const cur = await readJson(path.join(dir, 'project.json'));
		let p = cur;
		if (project) {
			if (project.look.maxLength !== cur.look.maxLength) reselect = true;
			if (project.look.tempo !== cur.look.tempo && !cur.look.lockCut) recut = true;
			if (cur.look.lockCut && project.look.maxLength !== cur.look.maxLength) reselect = false;
			p = project;
		}
		if (preset && preset !== cur.look.preset) {
			const def = await lookFor(preset, {});
			if (def.look.tempo !== p.look.tempo) recut = true;
			p = {...p, styleId: preset, captions: def.captions, look: {...def.look, music: p.look.music, maxLength: p.look.maxLength}};
			replan = true;
		}
		await writeJson(path.join(dir, 'project.json'), p);
		if (units || first !== undefined) {
			const sel = (await readJson(path.join(dir, 'selection.json'))) ?? {keep: cur.units.filter((u) => u.keep).map((u) => u.id), reasons: {}};
			sel.reasons = sel.reasons ?? {};
			for (const [uid, keep] of Object.entries(units ?? {})) {
				sel.keep = sel.keep.filter((k) => k !== uid);
				if (keep) {
					sel.keep.push(uid);
					delete sel.reasons[uid];
				} else sel.reasons[uid] = 'vystřiženo ručně';
			}
			if (first !== undefined) sel.first = first;
			await writeJson(path.join(dir, 'selection.json'), sel);
			recut = true;
		}
		res.json(await applyChange(id, {reselect, recut, replan}));
	});

	app.post('/api/projects/:id/music', upload.single('music'), async (req, res) => {
		const dir = pdir(req.params.id);
		const music = {file: req.file.filename, name: decodeName(req.file.originalname), volume: 0.35, custom: true};
		// v průvodci ještě projekt nemusí existovat – skladba se uloží do nastavení a použije se při plánu
		const p = await readJson(path.join(dir, 'project.json'));
		if (p) {
			p.look.music = music;
			await writeJson(path.join(dir, 'project.json'), p);
		}
		res.json({...(p ?? {}), music});
	});

	app.delete('/api/projects/:id', async (req, res) => {
		await fsp.rm(pdir(req.params.id), {recursive: true, force: true});
		res.json({ok: true});
	});

	app.get('/api/projects/:id/versions', async (req, res) => {
		const vdir = path.join(pdir(req.params.id), 'versions');
		const files = fs.existsSync(vdir) ? (await fsp.readdir(vdir)).filter((f) => f.endsWith('.json')) : [];
		const list = await Promise.all(
			files.map(async (f) => {
				const v = await readJson(path.join(vdir, f));
				return {id: v.id, label: v.label, createdAt: v.createdAt};
			}),
		);
		res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
	});
	app.post('/api/projects/:id/versions', async (req, res) => res.json(await saveVersion(req.params.id, req.body.project, req.body.label)));
	app.get('/api/projects/:id/versions/:v', async (req, res) => {
		if (!/^[a-z0-9]+$/.test(req.params.v)) return res.status(400).end();
		res.json(await readJson(path.join(pdir(req.params.id), 'versions', `${req.params.v}.json`)));
	});

	app.post('/api/projects/:id/export', async (req, res) => {
		if (!PRESETS[req.body.preset]) return res.status(400).json({error: 'Neznámý preset'});
		if (!fs.existsSync(path.join(pdir(req.params.id), 'project.json'))) return res.status(409).json({error: 'Projekt se ještě zpracovává'});
		res.json(await exportProject(req.params.id, req.body.preset));
	});


	// ---------------- chat s AI o kontextu videa (před střihem)
	const SYSTEM_CHAT = `Jsi AI střihač v aplikaci AIDIT. Autor ti nahrál video a ty se s ním bavíš o kontextu a o tom, jak si střih představuje
(pro koho video je, co je hlavní pointa, nálada, tempo, co určitě nechat/vystřihnout, hudba, inspirace).
Odpovídej česky, krátce (max 3 věty), přátelsky a věcně. Ptej se vždy jen na jednu věc. Když už víš dost, řekni to a v jedné větě shrň plán.
Když znáš přepis videa, opírej se o jeho obsah (zmiň konkrétní věci, které v něm říká).`;
	app.post('/api/projects/:id/chat', async (req, res) => {
		const dir = pdir(req.params.id);
		const meta = await readJson(path.join(dir, 'meta.json'));
		const words = (await readJson(path.join(dir, 'words_fixed.json'))) ?? (await readJson(path.join(dir, 'words.json')));
		const transcript = words ? words.map((w) => w.text).join(' ').slice(0, 6000) : '';
		const msgs = (req.body.messages ?? []).slice(-14);
		const prompt = `Video: ${meta.name} · formát ${meta.answers?.format ?? '9:16'} (${meta.answers?.platform === 'youtube' ? 'YouTube' : 'Reels/TikTok/Shorts'})
${transcript ? `Přepis videa (surový, s pokusy a přeřeknutími): ${transcript}` : 'Přepis ještě není hotový (video se právě přepisuje).'}

Konverzace:
${msgs.map((m) => `${m.role === 'user' ? 'AUTOR' : 'TY'}: ${m.text}`).join('\n')}
TY:`;
		try {
			res.json({reply: (await askClaude(CONFIG, prompt, SYSTEM_CHAT, {timeoutMs: 120000})).trim()});
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});
	// shrnutí chatu do zadání + doporučení nastavení
	app.post('/api/projects/:id/brief', async (req, res) => {
		const dir = pdir(req.params.id);
		const msgs = req.body.messages ?? [];
		const styles = (await Promise.all((await fsp.readdir(STYLES)).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(STYLES, f))))).filter(Boolean);
		const schema = {type: 'object', properties: {brief: {type: 'string'}, style: {type: 'string'}, tempo: {type: 'string', enum: ['calm', 'normal', 'fast', '']}, music: {type: 'string'}, maxLength: {type: 'integer'}}, required: ['brief', 'style', 'tempo', 'music', 'maxLength']};
		const prompt = `Konverzace autora se střihačem:\n${msgs.map((m) => `${m.role === 'user' ? 'AUTOR' : 'STŘIHAČ'}: ${m.text}`).join('\n')}\n\nDostupné styly: ${styles.map((s) => `${s.id} (${s.name}: ${s.description})`).join('; ')}\nHudba: auto, off, energetic, motivating, hiphop, lofi, chill, cinematic, dark, happy, corporate, emotional.\nShrň zadání pro střih do 2–4 vět (brief) a doporuč styl (id, nebo '' když nevíš), tempo ('' když nevíš), hudbu ('' když nevíš) a max. délku v s (0 = bez limitu).`;
		try {
			const r = await askClaude(CONFIG, prompt, 'Shrnuješ zadání pro střih videa. Česky, věcně.', {schema, timeoutMs: 120000});
			const meta = await readJson(path.join(dir, 'meta.json'));
			meta.answers = {...(meta.answers ?? {}), brief: r.brief};
			await writeJson(path.join(dir, 'meta.json'), meta);
			res.json(r);
		} catch (e) {
			res.status(500).json({error: e.message});
		}
	});

	// ---------------- „stříhej jako tohle“: odkaz -> rozbor -> nový styl (cizí video se po rozboru smaže)
	app.post('/api/reference', async (req, res) => {
		const url = String(req.body.url ?? '').trim();
		if (!/^https?:\/\//.test(url)) return res.status(400).json({error: 'Neplatný odkaz'});
		const job = newJob('ref', 'reference');
		res.json(job);
		try {
			const r = await learnReference(url, req.body.note ?? '', (line, prog) => {
				if (line) say(job, line);
				if (prog !== undefined) job.progress = prog;
			});
			job.result = r;
			job.progress = 1;
			job.status = 'done';
			say(job, `Hotovo – nový styl „${r.name}“`);
		} catch (e) {
			console.error(e);
			job.status = 'error';
			job.error = e.message;
		}
	});

	app.get('/api/jobs/:id', (req, res) => res.json(jobs.get(req.params.id) ?? {status: 'unknown'}));

	app.post('/api/reveal', async (req, res) => {
		const f = path.resolve(String(req.body.file || ''));
		const allowed = [path.resolve(CONFIG.exportDir || PROJECTS), PROJECTS].some((d) => f.startsWith(d));
		if (!allowed || !fs.existsSync(f)) return res.status(400).json({error: 'Soubor nenalezen'});
		spawn('explorer.exe', [`/select,${f}`], {detached: true});
		res.json({ok: true});
	});

	// znovu poskládat existující projekt bez nového přepisu (po aktualizaci aplikace)
	app.post('/api/projects/:id/rebuild', async (req, res) => {
		const id = req.params.id;
		const dir = pdir(id);
		const job = newJob(id, 'rebuild');
		activeJob.set(id, job);
		await setMeta(id, {jobId: job.id});
		res.json(job);
		try {
			const meta = await readJson(path.join(dir, 'meta.json'));
			const ans = {...(meta.answers ?? {}), ...(req.body ?? {})};
			await setMeta(id, {answers: ans});
			const st = await lookFor(ans.preset ?? defaultPreset(ans), ans);
			await setMeta(id, {options: {...meta.options, ...(TEMPO[st.look.tempo] ?? TEMPO.normal)}});
			say(job, 'Stříhám podle zvuku');
			await runPython(['cut', dir]);
			await runPython(['faces', dir]);
			await assemble(id, {keepLook: false});
			say(job, 'AI promýšlí střih');
			await makePlan(id, job).catch((e) => say(job, `AI plán se nepovedl (${e.message})`));
			say(job, 'Skládám náhled');
			await renderBase(id, 'preview', (x) => (job.progress = 0.6 + 0.4 * x));
			await setMeta(id, {status: 'ready'});
			job.status = 'done';
			job.progress = 1;
		} catch (e) {
			console.error(e);
			job.status = 'error';
			job.error = e.message;
		} finally {
			activeJob.delete(id);
		}
	});

	if (dev) {
		const {createServer} = await import('vite');
		const vite = await createServer({root: ROOT, server: {middlewareMode: true, allowedHosts: true}, appType: 'spa'});
		app.use(vite.middlewares);
	}
	return {app, CONFIG};
}
