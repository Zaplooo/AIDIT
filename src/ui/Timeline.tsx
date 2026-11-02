import React from 'react';
import {api} from '../api';
import {Beat, caseText, fmtTime, Gfx, Layout, Project} from '../model';
import {HOOK_END, SfxEvent, sfxEvents} from '../remotion/Edit';
import {loadSfx, resetSfx, SFX_CATS, SfxItem} from '../sfx';
import {PlayButton} from './previews';
import {CATALOG} from '../setup';
import type {Ctx} from './Editor';
import {BeatSfx, FontSelect, GFX_LABEL, gfxDefault, GfxFields, OVERLAY, PosEditor} from './gfxedit';
import {Icon} from './Mocks';

// Timeline: posun a ořez grafiky / B-rollu / štítků / zoomů tažením, přehazování a ořez klipů, výběr -> úpravy vpravo.
type Sel = {kind: 'beat' | 'clip' | 'newbroll' | 'sfx' | 'newsfx' | 'cap' | 'music' | 'hook'; id: string} | null;
type Drag = {type: 'move' | 'left' | 'right'; what: 'beat' | 'clip' | 'sfx'; id: string; x0: number; start: number; dur: number; moved: boolean};

const KIND_LABEL: Record<string, string> = {gfx: 'Grafika', broll: 'B-roll', chip: 'Štítek', punch: 'Zoom'};
const clone = (p: Project) => structuredClone(p);

