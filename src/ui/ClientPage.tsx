import React from 'react';
import {api, ChatMsg, Client, Meta, MusicTrack} from '../api';
import {label, musicLabel, Setup, withDefaults} from '../setup';
import {AiBar} from './AiBar';
import {ProjectRow} from './Home';
import {Icon} from './Mocks';
import {SETUP_STEPS, StepKey, StepView} from './SetupSteps';

// Stránka klienta: jeho uložený styl + jeho videa + nové video (už s přednastaveným stylem).
export const ClientPage: React.FC<{id: string}> = ({id}) => {
	const [c, setC] = React.useState<Client | null>(null);
	const [projects, setProjects] = React.useState<Meta[]>([]);
	React.useEffect(() => {
		api.client(id).then(setC).catch(() => (location.hash = ''));
		api.projects().then((ps) => setProjects(ps.filter((p) => p.clientId === id)));
	}, [id]);
	if (!c) return <div className="center muted">Načítám…</div>;
	const s = c.setup;
	return (
		<div className="page">
			<header className="page-head">
				<button className="ghost icon" onClick={() => (location.hash = '')} title="Domů">
					<Icon name="back" />
				</button>
				<span className="cc-initial small" style={{background: s.color}}>
					{c.name.slice(0, 1).toUpperCase()}
				</span>
				<div>
					<h1>{c.name}</h1>
					<span className="muted small">{c.platform === 'youtube' ? 'YouTube 16:9' : 'Reels / TikTok / Shorts'} · {projects.length} videí</span>
				</div>
				<div style={{flex: 1}} />
				<button
					className="ghost danger"
					onClick={async () => {
						if (!confirm(`Smazat klienta ${c.name}? Jeho videa zůstanou.`)) return;
						await api.removeClient(c.id);
						location.hash = '';
					}}
				>
					<Icon name="trash" />
				</button>
				<button onClick={() => (location.hash = `#c/${c.id}/styl`)}>
					<Icon name="sliders" /> Upravit styl
				</button>
				<button className="primary big" onClick={() => (location.hash = `#new/${c.id}`)}>
					<Icon name="plus" /> Nové video
				</button>
			</header>
			<section className="style-card">
				<h3>Uložený styl</h3>
				<div className="style-chips">
					<span className="schip">
						<span className="dot-c" style={{background: s.color}} /> {label.color(s.color)} · {label.bg(s.bg)}
					</span>
					<span className="schip">Písmo: {s.font}</span>
					<span className="schip">Titulky: {s.captionsOn ? label.caption(s.caption) : 'vypnuté'}</span>
					<span className="schip">Grafika: {s.gfx.length ? s.gfx.map(label.gfx).join(', ') : 'vybere AI'}</span>
					<span className="schip">Zoom: {label.zoom(s.zoom)}</span>
					<span className="schip">Hook: {label.hook(s.hook.visual)}</span>
					<span className="schip">Hudba: {musicLabel(s.music)}</span>
					<span className="schip">Tempo: {s.tempo === 'calm' ? 'klidné' : s.tempo === 'normal' ? 'svižné' : 'rychlé'}</span>
				</div>
				<p className="muted small">Každé nové video tohoto klienta začne s tímhle stylem. U konkrétního videa ho můžeš změnit, aniž by se změnil uložený styl.</p>
			</section>
			<section>
				<div className="sec-head">
					<h3>Videa</h3>
				</div>
				{projects.length ? (
					<div className="proj-list">
						{projects.map((p) => (
							<ProjectRow key={p.id} p={p} />
						))}
					</div>
				) : (
					<div className="empty" onClick={() => (location.hash = `#new/${c.id}`)}>
						Zatím žádné video. <b>Nahraj první</b>.
					</div>
				)}
			</section>
		</div>
	);
};

