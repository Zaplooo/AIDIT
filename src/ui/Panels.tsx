import React from 'react';
import {api, MusicTrack} from '../api';
import {Beat, caseText, Gfx, Layout, Look, Project} from '../model';
import {FONTS} from '../remotion/fonts';
import type {Ctx} from './Editor';
import {Icon, JumpMock, StyleMock, TempoMock} from './Mocks';
import {CATALOG, captionFromSetup, Setup, withDefaults} from '../setup';
import {CaptionCard, GfxCard} from './previews';
import {CaptionEditor} from './CaptionEditor';
import {SfxPicker} from './SfxPicker';
import {GFX_LABEL, gfxDefault, GfxFields, OVERLAY} from './gfxedit';

// nastavení pro náhledy šablon podle vzhledu projektu (barva, pozadí, font)
const setupOf = (p: Project): Setup => withDefaults({color: p.look.theme?.brand ?? p.look.accent, bg: p.look.theme?.bg ?? 'dark', font: p.look.theme?.font ?? 'Inter Tight'});

const clone = (p: Project) => structuredClone(p);

// ---------------------------------------------------------------- levý panel: co AI dělá a co stříhá
export const AiPanel: React.FC<{ctx: Ctx; L: Layout}> = ({ctx, L}) => {
	const {project: p} = ctx;
	const [pending, setPending] = React.useState<Record<string, boolean>>({});
	const [showCut, setShowCut] = React.useState(true);
	// výstupní čas začátku každé věty (pro skok v náhledu)
	const unitTime = React.useMemo(() => {
		const m = new Map<string, number>();
		for (const u of p.units) {
			const w = L.words.find((x) => {
				const s = p.words[x.wi]?.start ?? -1;
				return s >= u.start - 0.05 && s <= u.end + 0.05;
			});
			if (w) m.set(u.id, w.start);
		}
		return m;
	}, [p, L]);
	const nowUnit = React.useMemo(() => {
		let best: string | null = null;
		for (const [id, t] of unitTime) if (t <= ctx.time + 0.05) best = id;
		return best;
	}, [unitTime, ctx.time]);
	const isKeep = (id: string, keep: boolean) => (id in pending ? pending[id] : keep);
	const changes = Object.keys(pending).length;
	const kept = p.units.filter((u) => isKeep(u.id, u.keep));

	return (
		<aside className="ai-panel">
			<div className="ai-card">
				<div className="ai-head">
					<Icon name="ai" /> <b>Co AI udělala</b>
				</div>
				{p.plan.summary ? <p>{p.plan.summary}</p> : <p className="muted">Video je sestříhané podle zvuku a výběru vět.</p>}
				{p.plan.thinking.length ? (
					<ul>
						{p.plan.thinking.map((t, i) => (
							<li key={i}>{t}</li>
						))}
					</ul>
				) : null}
			</div>

			<div className="units-head">
				<b>Co stříhám</b>
				<span className="muted small">
					{kept.length} z {p.units.length} vět
				</span>
				<div style={{flex: 1}} />
				<button className="ghost small" onClick={() => setShowCut(!showCut)}>
					{showCut ? 'Skrýt vystřižené' : 'Ukázat vystřižené'}
				</button>
			</div>
			<div className="units">
				{p.units.map((u) => {
					const keep = isKeep(u.id, u.keep);
					if (!keep && !showCut && !(u.id in pending)) return null;
					const t = unitTime.get(u.id);
					return (
						<div key={u.id} className={'unit' + (keep ? ' keep' : ' cut') + (nowUnit === u.id && u.keep ? ' now' : '') + (u.id in pending ? ' changed' : '')}>
							<button
								className="ut"
								title={keep ? 'Vystřihnout větu' : 'Vrátit větu do videa'}
								onClick={() => {
									const n = {...pending};
									if (u.id in n) delete n[u.id];
									else n[u.id] = !u.keep;
									setPending(n);
								}}
							>
								<Icon name={keep ? 'check' : 'x'} />
							</button>
							<div className="utext" onClick={() => t != null && ctx.seek(t + 0.01)}>
								<span>{u.text}</span>
								{!keep ? <span className="why">{u.id in pending ? 'vystřihnu' : u.reason ?? 'vystřiženo'}</span> : u.id in pending ? <span className="why add">vrátím</span> : null}
							</div>
							{t != null && keep ? <span className="muted small tt">{Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')}</span> : null}
						</div>
					);
				})}
			</div>
			{changes ? (
				<div className="units-apply">
					<button className="ghost" onClick={() => setPending({})}>
						Zrušit
					</button>
					<button
						className="primary"
						disabled={ctx.busy}
						onClick={async () => {
							const units = pending;
							setPending({});
							await ctx.heavy(`Změna vět (${Object.keys(units).length})`, {units});
						}}
					>
						Přestříhat ({changes})
					</button>
				</div>
			) : null}
		</aside>
	);
};

// ---------------------------------------------------------------- pravý panel: všechny možnosti v záložkách
const TABS = [
	{key: 'captions', icon: 'text', label: 'Titulky'},
	{key: 'cards', icon: 'card', label: 'Grafika'},
	{key: 'sound', icon: 'sfx', label: 'Zvuk'},
	{key: 'style', icon: 'style', label: 'Styl a délka'},
] as const;

export const SidePanels: React.FC<{ctx: Ctx; L: Layout}> = ({ctx, L}) => {
	const [tab, setTab] = React.useState<(typeof TABS)[number]['key']>('captions');
	return (
		<aside className="side">
			<nav className="tabs">
				{TABS.map((t) => (
					<button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
						<Icon name={t.icon} />
						<span>{t.label}</span>
					</button>
				))}
			</nav>
			<div className="tab-body">
				{tab === 'style' ? (
					<>
						<CutTab ctx={ctx} />
						<div className="tab-sep" />
						<StyleTab ctx={ctx} />
					</>
				) : null}
				{tab === 'captions' ? <CaptionsTab ctx={ctx} L={L} /> : null}
				{tab === 'cards' ? <CardsTab ctx={ctx} L={L} /> : null}
				{tab === 'sound' ? <SoundTab ctx={ctx} /> : null}
			</div>
		</aside>
	);
};

const Seg = <T extends string | number | null>({value, options, onChange}: {value: T; options: [T, string][]; onChange: (v: T) => void}) => (
	<div className="seg">
		{options.map(([v, l]) => (
			<button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
				{l}
			</button>
		))}
	</div>
);

const Field: React.FC<{label: string; children: React.ReactNode; hint?: string}> = ({label, children, hint}) => (
	<div className="field">
		<span>{label}</span>
		{children}
		{hint ? <small className="muted">{hint}</small> : null}
	</div>
);

const setLook = (ctx: Ctx, patch: Partial<Look>) => {
	const q = clone(ctx.project);
	q.look = {...q.look, ...patch};
	ctx.update(q);
};

const StyleTab: React.FC<{ctx: Ctx}> = ({ctx}) => {
	const p = ctx.project;
	return (
		<>
			<Field label="Rozložení">
				<Seg value={p.look.layout} options={[['full', 'Celá plocha'], ['framed', 'Rámeček na černé'], ['split', 'Split screen']]} onChange={(v) => setLook(ctx, {layout: v})} />
			</Field>
			<Field label="Zoomy" hint="Najeď v průvodci na kartu zoomu pro ukázku. Střídání 100/112 % přepočítá náhled.">
				<select
					value={p.look.zoomStyle ?? (p.look.zoom ? 'punch' : 'none')}
					onChange={(e) => {
						const z = e.target.value as NonNullable<Look['zoomStyle']>;
						const look = {...p.look, zoomStyle: z, zoom: z !== 'none', jump: (z === 'jump' ? 'punch' : 'hard') as Look['jump']};
						if (look.jump !== p.look.jump) ctx.heavy('Zoomy', {project: {...clone(p), look}});
						else setLook(ctx, look);
					}}
				>
					{CATALOG.zooms.map((z) => (
						<option key={z.id} value={z.id}>
							{z.label} – {z.desc}
						</option>
					))}
				</select>
			</Field>
			<Field label="Hook (první 2 s)">
				<select value={p.look.hook?.visual ?? 'none'} onChange={(e) => setLook(ctx, {hook: {...(p.look.hook ?? {sfx: false, text: p.plan.hook ?? ''}), visual: e.target.value as NonNullable<Look['hook']>['visual']}})}>
					{CATALOG.hooks.map((h) => (
						<option key={h.id} value={h.id}>
							{h.label}
						</option>
					))}
				</select>
				<input value={p.look.hook?.text ?? p.plan.hook ?? ''} placeholder="Text hooku" onChange={(e) => setLook(ctx, {hook: {...(p.look.hook ?? {visual: 'title', sfx: false}), text: e.target.value}})} style={{marginTop: 6}} />
				<label className="check small">
					<input type="checkbox" checked={p.look.hook?.sfx ?? false} onChange={(e) => setLook(ctx, {hook: {...(p.look.hook ?? {visual: 'none', text: ''}), sfx: e.target.checked}})} /> Výrazný zvuk na začátku
				</label>
			</Field>
			<Field label="Barevný tón" hint="Mění obraz – náhled se přepočítá (pár sekund).">
				<Seg value={p.look.grade} options={[['none', 'Původní'], ['cinematic', 'Filmový'], ['dark', 'Tmavý'], ['warm', 'Teplý']]} onChange={(v) => ctx.heavy('Barevný tón', {project: {...clone(p), look: {...p.look, grade: v}}})} />
			</Field>
			<Field label="Skoky ve střihu">
				<div className="row2">
					{(['hard', 'punch'] as const).map((j) => (
						<button key={j} className={'mini-choice' + (p.look.jump === j ? ' on' : '')} onClick={() => p.look.jump !== j && ctx.heavy(j === 'punch' ? 'Střídat přiblížení' : 'Tvrdý střih', {project: {...clone(p), look: {...p.look, jump: j}}})}>
							<JumpMock jump={j} />
							<span>{j === 'hard' ? 'Tvrdý střih' : 'Střídat přiblížení'}</span>
						</button>
					))}
				</div>
			</Field>
			<Field label="Barva zvýraznění">
				<div className="swatches">
					{['#FF3B3B', '#E5484D', '#3D7BFF', '#22C55E', '#FACC15', '#A855F7', '#FFFFFF'].map((c) => (
						<button key={c} className={'sw' + (p.look.accent === c ? ' on' : '')} style={{background: c}} onClick={() => {
							const q = clone(p);
							q.look.accent = c;
							if (q.look.theme) q.look.theme = {...q.look.theme, brand: c};
							if (q.captions.highlight) q.captions.highlight = c;
							ctx.update(q);
						}} />
					))}
				</div>
			</Field>
			<Field label="Formát">
				<Seg value={p.format} options={[['9:16', '9:16'], ['16:9', '16:9'], ['1:1', '1:1']]} onChange={(v) => v !== p.format && ctx.heavy(`Formát ${v}`, {project: {...clone(p), format: v}})} />
			</Field>
			<Field label="Výchozí styl (recept)" hint="Přepne titulky, grafiku, tón i tempo na hotový styl z referencí. AI přepočítá grafiku.">
				<div className="style-list">
					{ctx.styles.filter((s) => !s.platform || s.platform === (p.format === '16:9' ? 'youtube' : 'reels') || s.id.startsWith('ref-')).map((s) => (
						<button key={s.id} className={'style-item' + (p.look.preset === s.id ? ' on' : '')} disabled={ctx.busy} onClick={() => p.look.preset !== s.id && ctx.heavy(`Styl ${s.name}`, {project: p, preset: s.id})}>
							<StyleMock id={s.id} small style={s} />
							<div>
								<b>{s.name}</b>
								<span className="muted small">{s.description}</span>
							</div>
						</button>
					))}
				</div>
			</Field>
		</>
	);
};

const CaptionsTab: React.FC<{ctx: Ctx; L: Layout}> = ({ctx, L}) => {
	const p = ctx.project;
	const c = p.captions;
	const set = (patch: Partial<Project['captions']>) => {
		const q = clone(p);
		q.captions = {...q.captions, ...patch};
		ctx.update(q);
	};
	const cur = L.groups.find((g) => ctx.time >= g.start && ctx.time < g.end);
	const [edit, setEdit] = React.useState<{start: number; text: string} | null>(null);
	return (
		<>
			<label className="switch-row">
				<span>Zobrazit titulky</span>
				<input type="checkbox" checked={c.enabled} onChange={(e) => set({enabled: e.target.checked})} />
			</label>
			<Field label="Styl titulků" hint="Najeď = ukázka, klik = použít. Pak si cokoliv dolaď níž (nebo napiš AI dole, jak je chceš).">
				<div className="cap-presets">
					{CATALOG.captions.map((cp) => (
						<CaptionCard key={cp.id} id={cp.id} setup={setupOf(p)} onClick={() => {
							set({alt: undefined, active: undefined, stroke: undefined, strokeColor: undefined, box: undefined, italic: undefined, emoji: undefined, ...captionFromSetup({...setupOf(p), caption: cp.id}), enabled: true});
							// styl s emoji: AI doplní emoji ke klíčovým slovům
							if ((cp.style as {emoji?: boolean}).emoji && !Object.keys(p.plan.emojis ?? {}).length) ctx.run('AI vybírá emoji ke klíčovým slovům', () => api.emoji(p.id));
						}} />
					))}
				</div>
			</Field>
			<CaptionEditor
				style={c}
				set={set}
				accent={p.look.theme?.brand ?? p.look.accent}
				onEmoji={(on) => (on && !Object.keys(p.plan.emojis ?? {}).length ? ctx.run('AI vybírá emoji ke klíčovým slovům', () => api.emoji(p.id)) : set({emoji: on}))}
			/>
			<button className="ghost small" style={{marginTop: 8}} onClick={() => downloadSrt(p.name, L)}>
				<Icon name="export" /> Stáhnout titulky (SRT)
			</button>
			<Field label="Text titulků" hint="Klikni na titulek a oprav ho. Barevná slova = klíčová slova od AI (klikni na slovo v náhledu níže).">
				<div className="cap-list">
					{L.groups.map((g) => {
						const on = cur === g;
						const txt = g.words.map((w) => w.text).join(' ');
						return edit?.start === g.start ? (
							<div key={g.start} className="cap-item editing">
								<input
									autoFocus
									value={edit.text}
									onChange={(e) => setEdit({...edit, text: e.target.value})}
									onKeyDown={(e) => {
										if (e.key === 'Escape') setEdit(null);
										if (e.key === 'Enter') {
											const parts = edit.text.trim().split(/\s+/);
											const q = clone(p);
											if (parts.length === g.words.length) g.words.forEach((w, i) => (q.words[w.wi].text = parts[i]));
											else {
												// jiný počet slov: rozložit do času skupiny
												const idx = g.words.map((w) => w.wi);
												const a = q.words[idx[0]];
												const b = q.words[idx[idx.length - 1]];
												const span = b.end - a.start;
												const fresh = parts.map((x, i) => ({text: x, start: a.start + (span * i) / parts.length, end: a.start + (span * (i + 1)) / parts.length}));
												q.words.splice(idx[0], idx[idx.length - 1] - idx[0] + 1, ...fresh);
											}
											ctx.update(q);
											setEdit(null);
										}
									}}
									onBlur={() => setEdit(null)}
								/>
							</div>
						) : (
							<div key={g.start} className={'cap-item' + (on ? ' now' : '')} onClick={() => ctx.seek(g.start + 0.05)} onDoubleClick={() => setEdit({start: g.start, text: txt})}>
								<span className="tt">{g.start.toFixed(1)}</span>
								<span>
									{g.words.map((w) => (
										<span
											key={w.wi}
											className={w.key ? 'kw' : ''}
											title="Klikni se Shiftem = přepnout klíčové slovo"
											onClick={(e) => {
												if (!e.shiftKey) return;
												e.stopPropagation();
												const q = clone(p);
												const k = new Set(q.plan.keywords);
												k.has(w.wi) ? k.delete(w.wi) : k.add(w.wi);
												q.plan.keywords = [...k];
												ctx.update(q);
											}}
										>
											{caseText(w.text, c.textCase)}{' '}
										</span>
									))}
								</span>
								<button className="ghost small" onClick={(e) => (e.stopPropagation(), setEdit({start: g.start, text: txt}))}>
									upravit
								</button>
							</div>
						);
					})}
				</div>
			</Field>
		</>
	);
};

const KIND_LABEL: Record<string, string> = {gfx: 'Grafika', broll: 'B-roll', chip: 'Štítek', punch: 'Přiblížení'};
const CardsTab: React.FC<{ctx: Ctx; L: Layout}> = ({ctx, L}) => {
	const p = ctx.project;
	const beats = p.plan.beats ?? [];
	const set = (b: Beat[]) => {
		const q = clone(p);
		q.plan.beats = b;
		ctx.update(q);
	};
	const upd = (id: string, patch: Partial<Beat>) => set(beats.map((x) => (x.id === id ? {...x, ...patch} : x)));
	const laid = new Map(L.beats.map((c) => [c.id, c]));
	const [gallery, setGallery] = React.useState(false);
	const [filling, setFilling] = React.useState<string | null>(null);
	const addHere = (kind: Beat['kind'], type: Gfx['type'] = 'reveal') => {
		const w = L.words.find((x) => x.start >= ctx.time - 0.05) ?? L.words[L.words.length - 1];
		if (!w) return;
		const b: Beat = {id: `b${Date.now().toString(36)}`, wi: w.wi, dur: kind === 'gfx' ? 2.6 : 1.8, kind};
		if (kind === 'gfx') Object.assign(b, {layout: OVERLAY.has(type) ? 'overlay' : 'full', gfx: gfxDefault(type), why: 'AI vyplňuje obsah z videa…'});
		if (kind === 'chip') b.chip = 'Nový štítek';
		set([...beats, b]);
		setGallery(false);
		if (kind !== 'gfx') return;
		// šablona se vyplní tím, co se v tomhle místě videa říká
		setFilling(b.id);
		api
			.gfxFill(p.id, type, w.start)
			.then(({gfx}) => {
				const q = clone(ctx.latest());
				q.plan.beats = (q.plan.beats ?? []).map((x) => (x.id === b.id ? {...x, gfx, why: 'vyplněno z toho, co tu říkáš'} : x));
				ctx.update(q);
			})
			.catch(() => {
				const q = clone(ctx.latest());
				q.plan.beats = (q.plan.beats ?? []).map((x) => (x.id === b.id ? {...x, why: 'AI teď nepomohla – uprav text ručně'} : x));
				ctx.update(q);
			})
			.finally(() => setFilling(null));
	};
	const chosen = p.look.gfxAllowed ?? [];
	const ps = setupOf(p);
	const youtube = p.format === '16:9';
	return (
		<>
			<p className="muted small" style={{marginTop: 0}}>
				Všechno, co AI přidala nad tvůj záběr: motion grafika, B-roll, štítky a přiblížení. Hlas běží dál. Klikni na čas = skok v náhledu.
			</p>
			<Field label="Pozadí grafiky">
				<Seg value={p.look.theme?.bg ?? 'dark'} options={[['dark', 'Tmavé'], ['cream', 'Krémová mřížka'], ['brand', 'Barevné'], ['glass', 'Sklo']]} onChange={(v) => setLook(ctx, {theme: {...(p.look.theme ?? {font: 'Montserrat', serif: 'DM Serif Display', bg: 'dark'}), bg: v}})} />
			</Field>
			<div className="row" style={{gap: 6, marginBottom: 12, flexWrap: 'wrap'}}>
				<button className={'small' + (gallery ? ' active' : '')} onClick={() => setGallery(!gallery)}>
					<Icon name="plus" /> Grafika
				</button>
				<button className="small" onClick={() => addHere('chip')}>
					<Icon name="plus" /> Štítek
				</button>
				<button className="small" onClick={() => addHere('punch')}>
					<Icon name="plus" /> Přiblížení
				</button>
				<button className="ghost small" disabled={ctx.busy} onClick={() => ctx.heavy('AI plánuje grafiku a B-roll znovu', {project: p, replan: true})}>
					<Icon name="ai" /> AI znovu
				</button>
			</div>
			{gallery ? (
				<div className="tpl-gallery">
					<p className="muted small" style={{margin: '0 0 8px'}}>
						Najeď = ukázka v barvách videa. Klik = přidá se na {ctx.time.toFixed(1)} s a AI ji vyplní tím, co tam říkáš.
					</p>
					{chosen.length ? <b className="small">Vybrané pro toto video</b> : null}
					<div className="tpl-grid">
						{CATALOG.gfx
							.filter((g) => chosen.includes(g.type))
							.map((g) => (
								<GfxCard key={g.type} type={g.type} setup={ps} compact on onClick={() => addHere('gfx', g.type)} />
							))}
					</div>
					{chosen.length ? <b className="small">Další šablony</b> : null}
					<div className="tpl-grid">
						{CATALOG.gfx
							.filter((g) => !chosen.includes(g.type))
							.map((g) => (
								<GfxCard key={g.type} type={g.type} setup={ps} compact onClick={() => addHere('gfx', g.type)} />
							))}
					</div>
				</div>
			) : null}
			{beats.length === 0 ? <p className="muted small">Zatím nic.</p> : null}
			<div className="card-list">
				{[...beats]
					.sort((a, b) => (laid.get(a.id)?.start ?? 1e9) - (laid.get(b.id)?.start ?? 1e9))
					.map((b) => {
						const lb = laid.get(b.id);
						return (
							<div key={b.id} className={'card-item kind-' + b.kind + (lb && ctx.time >= lb.start && ctx.time < lb.end ? ' now' : '') + (lb ? '' : ' off')}>
								<div className="row" style={{justifyContent: 'space-between', gap: 6}}>
									<span className="kind-tag">{KIND_LABEL[b.kind]}{b.gfx ? ` · ${GFX_LABEL[b.gfx.type]}` : ''}</span>
									<button className="ghost small" onClick={() => lb && ctx.seek(lb.start + 0.05)}>
										{lb ? `${lb.start.toFixed(1)} s` : 'u vystřižené věty'}
									</button>
									<button className="ghost small danger" onClick={() => set(beats.filter((x) => x.id !== b.id))}>
										<Icon name="x" />
									</button>
								</div>
								{b.why ? <span className="muted small">{filling === b.id ? <span className="spin" /> : null} AI: {b.why}</span> : null}
								{b.kind === 'gfx' && b.gfx ? (
									<>
										<div className="row" style={{gap: 6}}>
											<select
												value={b.gfx.type}
												onChange={(e) => {
													// výměna šablony: AI převede obsah do nové šablony podle toho, co se tu říká
													const type = e.target.value as Gfx['type'];
													const prev = b.gfx;
													upd(b.id, {gfx: gfxDefault(type), layout: OVERLAY.has(type) ? 'overlay' : b.layout === 'overlay' ? 'full' : b.layout, why: 'AI přizpůsobuje šablonu videu…'});
													setFilling(b.id);
													api
														.gfxFill(p.id, type, laid.get(b.id)?.start ?? ctx.time, prev)
														.then(({gfx}) => {
															const q = clone(ctx.latest());
															q.plan.beats = (q.plan.beats ?? []).map((x) => (x.id === b.id ? {...x, gfx, why: 'přizpůsobeno videu'} : x));
															ctx.update(q);
														})
														.catch(() => {})
														.finally(() => setFilling(null));
												}}
											>
												{Object.entries(GFX_LABEL).map(([k, l]) => (
													<option key={k} value={k}>
														{l}
													</option>
												))}
											</select>
											<select value={b.layout ?? 'full'} onChange={(e) => upd(b.id, {layout: e.target.value as Beat['layout']})}>
												<option value="full">Přes celou obrazovku</option>
												<option value="overlay">Přes záběr (mluvčí vidět)</option>
												{!youtube ? <option value="split">Split (nahoře grafika)</option> : null}
												{youtube ? <option value="pip">Mluvčí v rohu</option> : null}
											</select>
										</div>
										<GfxFields g={b.gfx} set={(g) => upd(b.id, {gfx: g})} />
									</>
								) : null}
								{b.kind === 'chip' ? <input value={b.chip ?? ''} onChange={(e) => upd(b.id, {chip: e.target.value})} /> : null}
								{b.kind === 'broll' ? <span className="small">Záběr: {b.broll?.title ?? b.broll?.query} <span className="muted">(Mixkit)</span></span> : null}
								<label className="small muted">
									Délka {b.dur.toFixed(1)} s
									<input type="range" min={0.6} max={5} step={0.1} value={b.dur} onChange={(e) => upd(b.id, {dur: +e.target.value})} />
								</label>
							</div>
						);
					})}
			</div>
		</>
	);
};

let player: HTMLAudioElement | null = null;

const SoundTab: React.FC<{ctx: Ctx}> = ({ctx}) => {
	const p = ctx.project;
	const input = React.useRef<HTMLInputElement>(null);
	const [up, setUp] = React.useState<number | null>(null);
	const [lib, setLib] = React.useState<MusicTrack[]>([]);
	const [cat, setCat] = React.useState<string>('');
	React.useEffect(() => {
		api.musicLib().then(setLib).catch(() => {});
	}, []);
	const cats = [...new Set(lib.map((m) => m.cat))];
	const shown = lib.filter((m) => m.cat === (cat || p.plan.mood || cats[0]));
	const preview = (f: string) => {
		player?.pause();
		player = new Audio('/' + f);
		player.volume = 0.8;
		player.play();
	};
	return (
		<>
			<Field label="Zvukové efekty" hint="Whoosh u grafiky a B-rollu, pop u štítků, click u seznamů, hit u čísel. Vždy pod hlasem.">
				<Seg value={p.look.sfx} options={[['off', 'Žádné'], ['soft', 'Jemné'], ['bold', 'Výrazné']]} onChange={(v) => setLook(ctx, {sfx: v})} />
			</Field>
			<Field label="Které efekty chceš" hint="Poslechni a zaškrtni. Co se ti nelíbí, odškrtni – už se nepoužije. Zvuk u jedné konkrétní grafiky změníš v timeline.">
				<SfxPicker value={p.look.sfxSet} onChange={(v) => setLook(ctx, {sfxSet: v})} />
			</Field>
			<Field label="Hudba" hint="Pod tvým hlasem se automaticky ztiší, v pauzách zesílí, na konci dozní.">
				{p.look.music ? (
					<div className="music">
						<Icon name="music" />
						<span>{p.look.music.name}</span>
						<button className="ghost small danger" onClick={() => setLook(ctx, {music: null})}>
							Bez hudby
						</button>
					</div>
				) : (
					<p className="muted small">Bez hudby.</p>
				)}
			</Field>
			{p.look.music ? (
				<Field label={`Hlasitost hudby ${Math.round(p.look.music.volume * 100)} %`}>
					<input type="range" min={0.05} max={1} step={0.01} value={p.look.music.volume} onChange={(e) => setLook(ctx, {music: {...p.look.music!, volume: +e.target.value}})} />
				</Field>
			) : null}
			<Field label="Knihovna hudby (zdarma, Mixkit)">
				<div className="chips">
					{cats.map((c) => (
						<button key={c} className={'chip' + ((cat || p.plan.mood || cats[0]) === c ? ' on' : '')} onClick={() => setCat(c)}>
							{c}
						</button>
					))}
				</div>
				<div className="track-list">
					{shown.map((m) => (
						<div key={m.id} className={'track' + (p.look.music?.file === m.file ? ' on' : '')}>
							<button className="ghost icon" onClick={() => preview(m.file)} title="Přehrát ukázku">
								<Icon name="play" />
							</button>
							<span>{m.name}</span>
							<span className="muted small">{Math.floor(m.duration / 60)}:{String(m.duration % 60).padStart(2, '0')}</span>
							<button className="small" onClick={() => (player?.pause(), setLook(ctx, {music: {file: m.file, name: `${m.name} (Mixkit, ${m.cat})`, volume: p.look.music?.volume ?? 0.5}}))}>
								Použít
							</button>
						</div>
					))}
				</div>
			</Field>
			<Field label="Vlastní hudba">
				<button onClick={() => input.current?.click()} disabled={up != null}>
					<Icon name="music" /> {up != null ? `Nahrávám ${Math.round(up * 100)} %` : 'Nahrát písničku (MP3, WAV)'}
				</button>
				<input
					ref={input}
					type="file"
					accept="audio/*"
					hidden
					onChange={async (e) => {
						const f = e.target.files?.[0];
						if (!f) return;
						setUp(0);
						const np = await api.music(p.id, f, setUp);
						setUp(null);
						const q = clone(p);
						q.look.music = {...np.music, volume: 0.35, custom: true};
						ctx.update(q);
					}}
				/>
				<small className="muted">Písničky z referencí (např. Frank Ocean, Bee Gees) jsou chráněné autorským právem – na Instagramu je přidej přímo v aplikaci.</small>
			</Field>
		</>
	);
};

const CutTab: React.FC<{ctx: Ctx}> = ({ctx}) => {
	const p = ctx.project;
	const hookQ = p.plan.questions.find((q) => q.id === 'hook');
	const titleQ = p.plan.questions.find((q) => q.id === 'title');
	return (
		<>
			<Field label="Tempo" hint="Kolik pauzy nechat mezi slovy. Přestříhá se podle zvuku.">
				<div className="row3">
					{(['calm', 'normal', 'fast'] as const).map((t) => (
						<button key={t} className={'mini-choice' + (p.look.tempo === t ? ' on' : '')} disabled={ctx.busy} onClick={() => p.look.tempo !== t && ctx.heavy(`Tempo ${t === 'calm' ? 'klidné' : t === 'normal' ? 'svižné' : 'rychlé'}`, {project: {...clone(p), look: {...p.look, tempo: t}}})}>
							<TempoMock tempo={t} />
							<span>{t === 'calm' ? 'Klidné' : t === 'normal' ? 'Svižné' : 'Rychlé'}</span>
						</button>
					))}
				</div>
			</Field>
			<Field label="Maximální délka" hint="AI vybere věty tak, aby se video vešlo. Hook a závěr nechá.">
				<Seg
					value={p.look.maxLength}
					options={[[null, 'Bez limitu'], [30, '30 s'], [45, '45 s'], [60, '60 s'], [90, '90 s']]}
					onChange={(v) => v !== p.look.maxLength && ctx.heavy(v ? `Zkrátit na ${v} s` : 'Bez limitu délky', {project: {...clone(p), look: {...p.look, maxLength: v}}})}
				/>
			</Field>
			{hookQ ? (
				<Field label="Čím video začíná (hook)">
					<div className="opt-list">
						{hookQ.options.map((o) => (
							<button key={o.value} className={'opt' + (hookQ.answer === o.value ? ' on' : '')} disabled={ctx.busy} onClick={() => {
								const q = clone(p);
								q.plan.questions = q.plan.questions.map((x) => (x.id === 'hook' ? {...x, answer: o.value} : x));
								ctx.heavy('Nový začátek videa', {project: q, first: o.value});
							}}>
								{o.label}
							</button>
						))}
					</div>
				</Field>
			) : null}
			<Field label="Nadpis videa" hint="Používá se ve split screenu a pro AI karty.">
				<input value={p.plan.title} onChange={(e) => {
					const q = clone(p);
					q.plan.title = e.target.value;
					ctx.update(q);
				}} />
				{titleQ ? (
					<div className="chips">
						{titleQ.options.map((o) => (
							<button key={o.value} className="chip" onClick={() => {
								const q = clone(p);
								q.plan.title = o.value;
								ctx.update(q);
							}}>
								{o.label}
							</button>
						))}
					</div>
				) : null}
			</Field>
		</>
	);
};

// titulky jako SRT (pro YouTube, Premiere, CapCut…)
function downloadSrt(name: string, L: Layout) {
	const ts = (x: number) => {
		const ms = Math.round(x * 1000);
		const h = Math.floor(ms / 3600000);
		const m = Math.floor((ms % 3600000) / 60000);
		const sec = Math.floor((ms % 60000) / 1000);
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
	};
	const srt = L.groups.map((g, i) => `${i + 1}\n${ts(g.start)} --> ${ts(g.end)}\n${g.words.map((w) => w.text).join(' ')}\n`).join('\n');
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([srt], {type: 'text/plain;charset=utf-8'}));
	a.download = `${name || 'titulky'}.srt`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