export const Timeline: React.FC<{ctx: Ctx; L: Layout; onClose: () => void; playheadRef: React.MutableRefObject<((t: number) => void) | null>}> = ({ctx, L, onClose, playheadRef}) => {
	const p = ctx.project;
	const total = L.durationInFrames / L.fps;
	const [pps, setPps] = React.useState(() => Math.max(14, Math.min(80, 1100 / Math.max(total, 1)))); // pixelů na sekundu
	const [sel, setSel] = React.useState<Sel>(null);
	const [draft, setDraft] = React.useState<{id: string; start: number; dur: number} | null>(null);
	const [clipDraft, setClipDraft] = React.useState<{id: string; dIn: number; dOut: number; to?: number} | null>(null);
	const [filling, setFilling] = React.useState<string | null>(null);
	const [sfxDraft, setSfxDraft] = React.useState<{id: string; t: number} | null>(null);
	const sfx = React.useMemo(() => sfxEvents(L, p), [L, p]);
	const drag = React.useRef<Drag | null>(null);
	const scroller = React.useRef<HTMLDivElement>(null);
	const ph = React.useRef<HTMLDivElement>(null);
	const width = Math.max(total * pps + 60, 600);

	// plynulý ukazatel přehrávání (volá ho editor při každém snímku, bez Reactu)
	React.useEffect(() => {
		playheadRef.current = (t: number) => {
			if (ph.current) ph.current.style.left = `${t * pps}px`;
			const sc = scroller.current;
			if (sc && (t * pps < sc.scrollLeft || t * pps > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = t * pps - 80;
		};
		return () => {
			playheadRef.current = null;
		};
	}, [pps, playheadRef]);

	const laid = new Map(L.beats.map((b) => [b.id, b]));
	const beats = p.plan.beats ?? [];
	const beatStart = (b: Beat) => (draft?.id === b.id ? draft.start : laid.get(b.id)?.start);
	const beatDur = (b: Beat) => (draft?.id === b.id ? draft.dur : b.dur);

	// čas -> slovo, ke kterému se beat váže (+ jemný posun)
	const anchor = (t: number) => {
		let w = L.words[0];
		for (const x of L.words) if (x.start <= t + 0.001) w = x;
		return {wi: w.wi, shift: +(t - w.start).toFixed(3)};
	};
	const setBeats = (fn: (b: Beat[]) => Beat[]) => {
		const q = clone(ctx.latest());
		q.plan.beats = fn(q.plan.beats ?? []);
		ctx.update(q);
	};
	const updBeat = (id: string, patch: Partial<Beat>) => setBeats((bs) => bs.map((b) => (b.id === id ? {...b, ...patch} : b)));

	const onDown = (e: React.PointerEvent, what: 'beat' | 'clip' | 'sfx', id: string, type: Drag['type'], start: number, dur: number) => {
		e.stopPropagation();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		drag.current = {type, what, id, x0: e.clientX, start, dur, moved: false};
		setSel({kind: what, id});
	};
	const onMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dt = (e.clientX - d.x0) / pps;
		if (Math.abs(e.clientX - d.x0) > 3) d.moved = true;
		if (!d.moved) return;
		if (d.what === 'sfx') return setSfxDraft({id: d.id, t: Math.max(0, Math.round((d.start + dt) * 100) / 100)});
		if (d.what === 'beat') {
			const snap = (x: number) => Math.round(x * 20) / 20;
			if (d.type === 'move') setDraft({id: d.id, start: snap(Math.min(Math.max(0, d.start + dt), total - 0.3)), dur: d.dur});
			if (d.type === 'left') {
				const s = snap(Math.min(Math.max(0, d.start + dt), d.start + d.dur - 0.3));
				setDraft({id: d.id, start: s, dur: d.start + d.dur - s});
			}
			if (d.type === 'right') setDraft({id: d.id, start: d.start, dur: snap(Math.min(Math.max(0.3, d.dur + dt), total - d.start))});
		} else {
			if (d.type === 'left') setClipDraft({id: d.id, dIn: dt, dOut: 0});
			if (d.type === 'right') setClipDraft({id: d.id, dIn: 0, dOut: dt});
			if (d.type === 'move') {
				// kam klip pustit: podle středů ostatních klipů
				const x = d.start + d.dur / 2 + dt;
				let to = 0;
				L.clips.forEach((c, i) => {
					if (c.fromF / L.fps + c.durF / L.fps / 2 < x) to = i + 1;
				});
				setClipDraft({id: d.id, dIn: 0, dOut: 0, to});
			}
		}
	};
	const onUp = () => {
		const d = drag.current;
		drag.current = null;
		if (!d || !d.moved) {
			if (d?.what === 'beat') {
				const b = laid.get(d.id);
				if (b) ctx.seek(b.start + 0.05);
			}
			if (d?.what === 'sfx') ctx.seek(Math.max(0, d.start - 0.3));
			return;
		}
		if (d.what === 'sfx' && sfxDraft) {
			const ev = sfx.find((x) => x.id === d.id);
			const q = clone(ctx.latest());
			if (ev?.kind === 'custom') {
				const a = anchor(sfxDraft.t);
				q.plan.sounds = (q.plan.sounds ?? []).map((x) => (x.id === d.id ? {...x, wi: a.wi, shift: a.shift} : x));
			} else if (ev) {
				const e0 = q.plan.sfxEdit?.[d.id] ?? {};
				q.plan.sfxEdit = {...(q.plan.sfxEdit ?? {}), [d.id]: {...e0, dt: +((e0.dt ?? 0) + sfxDraft.t - ev.t).toFixed(2)}};
			}
			ctx.update(q);
			setSfxDraft(null);
			return;
		}
		if (d.what === 'beat' && draft) {
			const a = anchor(draft.start);
			const b = beats.find((x) => x.id === d.id);
			updBeat(d.id, {wi: a.wi, shift: a.shift, dur: +draft.dur.toFixed(2)});
			setDraft(null);
			// delší B-roll: záběr se musí připravit znovu (jinak by na konci zamrzl)
			if (b?.kind === 'broll' && b.broll?.mixkit && draft.dur > b.dur + 0.05) ctx.run('Připravuji delší B-roll', () => api.brollSet(p.id, {beatId: b.id, mixkit: b.broll!.mixkit!, title: b.broll!.title ?? '', dur: +draft.dur.toFixed(2)}));
		}
		if (d.what === 'clip' && clipDraft) {
			const q = clone(ctx.latest());
			const c = q.clips.find((x) => x.id === d.id)!;
			if (d.type === 'left') c.in = +Math.min(Math.max(0, c.in + clipDraft.dIn), c.out - 0.15).toFixed(3);
			if (d.type === 'right') c.out = +Math.min(Math.max(c.in + 0.15, c.out + clipDraft.dOut), p.source.duration).toFixed(3);
			if (d.type === 'move' && clipDraft.to !== undefined) {
				const on = q.clips.filter((x) => x.enabled);
				const from = on.findIndex((x) => x.id === d.id);
				const to = clipDraft.to > from ? clipDraft.to - 1 : clipDraft.to;
				if (to !== from) {
					const [m] = on.splice(from, 1);
					on.splice(to, 0, m);
					q.clips = [...on, ...q.clips.filter((x) => !x.enabled)];
				}
			}
			q.look.lockCut = true; // ruční střih: AI už věty nepřebírá
			setClipDraft(null);
			ctx.heavy(d.type === 'move' ? 'Přehazuji klip' : 'Ořezávám klip', {project: q});
		}
	};

	const addBeat = (kind: Beat['kind'], type: Gfx['type'] = 'reveal') => {
		const a = anchor(ctx.time);
		const b: Beat = {id: `t${Date.now().toString(36)}`, wi: a.wi, shift: a.shift, dur: kind === 'gfx' ? 2.6 : 1.8, kind};
		if (kind === 'gfx') Object.assign(b, {layout: OVERLAY.has(type) ? 'overlay' : 'full', gfx: gfxDefault(type), why: 'AI vyplňuje obsah z videa…'});
		if (kind === 'chip') b.chip = 'Nový štítek';
		setBeats((bs) => [...bs, b]);
		setSel({kind: 'beat', id: b.id});
		if (kind === 'gfx') fill(b.id, type, ctx.time);
	};
	// šablona se vyplní (nebo převede) obsahem z toho, co se v tom místě říká
	const fill = (id: string, type: string, at: number, prev?: Gfx, idea?: string) => {
		setFilling(id);
		api
			.gfxFill(p.id, type, at, prev, idea)
			.then(({gfx, dur}) => {
				const q = clone(ctx.latest());
				q.plan.beats = (q.plan.beats ?? []).map((x) => (x.id === id ? {...x, gfx, ...(dur ? {dur} : {}), why: gfx.times ? 'vyplněno a načasováno podle toho, co říkáš' : 'vyplněno z toho, co tu říkáš'} : x));
				ctx.update(q);
			})
			.catch(() => updBeat(id, {why: 'AI teď nepomohla – uprav text ručně'}))
			.finally(() => setFilling(null));
	};

	const at = (e: React.MouseEvent) => {
		const r = scroller.current!.getBoundingClientRect();
		ctx.seek(Math.max(0, (e.clientX - r.left + scroller.current!.scrollLeft) / pps));
	};
	const rowOf = (b: Beat) => (b.kind === 'gfx' ? 'gfx' : b.kind === 'broll' ? 'broll' : 'chip');
	const ticks = [];
	const step = pps > 60 ? 1 : pps > 25 ? 2 : 5;
	for (let s = 0; s <= total; s += step) ticks.push(s);
	const selBeat = sel?.kind === 'beat' ? beats.find((b) => b.id === sel.id) : null;
	const selClip = sel?.kind === 'clip' ? p.clips.find((c) => c.id === sel.id) : null;

	return (
		<div className="timeline" onPointerMove={onMove} onPointerUp={onUp}>
			<div className="tl-head">
				<b>Timeline</b>
				<span className="muted small">táhni = posun · okraje = délka · klik = úpravy</span>
				<div style={{flex: 1}} />
				<select className="tl-add" value="" onChange={(e) => e.target.value && addBeat('gfx', e.target.value as Gfx['type'])}>
					<option value="">+ Grafika…</option>
					<option value="custom">✨ Vytvořit vlastní na míru (AI)</option>
					{CATALOG.gfx.map((g) => (
						<option key={g.type} value={g.type}>
							{g.label}
						</option>
					))}
				</select>
				<button className="small" onClick={() => addBeat('chip')}>
					<Icon name="plus" /> Štítek
				</button>
				<button className="small" onClick={() => addBeat('punch')}>
					<Icon name="plus" /> Zoom
				</button>
				<button className={'small' + (sel?.kind === 'newbroll' ? ' active' : '')} onClick={() => setSel({kind: 'newbroll', id: ''})}>
					<Icon name="plus" /> B-roll
				</button>
				<button className={'small' + (sel?.kind === 'newsfx' ? ' active' : '')} onClick={() => setSel({kind: 'newsfx', id: ''})}>
					<Icon name="plus" /> Zvuk
				</button>
				{p.look.lockCut ? (
					<button className="small ghost" title="Střih je zamčený (ruční úpravy). AI ho nepřepočítá." onClick={() => ctx.update({...clone(p), look: {...p.look, lockCut: false}})}>
						🔒 Odemknout střih
					</button>
				) : null}
				<label className="tl-zoom">
					<Icon name="zoom" />
					<input type="range" min={10} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
				</label>
				<button className="ghost icon" onClick={onClose} title="Zavřít timeline">
					<Icon name="x" />
				</button>
			</div>
			<div className="tl-main">
				<div className="tl-labels">
					<div className="tl-ruler-l" />
					<div>Video</div>
					<div>Grafika</div>
					<div>B-roll</div>
					<div>Štítky · zoom</div>
					<div>Zvuky</div>
					<div>Titulky</div>
					<div>Hudba</div>
				</div>
				<div className="tl-scroll" ref={scroller}>
					<div className="tl-canvas" style={{width}}>
						<div className="tl-ruler" onMouseDown={at}>
							{ticks.map((s) => (
								<span key={s} style={{left: s * pps}}>
									{fmtTime(s)}
								</span>
							))}
						</div>
						{/* video: klipy */}
						<div className="tl-track" onMouseDown={at}>
							{L.clips.map((c, i) => {
								const cd = clipDraft?.id === c.id ? clipDraft : null;
								const s = c.fromF / L.fps + (cd?.dIn ?? 0);
								const d = c.durF / L.fps - (cd?.dIn ?? 0) + (cd?.dOut ?? 0);
								return (
									<div
										key={c.id}
										className={'tl-block clip' + (i % 2 ? ' b' : '') + (sel?.kind === 'clip' && sel.id === c.id ? ' sel' : '')}
										style={{left: s * pps, width: Math.max(4, d * pps - 1)}}
										onPointerDown={(e) => onDown(e, 'clip', c.id, 'move', c.fromF / L.fps, c.durF / L.fps)}
										title={`${(c.out - c.in).toFixed(1)} s`}
									>
										<i className="h l" onPointerDown={(e) => onDown(e, 'clip', c.id, 'left', 0, 0)} />
										<i className="h r" onPointerDown={(e) => onDown(e, 'clip', c.id, 'right', 0, 0)} />
									</div>
								);
							})}
							{clipDraft?.to !== undefined ? <div className="tl-drop" style={{left: (clipDraft.to < L.clips.length ? L.clips[clipDraft.to].fromF / L.fps : total) * pps}} /> : null}
						</div>
						{(['gfx', 'broll', 'chip'] as const).map((row) => (
							<div key={row} className="tl-track" onMouseDown={at}>
								{row === 'gfx' && p.look.hook && p.look.hook.visual !== 'none' && p.look.hook.visual !== 'broll' ? (
									<div className={'tl-block k-hook' + (sel?.kind === 'hook' ? ' sel' : '')} style={{left: 0, width: HOOK_END * pps - 1}} onPointerDown={(e) => (e.stopPropagation(), setSel({kind: 'hook', id: 'hook'}), ctx.seek(0.5))}>
										<span>Hook</span>
									</div>
								) : null}
								{beats
									.filter((b) => rowOf(b) === row)
									.map((b) => {
										const s = beatStart(b);
										if (s === undefined) return null;
										const d = beatDur(b);
										return (
											<div
												key={b.id}
												className={`tl-block k-${b.kind}` + (sel?.kind === 'beat' && sel.id === b.id ? ' sel' : '')}
												style={{left: s * pps, width: Math.max(10, d * pps - 1)}}
												onPointerDown={(e) => onDown(e, 'beat', b.id, 'move', s, d)}
											>
												<i className="h l" onPointerDown={(e) => onDown(e, 'beat', b.id, 'left', s, d)} />
												<span>{b.gfx ? GFX_LABEL[b.gfx.type] : b.kind === 'chip' ? b.chip : b.kind === 'broll' ? b.broll?.title ?? 'B-roll' : 'Zoom'}</span>
												<i className="h r" onPointerDown={(e) => onDown(e, 'beat', b.id, 'right', s, d)} />
											</div>
										);
									})}
							</div>
						))}
						{/* zvuky: každý efekt zvlášť */}
						<div className="tl-track" onMouseDown={at}>
							{sfx.map((ev) => {
								const t0 = sfxDraft?.id === ev.id ? sfxDraft.t : ev.t;
								return (
									<div
										key={ev.id}
										className={'tl-sfx' + (ev.kind === 'custom' ? ' own' : '') + (sel?.kind === 'sfx' && sel.id === ev.id ? ' sel' : '')}
										style={{left: t0 * pps}}
										title={ev.label}
										onPointerDown={(e) => onDown(e, 'sfx', ev.id, 'move', ev.t, 0)}
									>
										{pps > 50 ? ev.label : ''}
									</div>
								);
							})}
						</div>
						<div className="tl-track caps" onMouseDown={at}>
							{L.groups.map((g, i) => (
								<div key={i} className={'tl-cap' + (sel?.kind === 'cap' && sel.id === String(i) ? ' sel' : '')} style={{left: g.start * pps, width: Math.max(2, (g.end - g.start) * pps - 1)}} onMouseDown={(e) => (e.stopPropagation(), setSel({kind: 'cap', id: String(i)}), ctx.seek(g.start + 0.05))}>
									{pps > 40 ? g.words.map((w) => w.text).join(' ') : ''}
								</div>
							))}
						</div>
						<div className="tl-track" onMouseDown={at}>
							{p.look.music ? (
								<div className={'tl-music' + (sel?.kind === 'music' ? ' sel' : '')} style={{width: total * pps}} onMouseDown={(e) => (e.stopPropagation(), setSel({kind: 'music', id: 'music'}))}>
									<Icon name="music" /> {p.look.music.name}
								</div>
							) : (
								<button className="ghost small tl-addmusic" onMouseDown={(e) => (e.stopPropagation(), setSel({kind: 'music', id: 'music'}))}>
									+ Přidat hudbu
								</button>
							)}
						</div>
						<div className="tl-ph" ref={ph} style={{left: ctx.time * pps}} />
					</div>
				</div>
				<div className="tl-insp">
					{selBeat ? (
						<BeatInspector
							key={selBeat.id}
							b={selBeat}
							start={laid.get(selBeat.id)?.start}
							filling={filling === selBeat.id}
							youtube={p.format === '16:9'}
							upd={(patch) => updBeat(selBeat.id, patch)}
							remove={() => (setBeats((bs) => bs.filter((x) => x.id !== selBeat.id)), setSel(null))}
							duplicate={() => {
								const n = {...structuredClone(selBeat), id: `t${Date.now().toString(36)}`, shift: (selBeat.shift ?? 0) + selBeat.dur + 0.2};
								setBeats((bs) => [...bs, n]);
								setSel({kind: 'beat', id: n.id});
							}}
							swap={(type) => {
								const prev = selBeat.gfx;
								updBeat(selBeat.id, {gfx: gfxDefault(type), layout: OVERLAY.has(type) ? 'overlay' : selBeat.layout === 'overlay' ? 'full' : selBeat.layout, why: 'AI přizpůsobuje šablonu videu…'});
								fill(selBeat.id, type, laid.get(selBeat.id)?.start ?? ctx.time, prev);
							}}
							refill={(idea?: string) => selBeat.gfx && fill(selBeat.id, selBeat.gfx.type, laid.get(selBeat.id)?.start ?? ctx.time, selBeat.gfx, idea)}
							resync={() => ctx.run('Načasovávám podle řeči', () => api.syncBeats(p.id, selBeat.id))}
							brollPick={(c) => ctx.run('Měním B-roll', () => api.brollSet(p.id, {beatId: selBeat.id, mixkit: c.id, title: c.title}))}
							projectId={p.id}
						/>
					) : sel?.kind === 'sfx' ? (
						<SfxInspector key={sel.id} ev={sfx.find((x) => x.id === sel.id)} ctx={ctx} close={() => setSel(null)} />
					) : sel?.kind === 'newsfx' ? (
						<NewSfx
							time={ctx.time}
							add={(item) => {
								const a = anchor(ctx.time);
								const q = clone(ctx.latest());
								const id = `s${Date.now().toString(36)}`;
								q.plan.sounds = [...(q.plan.sounds ?? []), {id, wi: a.wi, shift: a.shift, file: item.file, vol: 0.6, name: item.name}];
								ctx.update(q);
								setSel({kind: 'sfx', id});
							}}
						/>
					) : sel?.kind === 'cap' ? (
						<CapInspector key={sel.id} ctx={ctx} L={L} index={Number(sel.id)} />
					) : sel?.kind === 'music' ? (
						<MusicInspector ctx={ctx} />
					) : sel?.kind === 'hook' ? (
						<HookInspector ctx={ctx} />
					) : sel?.kind === 'newbroll' ? (
						<div className="insp">
							<b>Nový B-roll na {ctx.time.toFixed(1)} s</b>
							<span className="muted small">Najdi záběr (anglicky, např. „woman sleeping“) a klikni na něj. Záběry jsou zdarma z Mixkitu.</span>
							<BrollPicker
								projectId={p.id}
								alts={[]}
								pick={(c) => {
									const a = anchor(ctx.time);
									setSel(null);
									ctx.run('Přidávám B-roll', () => api.brollSet(p.id, {mixkit: c.id, title: c.title, wi: a.wi, shift: a.shift, dur: 1.8}));
								}}
							/>
						</div>
					) : selClip ? (
						<div className="insp">
							<b>Klip</b>
							<span className="muted small">
								zdroj {selClip.in.toFixed(2)}–{selClip.out.toFixed(2)} s · {(selClip.out - selClip.in).toFixed(2)} s
							</span>
							<p className="muted small">Táhni klip na jiné místo = přehození. Táhni okraje = ořez. Po puštění se náhled přepočítá.</p>
							<button
								onClick={() => {
									const lc = L.clips.find((c) => c.id === selClip.id)!;
									const tIn = ctx.time - lc.fromF / L.fps;
									if (tIn < 0.15 || tIn > lc.durF / L.fps - 0.15) return alert('Posuň přehrávání dovnitř klipu (aspoň 0,15 s od okraje).');
									const q = clone(ctx.latest());
									const i = q.clips.findIndex((c) => c.id === selClip.id);
									const c = q.clips[i];
									const cut = +(c.in + tIn).toFixed(3);
									q.clips.splice(i, 1, {...c, out: cut}, {...c, id: `${c.id}s${Date.now().toString(36).slice(-3)}`, in: cut});
									q.look.lockCut = true;
									ctx.heavy('Rozděluji klip', {project: q});
								}}
							>
								<Icon name="cut" /> Rozdělit v místě přehrávání
							</button>
							<button
								className="danger"
								onClick={() => {
									const q = clone(ctx.latest());
									q.clips = q.clips.map((c) => (c.id === selClip.id ? {...c, enabled: false, reason: 'vystřiženo ručně'} : c));
									q.look.lockCut = true;
									setSel(null);
									ctx.heavy('Vystřihuji klip', {project: q});
								}}
							>
								<Icon name="trash" /> Vystřihnout klip
							</button>
						</div>
					) : (
						<div className="insp empty-insp">
							<Icon name="sliders" />
							<span className="muted small">Klikni na grafiku, štítek, zoom nebo klip a uprav ho tady.</span>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

const BeatInspector: React.FC<{
	b: Beat;
	start?: number;
	filling: boolean;
	youtube: boolean;
	upd: (p: Partial<Beat>) => void;
	remove: () => void;
	duplicate: () => void;
	swap: (type: Gfx['type']) => void;
	refill: (idea?: string) => void;
	resync: () => void;
	brollPick: (c: {id: string; title: string}) => void;
	projectId: string;
}> = ({b, start, filling, youtube, upd, remove, duplicate, swap, refill, resync, brollPick, projectId}) => {
	const [idea, setIdea] = React.useState('');
	const [tab, setTab] = React.useState<'text' | 'look' | 'sound'>('text');
	return (
		<div className="insp">
			<div className="row" style={{gap: 6}}>
				<span className={'kind-tag k-' + b.kind}>{KIND_LABEL[b.kind]}</span>
				<span className="muted small">{start !== undefined ? `${start.toFixed(2)} s · ${b.dur.toFixed(1)} s` : 'u vystřižené věty'}</span>
				<div style={{flex: 1}} />
				<button className="ghost icon" title="Duplikovat" onClick={duplicate}>
					<Icon name="plus" />
				</button>
				<button className="ghost icon danger" title="Smazat" onClick={remove}>
					<Icon name="trash" />
				</button>
			</div>
			{b.why ? (
				<span className="muted small">
					{filling ? <span className="spin" /> : null} {b.why}
				</span>
			) : null}
			{b.kind === 'gfx' || b.kind === 'chip' ? (
				<div className="seg small-seg">
					<button className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>
						Obsah
					</button>
					<button className={tab === 'look' ? 'on' : ''} onClick={() => setTab('look')}>
						Pozice a font
					</button>
					<button className={tab === 'sound' ? 'on' : ''} onClick={() => setTab('sound')}>
						Zvuk
					</button>
				</div>
			) : null}
			{b.kind === 'gfx' && b.gfx && tab === 'text' ? (
				<>
					<label className="insp-f">
						<span>Šablona (při změně ji AI přizpůsobí tomu, co tu říkáš)</span>
						<select value={b.gfx.type} onChange={(e) => swap(e.target.value as Gfx['type'])}>
							{CATALOG.gfx.map((g) => (
								<option key={g.type} value={g.type}>
									{g.label}
								</option>
							))}
						</select>
					</label>
					<label className="insp-f">
						<span>Rozložení</span>
						<select value={b.layout ?? 'full'} onChange={(e) => upd({layout: e.target.value as Beat['layout']})}>
							<option value="full">Přes celou obrazovku</option>
							<option value="overlay">Přes záběr (mluvčí vidět)</option>
							{!youtube ? <option value="split">Půlka (nahoře grafika, dole mluvčí)</option> : null}
							{youtube ? <option value="pip">Mluvčí v rohu</option> : null}
						</select>
					</label>
					{b.gfx.type === 'custom' ? (
						<div className="custom-idea">
							<span className="insp-l">Co má grafika ukázat? (AI ji navrhne na míru ve stylu videa)</span>
							<div className="row" style={{gap: 6}}>
								<input value={idea} placeholder="např. 3 kroky večerní rutiny s ikonami" onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && refill(idea)} />
								<button className="small primary" disabled={filling} onClick={() => refill(idea)}>
									✨ Vytvořit
								</button>
							</div>
						</div>
					) : null}
					<GfxFields g={b.gfx} set={(g) => upd({gfx: g})} />
					<div className="row" style={{gap: 6, flexWrap: 'wrap'}}>
						<button className="ghost small" onClick={() => refill()} disabled={filling}>
							<Icon name="ai" /> Přepsat obsah podle videa
						</button>
						<button className="ghost small" onClick={resync} title="Každá položka naskočí přesně ve chvíli, kdy ji řekneš">
							<Icon name="clock" /> Načasovat podle řeči
						</button>
					</div>
					{b.gfx.times ? <span className="muted small">Položky naskakují podle řeči: {b.gfx.times.map((x) => x.toFixed(1) + ' s').join(' · ')}</span> : null}
				</>
			) : null}
			{b.kind === 'chip' && tab === 'text' ? (
				<label className="insp-f">
					<span>Text štítku</span>
					<input value={b.chip ?? ''} onChange={(e) => upd({chip: e.target.value})} />
				</label>
			) : null}
			{(b.kind === 'gfx' || b.kind === 'chip') && tab === 'look' ? (
				<>
					{b.kind === 'gfx' ? (
						<label className="insp-f">
							<span>Font grafiky</span>
							<FontSelect value={b.font} allowDefault="Font stylu videa" onChange={(f) => upd({font: f})} />
						</label>
					) : null}
					<span className="insp-l">Pozice a velikost</span>
					<PosEditor pos={b.pos} set={(pos) => upd({pos})} />
				</>
			) : null}
			{(b.kind === 'gfx' || b.kind === 'chip') && tab === 'sound' ? <BeatSfx value={b.sfx} set={(v) => upd({sfx: v})} /> : null}
			{b.kind === 'punch' ? <p className="muted small">Zoom na mluvčího po dobu bloku. Druh zoomu nastavíš v záložce Styl.</p> : null}
			{b.kind === 'broll' ? (
				<>
					<div className="broll-now">
						{b.broll?.mixkit ? <img src={`https://assets.mixkit.co/videos/${b.broll.mixkit}/${b.broll.mixkit}-thumb-360-0.jpg`} alt="" /> : null}
						<span className="small">{b.broll?.title ?? b.broll?.query}</span>
					</div>
					<span className="insp-l">Jiný záběr – vyber z nalezených nebo vyhledej</span>
					<BrollPicker projectId={projectId} alts={b.broll?.alts ?? []} pick={brollPick} initial={b.broll?.query} />
				</>
			) : null}
			<label className="insp-f">
				<span>Délka {b.dur.toFixed(1)} s</span>
				<input type="range" min={0.4} max={8} step={0.1} value={b.dur} onChange={(e) => upd({dur: Number(e.target.value)})} />
			</label>
		</div>
	);
};

// výběr B-rollu: nalezené alternativy + vlastní hledání (náhledy z Mixkitu)
const BrollPicker: React.FC<{projectId: string; alts: {id: string; title: string}[]; pick: (c: {id: string; title: string}) => void; initial?: string}> = ({projectId, alts, pick, initial = ''}) => {
	const [q, setQ] = React.useState(initial);
	const [found, setFound] = React.useState<{id: string; title: string}[] | null>(null);
	const [busy, setBusy] = React.useState(false);
	const search = async () => {
		if (!q.trim()) return;
		setBusy(true);
		setFound(await api.brollSearch(projectId, q).catch(() => []));
		setBusy(false);
	};
	const list = found ?? alts;
	return (
		<div className="broll-pick">
			<div className="row" style={{gap: 6}}>
				<input value={q} placeholder="hledat záběr (anglicky)" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
				<button className="small" onClick={search} disabled={busy}>
					{busy ? '…' : 'Hledat'}
				</button>
			</div>
			{list.length ? (
				<div className="broll-grid">
					{list.map((c) => (
						<button key={c.id} className="broll-c" onClick={() => pick(c)} title={c.title}>
							<img src={`https://assets.mixkit.co/videos/${c.id}/${c.id}-thumb-360-0.jpg`} alt="" loading="lazy" />
							<span>{c.title}</span>
						</button>
					))}
				</div>
			) : (
				<span className="muted small">{found ? 'Nic nenalezeno – zkus jiná slova.' : 'Zatím žádné další záběry – vyhledej.'}</span>
			)}
		</div>
	);
};

// ---------------------------------------------------------------- inspektory: zvuk, nový zvuk, titulek, hudba, hook
const SfxInspector: React.FC<{ev?: SfxEvent; ctx: Ctx; close: () => void}> = ({ev, ctx, close}) => {
	if (!ev) return <div className="insp muted small">Zvuk už není (změnila se grafika).</div>;
	const p = ctx.project;
	const setEdit = (patch: {off?: boolean; file?: string; vol?: number; dt?: number} | null) => {
		const q = clone(ctx.latest());
		if (ev.kind === 'custom') {
			q.plan.sounds = (q.plan.sounds ?? []).flatMap((x) => (x.id !== ev.id ? [x] : patch?.off ? [] : [{...x, ...(patch?.file ? {file: patch.file} : {}), ...(patch?.vol !== undefined ? {vol: patch.vol} : {})}]));
		} else {
			const e = {...(q.plan.sfxEdit ?? {})};
			if (patch === null) delete e[ev.id];
			else e[ev.id] = {...(e[ev.id] ?? {}), ...patch};
			q.plan.sfxEdit = e;
		}
		ctx.update(q);
		if (patch?.off) close();
	};
	return (
		<div className="insp">
			<div className="row" style={{gap: 6}}>
				<span className={'kind-tag k-sfx'}>Zvuk</span>
				<span className="muted small">
					{ev.t.toFixed(2)} s · {ev.kind === 'custom' ? 'přidaný tebou' : `automaticky (${ev.label})`}
				</span>
			</div>
			<div className="row" style={{gap: 8}}>
				<PlayButton src={'/' + ev.file} seconds={3} />
				<span className="small">{ev.file.split('/').pop()}</span>
			</div>
			<label className="insp-f">
				<span>Hlasitost {Math.round(ev.v * 100)} %</span>
				<input type="range" min={0.05} max={1} step={0.05} value={ev.v} onChange={(e) => setEdit({vol: Number(e.target.value)})} />
			</label>
			<span className="insp-l">Vyměnit za jiný efekt</span>
			<SfxChooser onPick={(it) => setEdit({file: it.file})} current={ev.file} />
			<div className="row" style={{gap: 6}}>
				<button className="danger small" onClick={() => setEdit({off: true})}>
					<Icon name="trash" /> {ev.kind === 'custom' ? 'Smazat' : 'Vypnout tenhle zvuk'}
				</button>
				{ev.kind === 'auto' && p.plan.sfxEdit?.[ev.id] ? (
					<button className="ghost small" onClick={() => setEdit(null)}>
						Vrátit původní
					</button>
				) : null}
			</div>
			<p className="muted small">Posun v čase: táhni blok zvuku v timeline.</p>
		</div>
	);
};

// výběr efektu z knihovny (kategorie + poslech) + nahrání vlastního
const SfxChooser: React.FC<{onPick: (it: SfxItem) => void; current?: string}> = ({onPick, current}) => {
	const [lib, setLib] = React.useState<SfxItem[]>([]);
	const [cat, setCat] = React.useState('whoosh');
	const [up, setUp] = React.useState(false);
	React.useEffect(() => {
		loadSfx().then(setLib);
	}, []);
	const items = lib.filter((x) => (cat === 'own' ? x.own : x.cat === cat));
	return (
		<div className="beat-sfx">
			<select value={cat} onChange={(e) => setCat(e.target.value)}>
				<option value="own">★ Moje vlastní zvuky</option>
				{SFX_CATS.map((c) => (
					<option key={c.cat} value={c.cat}>
						{c.label} – {c.use}
					</option>
				))}
			</select>
			<div className="sfx-list">
				{items.map((x) => (
					<div key={x.id} className={'sfx-row' + (current === x.file ? ' on' : '')} onClick={() => onPick(x)}>
						<PlayButton src={'/' + x.file} seconds={3} />
						<span>{x.name}</span>
						{current === x.file ? <Icon name="check" /> : null}
					</div>
				))}
				{!items.length ? <span className="muted small">Zatím nic – nahraj svůj zvuk níž.</span> : null}
			</div>
			<label className="drop small" style={{padding: 10}}>
				<Icon name="upload" /> {up ? 'Nahrávám…' : 'Nahrát vlastní zvuk (MP3 / WAV)'}
				<input
					type="file"
					accept="audio/*"
					hidden
					onChange={async (e) => {
						const f = e.target.files?.[0];
						if (!f) return;
						setUp(true);
						try {
							const it = await api.uploadSfx(f, cat === 'own' ? 'whoosh' : cat);
							resetSfx();
							setLib(await loadSfx());
							onPick(it);
						} catch (err) {
							alert('Nahrání se nepovedlo: ' + (err as Error).message);
						}
						setUp(false);
					}}
				/>
			</label>
		</div>
	);
};

const NewSfx: React.FC<{time: number; add: (it: SfxItem) => void}> = ({time, add}) => (
	<div className="insp">
		<b>Nový zvuk na {time.toFixed(1)} s</b>
		<span className="muted small">Vyber efekt z knihovny nebo nahraj svůj. Uloží se do tvé knihovny a půjde použít i v dalších videích.</span>
		<SfxChooser onPick={add} />
	</div>
);

const CapInspector: React.FC<{ctx: Ctx; L: Layout; index: number}> = ({ctx, L, index}) => {
	const g = L.groups[index];
	const [text, setText] = React.useState(g ? g.words.map((w) => w.text).join(' ') : '');
	if (!g) return null;
	const p = ctx.project;
	const save = () => {
		const parts = text.trim().split(/\s+/);
		const q = clone(ctx.latest());
		if (parts.length === g.words.length) g.words.forEach((w, i) => (q.words[w.wi].text = parts[i]));
		else {
			const idx = g.words.map((w) => w.wi);
			const a = q.words[idx[0]];
			const b = q.words[idx[idx.length - 1]];
			const span = b.end - a.start;
			q.words.splice(idx[0], idx[idx.length - 1] - idx[0] + 1, ...parts.map((x, i) => ({text: x, start: a.start + (span * i) / parts.length, end: a.start + (span * (i + 1)) / parts.length})));
		}
		ctx.update(q);
	};
	const toggleKey = (wi: number) => {
		const q = clone(ctx.latest());
		const k = new Set(q.plan.keywords);
		k.has(wi) ? k.delete(wi) : k.add(wi);
		q.plan.keywords = [...k];
		ctx.update(q);
	};
	return (
		<div className="insp">
			<b>Titulek {g.start.toFixed(1)} s</b>
			<label className="insp-f">
				<span>Text (Enter = uložit)</span>
				<input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} onBlur={save} />
			</label>
			<span className="insp-l">Klíčová slova (zvýrazněná) – klikni na slovo</span>
			<div className="cap-words">
				{g.words.map((w) => (
					<button key={w.wi} className={'chip' + (w.key ? ' on' : '')} onClick={() => toggleKey(w.wi)}>
						{caseText(w.text, p.captions.textCase)}
					</button>
				))}
			</div>
			<p className="muted small">Vzhled všech titulků (font, barvy, aktivní slovo…) změníš v záložce Titulky vpravo nebo napiš AI dole.</p>
		</div>
	);
};

const MusicInspector: React.FC<{ctx: Ctx}> = ({ctx}) => {
	const p = ctx.project;
	const [lib, setLib] = React.useState<{id: string; file: string; cat: string; name: string; duration: number}[]>([]);
	const [cat, setCat] = React.useState('');
	React.useEffect(() => {
		api.musicLib().then(setLib).catch(() => {});
	}, []);
	const set = (music: Project['look']['music']) => ctx.update({...clone(ctx.latest()), look: {...ctx.latest().look, music}});
	const cats = [...new Set(lib.map((m) => m.cat))];
	const c = cat || p.plan.mood || cats[0];
	return (
		<div className="insp">
			<b>Hudba</b>
			{p.look.music ? (
				<>
					<div className="row" style={{gap: 8}}>
						{p.look.music.file.startsWith('music/') ? <PlayButton src={'/' + p.look.music.file} /> : null}
						<span className="small">{p.look.music.name}</span>
					</div>
					<label className="insp-f">
						<span>Hlasitost {Math.round(p.look.music.volume * 100)} %</span>
						<input type="range" min={0.05} max={1} step={0.05} value={p.look.music.volume} onChange={(e) => set({...p.look.music!, volume: Number(e.target.value)})} />
					</label>
					<button className="danger small" onClick={() => set(null)}>
						<Icon name="trash" /> Bez hudby
					</button>
				</>
			) : (
				<span className="muted small">Video teď nemá hudbu.</span>
			)}
			<span className="insp-l">Jiná skladba</span>
			<select value={c} onChange={(e) => setCat(e.target.value)}>
				{cats.map((x) => (
					<option key={x} value={x}>
						{x}
					</option>
				))}
			</select>
			<div className="sfx-list">
				{lib
					.filter((m) => m.cat === c)
					.map((m) => (
						<div key={m.id} className={'sfx-row' + (p.look.music?.file === m.file ? ' on' : '')} onClick={() => set({file: m.file, name: `${m.name} (Mixkit, ${m.cat})`, volume: p.look.music?.volume ?? 0.5})}>
							<PlayButton src={'/' + m.file} />
							<span>{m.name}</span>
						</div>
					))}
			</div>
		</div>
	);
};

const HookInspector: React.FC<{ctx: Ctx}> = ({ctx}) => {
	const p = ctx.project;
	const h = p.look.hook ?? {visual: 'title' as const, sfx: false, text: ''};
	const set = (patch: Partial<typeof h>) => ctx.update({...clone(ctx.latest()), look: {...ctx.latest().look, hook: {...h, ...patch}}});
	return (
		<div className="insp">
			<b>Hook (první 2 s)</b>
			<label className="insp-f">
				<span>Text</span>
				<input value={h.text || p.plan.hook || ''} onChange={(e) => set({text: e.target.value})} />
			</label>
			<label className="insp-f">
				<span>Vzhled</span>
				<select value={h.visual} onChange={(e) => set({visual: e.target.value as typeof h.visual})}>
					{CATALOG.hooks.map((x) => (
						<option key={x.id} value={x.id}>
							{x.label}
						</option>
					))}
				</select>
			</label>
			<label className="check small">
				<input type="checkbox" checked={h.sfx} onChange={(e) => set({sfx: e.target.checked})} /> Výrazný zvuk na začátku
			</label>
		</div>
	);
};