// Úprava stylu klienta: stejné kroky jako u videa + AI lišta, uloží se do klienta.
export const ClientStyle: React.FC<{id: string}> = ({id}) => {
	const [c, setC] = React.useState<Client | null>(null);
	const [setup, setSetup] = React.useState<Setup | null>(null);
	const [step, setStep] = React.useState<StepKey>('color');
	const [music, setMusic] = React.useState<MusicTrack[]>([]);
	const [msgs, setMsgs] = React.useState<ChatMsg[]>([{role: 'ai', text: 'Popiš mi styl klienta (obor, publikum, nálada, barvy značky) a nastavím ho – nebo vybírej ručně krok po kroku.'}]);
	const [busy, setBusy] = React.useState(false);
	const [saved, setSaved] = React.useState(false);
	React.useEffect(() => {
		api.client(id).then((x) => {
			setC(x);
			setSetup(withDefaults(x.setup, x.platform));
		});
		api.musicLib().then(setMusic).catch(() => {});
	}, [id]);
	if (!c || !setup) return <div className="center muted">Načítám…</div>;
	const set = (patch: Partial<Setup>) => {
		setSaved(false);
		setSetup((x) => ({...x!, ...patch, hook: {...x!.hook, ...(patch.hook ?? {})}, music: patch.music ? {...patch.music} : x!.music}));
	};
	const save = async () => {
		await api.saveClient(c.id, {setup});
		setSaved(true);
	};
	const ask = async (text: string) => {
		const m = [...msgs, {role: 'user' as const, text}];
		setMsgs(m);
		setBusy(true);
		try {
			const r = await api.assist(null, {messages: m, setup, step, name: c.name});
			setMsgs([...m, {role: 'ai', text: r.reply, previews: r.previews}]);
			if (Object.keys(r.setup ?? {}).length) set(r.setup);
			if (r.goto && SETUP_STEPS.some((x) => x.key === r.goto)) setStep(r.goto as StepKey);
		} catch (e) {
			setMsgs([...m, {role: 'ai', text: 'Teď mi nejde odpovědět (' + (e as Error).message.slice(0, 120) + ').'}]);
		}
		setBusy(false);
	};
	const idx = SETUP_STEPS.findIndex((x) => x.key === step);
	return (
		<div className="builder no-side">
			<main className="b-main">
				<header className="page-head slim">
					<button className="ghost icon" onClick={() => (location.hash = `#c/${c.id}`)}>
						<Icon name="back" />
					</button>
					<div>
						<h2>Styl klienta {c.name}</h2>
						<span className="muted small">Nastav jednou – každé nové video ho převezme.</span>
					</div>
					<div style={{flex: 1}} />
					<button className={saved ? 'ghost' : 'primary'} onClick={save}>
						<Icon name="check" /> {saved ? 'Uloženo' : 'Uložit styl'}
					</button>
				</header>
				<nav className="b-steps">
					{SETUP_STEPS.map((x, i) => (
						<button key={x.key} className={x.key === step ? 'on' : i < idx ? 'done' : ''} onClick={() => setStep(x.key)}>
							<span className="b-num">{i + 1}</span>
							{x.label}
						</button>
					))}
				</nav>
				<div className="b-body">
					<div className="b-head">
						<h1>{SETUP_STEPS[idx].title}</h1>
						<button className="ghost" disabled={busy} onClick={() => ask(`Vyber za mě: ${SETUP_STEPS[idx].title}. Ať to sedí ke klientovi.`)}>
							<Icon name="ai" /> Vyber za mě
						</button>
					</div>
					<StepView step={step} ctx={{setup, set, projectId: null, music, platform: c.platform}} />
				</div>
				<div className="b-foot">
					<AiBar messages={msgs} busy={busy} onSend={ask} setup={setup} placeholder="Např.: fitness trenérka, energická, růžová a černá, hodně čísel a seznamů…" />
					<div className="wz-nav">
						<button className="ghost" disabled={idx === 0} onClick={() => setStep(SETUP_STEPS[idx - 1].key)}>
							<Icon name="back" /> Zpět
						</button>
						<div style={{flex: 1}} />
						{idx < SETUP_STEPS.length - 1 ? (
							<button className="primary" onClick={() => setStep(SETUP_STEPS[idx + 1].key)}>
								Další: {SETUP_STEPS[idx + 1].label}
							</button>
						) : (
							<button
								className="primary big"
								onClick={async () => {
									await save();
									location.hash = `#c/${c.id}`;
								}}
							>
								Uložit styl klienta
							</button>
						)}
					</div>
				</div>
			</main>
		</div>
	);
};
