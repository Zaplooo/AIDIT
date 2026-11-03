import React from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {api, ChatMsg, Job, Meta, Style, Version, waitJob} from '../api';
import {baseKey, FORMATS, fmtTime, layout, Project, SAFE_916} from '../model';
import {Edit} from '../remotion/Edit';
import {Builder} from './Builder';
import {AiBar} from './AiBar';
import {Timeline} from './Timeline';
import {Icon} from './Mocks';
import {AiPanel, SidePanels} from './Panels';
import {ExportDialog} from './ExportDialog';

export type Ctx = {
	project: Project;
	update: (p: Project) => void; // lehká úprava (titulky, karty, barvy) – hned, bez přepočtu
	heavy: (label: string, body: Parameters<typeof api.apply>[1]) => Promise<void>; // změna střihu – přepočet na serveru
	seek: (s: number) => void;
	time: number;
	styles: Style[];
	busy: boolean;
	latest: () => Project; // aktuální projekt (pro asynchronní úpravy, např. když AI dovyplní grafiku)
	run: (label: string, fn: () => Promise<unknown>) => Promise<void>; // operace na serveru (např. výměna B-rollu) + načtení výsledku
};

function useHistory() {
	const [s, setS] = React.useState<{past: Project[]; cur: Project | null; future: Project[]}>({past: [], cur: null, future: []});
	return {
		project: s.cur,
		reset: (p: Project) => setS({past: [], cur: p, future: []}),
		commit: (p: Project) => setS((x) => ({past: x.cur ? [...x.past.slice(-99), x.cur] : x.past, cur: p, future: []})),
		replace: (p: Project) => setS((x) => ({...x, cur: p})),
		undo: () => setS((x) => (x.past.length ? {past: x.past.slice(0, -1), cur: x.past[x.past.length - 1], future: x.cur ? [x.cur, ...x.future] : x.future} : x)),
		redo: () => setS((x) => (x.future.length ? {past: x.cur ? [...x.past, x.cur] : x.past, cur: x.future[0], future: x.future.slice(1)} : x)),
		canUndo: s.past.length > 0,
		canRedo: s.future.length > 0,
	};
}

