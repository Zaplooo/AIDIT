import React from 'react';
import {api, MusicTrack, Prefs} from '../api';
import {CATALOG, defaultSetup, HookVisual, Setup, ZoomStyle} from '../setup';
import {Icon} from './Mocks';
import {FontCard, GfxCard, HookCard, PlayButton, SFX_LIB, ZoomCard} from './previews';

// Knihovna po stranách hlavní stránky – jen na prohlížení: motion grafika, fonty, hudba, zvukové efekty, zoomy, hooky.
const LEFT = [
	{k: 'gfx', l: 'Grafika', icon: 'card'},
	{k: 'fonts', l: 'Fonty', icon: 'font'},
	{k: 'music', l: 'Hudba', icon: 'music'},
	{k: 'sfx', l: 'Efekty', icon: 'sfx'},
] as const;

export const LibraryLeft: React.FC = () => {
	const [tab, setTab] = React.useState<(typeof LEFT)[number]['k']>('gfx');
	const [music, setMusic] = React.useState<MusicTrack[]>([]);
	const [mood, setMood] = React.useState('energetic');
	const setup: Setup = defaultSetup();
	React.useEffect(() => {
		api.musicLib().then(setMusic).catch(() => {});
	}, []);
	return (
		<aside className="lib">
			<div className="lib-head">
				<b>Knihovna</b>
				<span className="muted small">najeď myší = ukázka</span>
			</div>
			<div className="lib-tabs">
				{LEFT.map((t) => (
					<button key={t.k} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>
						<Icon name={t.icon} /> {t.l}
					</button>
				))}
			</div>
			<div className="lib-body">
				{tab === 'gfx' ? (
					<div className="lib-grid">
						{CATALOG.gfx.map((g) => (
							<GfxCard key={g.type} type={g.type} setup={setup} compact />
						))}
					</div>
				) : null}
				{tab === 'fonts' ? (
					<div className="lib-list">
						{CATALOG.fonts.map((f) => (
							<FontCard key={f.family} family={f.family} color={setup.color} />
						))}
					</div>
				) : null}
				{tab === 'music' ? (
					<>
						<div className="mood-chips small">
							{CATALOG.moods.map((m) => (
								<button key={m.id} className={'chip' + (mood === m.id ? ' on' : '')} onClick={() => setMood(m.id)}>
									{m.label}
								</button>
							))}
						</div>
						<div className="lib-list">
							{music
								.filter((t) => t.cat === mood)
								.map((t) => (
									<div key={t.id} className="track">
										<PlayButton src={'/' + t.file} />
										<span>{t.name}</span>
										<span className="muted small">{Math.round(t.duration)} s</span>
									</div>
								))}
						</div>
						<p className="muted small">{music.length} skladeb z Mixkitu, zdarma i komerčně. Ve videu se pod hlasem samy ztiší.</p>
					</>
				) : null}
				{tab === 'sfx' ? (
					<div className="lib-list">
						{SFX_LIB.map((s) => (
							<div key={s.cat} className="sfx-group">
								<b className="small">{s.label}</b>
								<div className="row" style={{gap: 6, flexWrap: 'wrap'}}>
									{s.files.map((f, i) => (
										<span key={f} className="sfx-pill">
											<PlayButton src={'/' + f} seconds={3} /> {i + 1}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				) : null}
			</div>
		</aside>
	);
};

export const LibraryRight: React.FC = () => {
	const [tab, setTab] = React.useState<'zoom' | 'hook' | 'tips' | 'me'>('hook');
	const setup: Setup = {...defaultSetup(), hook: {visual: 'title', sfx: true, text: 'Tohle ti nikdo neřekne'}};
	return (
		<aside className="lib right">
			<div className="lib-head">
				<b>Ukázky</b>
				<span className="muted small">jak může video vypadat</span>
			</div>
			<div className="lib-tabs">
				<button className={tab === 'hook' ? 'on' : ''} onClick={() => setTab('hook')}>
					<Icon name="hook" /> Hooky
				</button>
				<button className={tab === 'zoom' ? 'on' : ''} onClick={() => setTab('zoom')}>
					<Icon name="zoom" /> Zoomy
				</button>
				<button className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>
					<Icon name="users" /> Můj styl
				</button>
				<button className={tab === 'tips' ? 'on' : ''} onClick={() => setTab('tips')}>
					<Icon name="ai" /> Tipy
				</button>
			</div>
			<div className="lib-body">
				{tab === 'hook' ? (
					<div className="lib-grid">
						{CATALOG.hooks.map((h) => (
							<HookCard key={h.id} id={h.id as HookVisual} setup={setup} compact />
						))}
					</div>
				) : null}
				{tab === 'zoom' ? (
					<div className="lib-grid">
						{CATALOG.zooms.map((z) => (
							<ZoomCard key={z.id} id={z.id as ZoomStyle} setup={setup} compact />
						))}
					</div>
				) : null}
				{tab === 'me' ? <MyStyle /> : null}
				{tab === 'tips' ? (
					<div className="tips">
						<div className="tip">
							<b>Klient = uložený styl</b>
							<span>Založ klienta, jednou mu nastav barvu, titulky, grafiku, zoomy a hook. Každé jeho další video začne s tímhle stylem.</span>
						</div>
						<div className="tip">
							<b>Točíš po kouscích?</b>
							<span>Nahraj všechny klipy naráz (+ další klip). Spojí se v pořadí, které nastavíš, a nic se nepřehází.</span>
						</div>
						<div className="tip">
							<b>Už je to sestříhané?</b>
							<span>Vyber „Už je sestříhané“ – nic se nevystřihne, jen se přidá grafika, titulky a zvuk.</span>
						</div>
						<div className="tip">
							<b>AI lišta je všude</b>
							<span>Napiš „vyber za mě“, „dej tam jen čísla“, „klidnější hudbu“, „titulky větší“ – AI to rovnou nastaví.</span>
						</div>
						<div className="tip">
							<b>Hook rozhoduje</b>
							<span>V kroku Hook si nech navrhnout 5 hooků z přepisu, nebo napiš vlastní, a vyber, jak má vypadat.</span>
						</div>
					</div>
				) : null}
			</div>
		</aside>
	);
};

// co si aplikace pamatuje o autorově vkusu (AI se tím řídí u každého videa)
const MyStyle: React.FC = () => {
	const [p, setP] = React.useState<Prefs | null>(null);
	const [notes, setNotes] = React.useState('');
	const [add, setAdd] = React.useState('');
	React.useEffect(() => {
		api.prefs().then((x) => {
			setP(x);
			setNotes(x.notes);
		});
	}, []);
	if (!p) return null;
	const save = async (patch: Partial<Prefs>) => setP(await api.savePrefs(patch));
	const lab = (t: string) => CATALOG.gfx.find((g) => g.type === t)?.label ?? t;
	const often = (o: Record<string, number>) => Object.entries(o).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6);
	return (
		<div className="mystyle">
			<p className="muted small">Co tu je, AI dodržuje u každého videa. Učí se i sama: z toho, co mažeš a přidáváš, a z vět jako „tohle se mi nelíbí“ v AI liště.</p>
			<label className="field">
				<span>Můj styl vlastními slovy</span>
				<textarea rows={4} value={notes} placeholder="Např.: mám rád čistý minimalistický střih, hodně čísel, žádné emoji, krátké titulky…" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== p.notes && save({notes})} />
			</label>
			<b className="small">Mám rád</b>
			<div className="pref-chips">
				{p.likes.map((x) => (
					<span key={x} className="pref like">
						{x}
						<button className="ghost icon" onClick={() => save({likes: p.likes.filter((y) => y !== x)})}>
							<Icon name="x" />
						</button>
					</span>
				))}
			</div>
			<b className="small">Nemám rád</b>
			<div className="pref-chips">
				{p.dislikes.map((x) => (
					<span key={x} className="pref dislike">
						{x}
						<button className="ghost icon" onClick={() => save({dislikes: p.dislikes.filter((y) => y !== x)})}>
							<Icon name="x" />
						</button>
					</span>
				))}
			</div>
			<div className="row" style={{gap: 6}}>
				<input value={add} placeholder="přidat (např. velký zoom)" onChange={(e) => setAdd(e.target.value)} />
				<button className="small" disabled={!add.trim()} onClick={() => (save({likes: [...p.likes, add.trim()]}), setAdd(''))}>
					👍
				</button>
				<button className="small" disabled={!add.trim()} onClick={() => (save({dislikes: [...p.dislikes, add.trim()]}), setAdd(''))}>
					👎
				</button>
			</div>
			{often(p.removed).length || often(p.added).length ? (
				<div className="tip">
					<b>Naučeno z tvých úprav</b>
					{often(p.added).length ? <span>Rád přidáváš: {often(p.added).map(([t, n]) => `${lab(t)} (${n}×)`).join(', ')}</span> : null}
					{often(p.removed).length ? <span>Často mažeš: {often(p.removed).map(([t, n]) => `${lab(t)} (${n}×)`).join(', ')}</span> : null}
				</div>
			) : null}
		</div>
	);
};