export const Editor: React.FC<{id: string}> = ({id}) => {
	const [meta, setMeta] = React.useState<Meta | null>(null);
	const [job, setJob] = React.useState<Job | null>(null);
	const [styles, setStyles] = React.useState<Style[]>([]);
	const [serverProject, setServerProject] = React.useState<Project | null>(null);
	const [wizardDone, setWizardDone] = React.useState(false);
	const h = useHistory();
	const project = h.project;
	const [busy, setBusy] = React.useState<string | null>(null);
	const [frame, setFrame] = React.useState(0);
	const [playing, setPlaying] = React.useState(false);
	const [safe, setSafe] = React.useState(false);
	const [exporting, setExporting] = React.useState(false);
	const [versions, setVersions] = React.useState<Version[] | null>(null);
	const [toast, setToast] = React.useState<string | null>(null);
	const player = React.useRef<PlayerRef>(null);
	const frameRef = React.useRef(0);
	const phRef = React.useRef<HTMLDivElement>(null);
	const tcRef = React.useRef<HTMLSpanElement>(null);
	const latestRef = React.useRef<Project | null>(null);
	const [tlOpen, setTlOpen] = React.useState(true); // timeline je hlavní místo úprav – otevřená od začátku
	const [showText, setShowText] = React.useState(false); // přepis a seznam vět jen na vyžádání
	const tlPlayhead = React.useRef<((t: number) => void) | null>(null);
	const [cmdMsgs, setCmdMsgs] = React.useState<ChatMsg[]>([]);
	const [cmdBusy, setCmdBusy] = React.useState(false);

	React.useEffect(() => {
		api.styles().then(setStyles);
	}, []);

	// načtení + sledování zpracování
	React.useEffect(() => {
		let stop = false;
		const tick = async () => {
			const r = await api.project(id).catch(() => null);
			if (stop || !r) return;
			setMeta(r.meta);
			setJob(r.job);
			if (r.meta.answers?.done) setWizardDone(true);
			if (r.project) {
				setServerProject(r.project);
				if (!h.project) h.reset(r.project);
			}
			if (r.meta.status !== 'ready' && r.meta.status !== 'error') setTimeout(tick, 1000);
		};
		tick();
		return () => {
			stop = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	// automatické ukládání lehkých úprav
	React.useEffect(() => {
		if (!project || busy) return;
		const t = setTimeout(() => api.save(project), 500);
		return () => clearTimeout(t);
	}, [project, busy]);

	React.useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 4500);
		return () => clearTimeout(t);
	}, [toast]);

	const L = React.useMemo(() => (project ? layout(project) : null), [project]);

	React.useEffect(() => {
		const p = player.current;
		if (!p) return;
		// Během přehrávání se panely aktualizují jen 4× za sekundu (překreslování celého editoru 30×/s brzdilo přehrávač).
		// Ukazatel na timeline a čas se kreslí napřímo (bez Reactu), takže jsou plynulé.
		let last = 0;
		const onF = (e: {detail: {frame: number}}) => {
			const f = e.detail.frame;
			frameRef.current = f;
			const fps = p.getContainerNode() ? (L?.fps ?? 30) : 30;
			if (phRef.current && L) phRef.current.style.left = `${((f / fps) / (L.durationInFrames / fps)) * 100}%`;
			tlPlayhead.current?.(f / fps);
			if (tcRef.current && L) tcRef.current.textContent = `${fmtTime(f / fps)} / ${fmtTime(L.durationInFrames / fps)}`;
			const now = performance.now();
			if (!p.isPlaying() || now - last > 250) {
				last = now;
				setFrame(f);
			}
		};
		const onPlay = () => setPlaying(true);
		const onPause = () => {
			setPlaying(false);
			setFrame(frameRef.current);
		};
		p.addEventListener('frameupdate', onF);
		p.addEventListener('play', onPlay);
		p.addEventListener('pause', onPause);
		return () => {
			p.removeEventListener('frameupdate', onF);
			p.removeEventListener('play', onPlay);
			p.removeEventListener('pause', onPause);
		};
	}, [L != null, wizardDone]);

	const reload = async () => {
		const r = await api.project(id);
		if (r.project) h.commit(r.project);
	};

	const heavy: Ctx['heavy'] = async (label, body) => {
		if (!project) return;
		player.current?.pause();
		setBusy(label);
		await api.saveVersion(project, `Před změnou: ${label}`).catch(() => {});
		try {
			const j = await api.apply(id, body);
			const done = j.status === 'running' ? await waitJob(j.id, (x) => setBusy(x.step)) : j;
			if (done.status === 'error') setToast('Nepovedlo se: ' + done.error);
			await reload();
		} finally {
			setBusy(null);
		}
	};

	// klávesy: mezerník, Ctrl+Z / Ctrl+Y
	React.useEffect(() => {
		const on = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
			if (e.code === 'Space') {
				e.preventDefault();
				player.current?.toggle();
			} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
				e.preventDefault();
				e.shiftKey ? h.redo() : h.undo();
			} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
				e.preventDefault();
				h.redo();
			}
		};
		addEventListener('keydown', on);
		return () => removeEventListener('keydown', on);
	}, [h]);

	if (!meta) return <div className="center muted">Načítám…</div>;

	// rychlý režim („Sestříhat“): žádný průvodce, jen průběh – hotové video se otevře samo
	if (meta.answers?.autoRun && !wizardDone && meta.status !== 'error') return <Processing meta={meta} job={job} onManual={() => api.answers(id, {autoRun: false}).then(() => location.reload())} />;

	if (!wizardDone || !project || !L) {
		return (
			<Builder
				meta={meta}
				job={job}
				project={serverProject}
				onDone={async () => {
					const r = await api.project(id);
					if (r.project) h.reset(r.project);
					setWizardDone(true);
				}}
			/>
		);
	}

	const F = FORMATS[project.format];
	const fps = L.fps;
	const time = frame / fps;
	const total = L.durationInFrames / fps;
	const seek = (s: number) => player.current?.seekTo(Math.max(0, Math.min(L.durationInFrames - 1, Math.round(s * fps))));
	const stale = baseKey(project) !== project.base.key;
	const style = styles.find((s) => s.id === project.look.preset);
	latestRef.current = project;
	const run: Ctx['run'] = async (label, fn) => {
		player.current?.pause();
		setBusy(label);
		try {
			await new Promise((r) => setTimeout(r, 60)); // poslední úprava se stihne propsat
			await api.save(latestRef.current!);
			await fn();
			await reload();
		} catch (e) {
			setToast('Nepovedlo se: ' + (e as Error).message.slice(0, 140));
		} finally {
			setBusy(null);
		}
	};
	const ctx: Ctx = {project, update: h.commit, heavy, seek, time, styles, busy: Boolean(busy), latest: () => latestRef.current!, run};

	// AI lišta: pokyn -> AI změní projekt na serveru (případně přestříhá) -> načíst a skočit na místo změny
	const runCommand = async (text: string) => {
		const m = [...cmdMsgs, {role: 'user' as const, text}];
		setCmdMsgs(m);
		setCmdBusy(true);
		player.current?.pause();
		try {
			await api.save(project);
			await api.saveVersion(project, `Před pokynem: ${text.slice(0, 40)}`).catch(() => {});
			const r = await api.command(project.id, text, cmdMsgs, time);
			setCmdMsgs([...m, {role: 'ai', text: r.reply}]);
			if (r.job && r.job.status === 'running') {
				setBusy(r.job.step);
				await waitJob(r.job.id, (x) => setBusy(x.step));
				setBusy(null);
			}
			await reload();
			if (r.seek != null) setTimeout(() => seek(r.seek!), 300);
		} catch (e) {
			setCmdMsgs([...m, {role: 'ai', text: 'Nepovedlo se: ' + (e as Error).message.slice(0, 160)}]);
		}
		setCmdBusy(false);
	};

	const openVersions = async () => setVersions(versions ? null : await api.versions(project.id));
	const restore = async (v: Version) => {
		const r = await api.version(project.id, v.id);
		setVersions(null);
		await heavy(`Obnovit „${v.label}“`, {project: r.project});
	};

	return (
		<div className={'editor' + (tlOpen ? ' tl-open' : '') + (showText ? '' : ' no-left')}>
			<header className="topbar">
				<button className="ghost icon" onClick={() => (location.hash = meta.clientId ? `#c/${meta.clientId}` : '')} title={meta.clientId ? 'Klient' : 'Domů'}>
					<Icon name="back" />
				</button>
				<div className="title">
					<b>{project.name}</b>
					<span className="muted small">
						{style?.name ?? project.look.preset} · {project.format} · {fmtTime(total)}
					</span>
				</div>
				<div style={{flex: 1}} />
				<button className={'ghost' + (showText ? ' active' : '')} onClick={() => setShowText(!showText)} title="Přepis videa: které věty jsou ve videu a které vystřižené">
					<Icon name="text" /> Přepis
				</button>
				<button className="ghost icon" onClick={h.undo} disabled={!h.canUndo || Boolean(busy)} title="Zpět (Ctrl+Z)">
					<Icon name="undo" />
				</button>
				<button className="ghost icon" onClick={h.redo} disabled={!h.canRedo || Boolean(busy)} title="Znovu (Ctrl+Y)">
					<Icon name="redo" />
				</button>
				<div style={{position: 'relative'}}>
					<button className="ghost" onClick={openVersions}>
						<Icon name="history" /> Verze
					</button>
					{versions ? (
						<div className="menu">
							<div
								className="mi"
								onClick={async () => {
									await api.saveVersion(project, `Uloženo ${new Date().toLocaleTimeString('cs-CZ', {hour: '2-digit', minute: '2-digit'})}`);
									setVersions(null);
									setToast('Verze uložená');
								}}
							>
								<b>+ Uložit aktuální stav</b>
							</div>
							{versions.map((v) => (
								<div key={v.id} className="mi" onClick={() => restore(v)}>
									{v.label}
									<div className="muted small">{new Date(v.createdAt).toLocaleString('cs-CZ')}</div>
								</div>
							))}
						</div>
					) : null}
				</div>
				<button className="primary" onClick={() => setExporting(true)} disabled={Boolean(busy)}>
					<Icon name="export" /> Exportovat
				</button>
			</header>

			{showText ? <AiPanel ctx={ctx} L={L} /> : null}

			<section className="stage">
				<div className="player-wrap" style={{aspectRatio: `${F.w} / ${F.h}`}}>
					<Player
						ref={player}
						component={Edit}
						inputProps={{project, mediaBase: `/media/${project.id}/`, quality: 'preview', scale: 0.5}}
						durationInFrames={L.durationInFrames}
						compositionWidth={F.w / 2}
						compositionHeight={F.h / 2}
						fps={fps}
						style={{width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden'}}
						clickToPlay
						acknowledgeRemotionLicense
					/>
					{safe && project.format === '9:16' ? <SafeZones /> : null}
					{busy || stale ? (
						<div className="stage-busy">
							<div className="spinner" />
							<span>{busy ?? 'Přepočítávám náhled…'}</span>
						</div>
					) : null}
				</div>
				<div className="transport">
					<button className="play" onClick={() => player.current?.toggle()}>
						<Icon name={playing ? 'pause' : 'play'} />
					</button>
					<span className="tc" ref={tcRef}>
						{fmtTime(time)} / {fmtTime(total)}
					</span>
					<div style={{flex: 1}} />
					<button className={'small' + (tlOpen ? ' active' : '')} onClick={() => setTlOpen(!tlOpen)} title="Otevřít timeline: posun, délka a pozice grafiky, ořez klipů">
						<Icon name="sliders" /> Timeline
					</button>
					{project.format === '9:16' ? (
						<button className={'ghost small' + (safe ? ' active' : '')} onClick={() => setSafe(!safe)} title="Kam zasahuje rozhraní Instagramu a TikToku">
							<Icon name="eye" /> Safe zóny
						</button>
					) : null}
				</div>
				{!tlOpen ? <MiniTimeline project={project} L={L} time={time} seek={seek} phRef={phRef} /> : null}
				<div className="cmd-bar">
					<AiBar messages={cmdMsgs} busy={cmdBusy} onSend={runCommand} placeholder="Napiš AI, co změnit: „titulky větší“, „přidej grafiku se seznamem na 0:12“, „už je to sestříhané, nech střih“, „klidnější hudba“…" />
				</div>
			</section>

			<SidePanels ctx={ctx} L={L} />

			{tlOpen ? <Timeline ctx={ctx} L={L} onClose={() => setTlOpen(false)} playheadRef={tlPlayhead} /> : null}
			{exporting ? <ExportDialog project={project} onClose={() => setExporting(false)} /> : null}
			{toast ? <div className="toast">{toast}</div> : null}
		</div>
	);
};

const MiniTimeline: React.FC<{project: Project; L: ReturnType<typeof layout>; time: number; seek: (s: number) => void; phRef: React.RefObject<HTMLDivElement | null>}> = React.memo(({L, time, seek, phRef}) => {
	const total = L.durationInFrames / L.fps;
	const ref = React.useRef<HTMLDivElement>(null);
	const at = (e: React.MouseEvent) => {
		const r = ref.current!.getBoundingClientRect();
		seek(((e.clientX - r.left) / r.width) * total);
	};
	const pct = (s: number) => `${(s / total) * 100}%`;
	return (
		<div
			className="mini-tl"
			ref={ref}
			onMouseDown={(e) => {
				at(e);
				const move = (ev: MouseEvent) => at(ev as unknown as React.MouseEvent);
				const up = () => {
					removeEventListener('mousemove', move);
					removeEventListener('mouseup', up);
				};
				addEventListener('mousemove', move);
				addEventListener('mouseup', up);
			}}
		>
			<div className="row clips">
				{L.clips.map((c, i) => (
					<div key={c.id} className={i % 2 ? 'b' : 'a'} style={{left: pct(c.fromF / L.fps), width: pct(c.durF / L.fps)}} />
				))}
			</div>
			<div className="row cards">
				{L.cards.map((c) => (
					<div key={c.id} style={{left: pct(c.start), width: pct(c.end - c.start)}} title={c.text} />
				))}
				{L.beats.map((b) => (
					<div key={b.id} className={'k-' + b.kind} style={{left: pct(b.start), width: pct(b.end - b.start)}} title={b.why ?? b.kind} />
				))}
			</div>
			<div className="row caps">
				{L.groups.map((g, i) => (
					<div key={i} style={{left: pct(g.start), width: pct(Math.max(g.end - g.start - 0.02, 0.05))}} />
				))}
			</div>
			<div className="ph" ref={phRef} style={{left: pct(time)}} />
			<div className="legend">
				<span className="l1">střihy</span>
				<span className="l2">grafika</span>
				<span className="l4">B-roll</span>
				<span className="l5">štítek / přiblížení</span>
				<span className="l3">titulky</span>
			</div>
		</div>
	);
});

const SafeZones: React.FC = () => {
	const pct = (v: number, of: number) => `${(v / of) * 100}%`;
	const s = SAFE_916;
	return (
		<div className="safe">
			<div style={{left: 0, right: 0, top: 0, height: pct(s.top, 1920)}}>
				<span>horní lišta</span>
			</div>
			<div style={{left: 0, right: 0, bottom: 0, height: pct(s.bottom, 1920)}}>
				<span>popisek, jméno, hudba</span>
			</div>
			<div style={{right: 0, top: pct(s.top, 1920), bottom: pct(s.bottom, 1920), width: pct(s.right, 1080)}}>
				<span style={{writingMode: 'vertical-rl'}}>tlačítka</span>
			</div>
		</div>
	);
};

const Processing: React.FC<{meta: Meta; job: Job | null; onManual: () => void}> = ({meta, job, onManual}) => {
	const log = job?.log ?? [];
	return (
		<div className="processing">
			<div className="box">
				<div className="brand small">
					<img src="/aidit-logo.png" alt="" className="brand-logo" /> AIDIT
				</div>
				<h2 style={{margin: 0}}>Stříhám „{meta.name}“</h2>
				<span className="muted">{job?.step ?? 'Začínám'}…</span>
				<div className="bar big">
					<div style={{width: `${Math.max(3, (job?.progress ?? 0) * 100)}%`}} />
				</div>
				<div className="ailog">
					{log.slice(-12).map((l, i) => (
						<div key={i} className={l.line.startsWith('AI:') || l.line.startsWith('•') || l.line.startsWith('Kontrola') ? 'ai' : ''}>
							{l.line}
						</div>
					))}
				</div>
				<span className="muted small">Hotové video se tu otevře samo. Pak v něm můžeš cokoliv upravit (timeline, titulky, grafika, AI lišta).</span>
				<button className="ghost small" style={{alignSelf: 'flex-start'}} onClick={onManual}>
					Chci si to radši nastavit sám (průvodce)
				</button>
			</div>
		</div>
	);
};
