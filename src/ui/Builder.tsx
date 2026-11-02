import React from 'react';
import {Answers, api, ChatMsg, Client, Job, Meta, MusicTrack, Preview, waitJob} from '../api';
import type {Project} from '../model';
import {CutMode, label, Setup, withDefaults} from '../setup';
import {AiBar} from './AiBar';
import {Icon} from './Mocks';
import {SETUP_STEPS, SetupSummary, StepKey, StepView} from './SetupSteps';

// Průvodce u videa: o videu (chat) -> barva -> písmo a titulky -> motion grafika -> zoomy -> hook -> hudba -> tempo -> souhrn.
// Dole je pořád AI lišta: co napíšeš, AI rovnou nastaví (a v kartách je to hned vidět). Video se mezitím zpracovává.

type Key = 'chat' | StepKey | 'summary';
const STEPS: {key: Key; label: string; icon: string}[] = [{key: 'chat', label: 'O videu', icon: 'chat'}, ...SETUP_STEPS.map((s) => ({key: s.key as Key, label: s.label, icon: s.icon})), {key: 'summary', label: 'Souhrn', icon: 'check'}];

const STAGES = [
	{k: 'Převádím', l: 'Převod videa'},
	{k: 'Přepisuji', l: 'Přepis řeči'},
	{k: 'kontroluje přepis', l: 'Kontrola češtiny'},
	{k: 'Rozdělil|nechávám', l: 'Výběr vět'},
	{k: 'Stříhám|Skládám klipy', l: 'Střih podle zvuku'},
	{k: 'promýšlí', l: 'AI plán střihu'},
	{k: 'B-roll', l: 'B-roll'},
	{k: 'náhled', l: 'Náhled'},
];

const CUT_MODES: {v: CutMode; l: string; h: string}[] = [
	{v: 'full', l: 'Surový záznam', h: 'AI vybere povedené pokusy a vystřihne přeřeknutí'},
	{v: 'pauses', l: 'Natočeno po kouscích', h: 'nechá všechny věty, jen zkrátí pauzy'},
	{v: 'none', l: 'Už je sestříhané', h: 'nic nestříhá, jen přidá grafiku, titulky a zvuk'},
];

export const Builder: React.FC<{meta: Meta; job: Job | null; project: Project | null; onDone: () => void}> = ({meta, job, project, onDone}) => {
	const platform = meta.answers?.platform ?? (meta.answers?.format === '16:9' ? 'youtube' : 'reels');
	const [setup, setSetup] = React.useState<Setup>(() => withDefaults(meta.answers?.setup, platform));
	const [step, setStep] = React.useState(0);
	const [msgs, setMsgs] = React.useState<ChatMsg[]>(
		meta.answers?.chat ?? [
			{
				role: 'ai',
				text: meta.answers?.preset?.startsWith('ref-')
					? 'Ahoj! Styl z tvého odkazu mám převzatý (titulky, grafiku, tempo i zvuk). O čem je tohle video? A chceš oproti vzoru něco jinak – třeba barvu, hudbu nebo víc/míň grafiky?'
					: meta.clientId
					? 'Ahoj! Styl klienta mám načtený. Řekni mi, o čem tohle video je a jestli chceš oproti stylu něco změnit – nebo rovnou klikni na Souhrn a stříhám.'
					: 'Ahoj! O čem video je, pro koho a jak si ho představuješ? Klidně napiš i konkrétní věci (hudbu, grafiku, tempo…) – rovnou je nastavím.',
			},
		],
	);
	const [busy, setBusy] = React.useState(false);
	const [applying, setApplying] = React.useState<string | null>(null);
	const [music, setMusic] = React.useState<MusicTrack[]>([]);
	const [client, setClient] = React.useState<Client | null>(null);
	const [toast, setToast] = React.useState<string | null>(null);
	const [script, setScript] = React.useState(meta.answers?.script ?? '');
	const [cutMode, setCutMode] = React.useState<CutMode>(meta.answers?.cutMode ?? 'full');
	const [order, setOrder] = React.useState<number[]>(meta.answers?.order ?? (meta.sources ?? []).map((_, i) => i));
	const [aiAns, setAiAns] = React.useState<Record<string, string>>({});
	const [title, setTitle] = React.useState('');
	const ready = Boolean(project);
	const s = STEPS[step];

	React.useEffect(() => {
		api.musicLib().then(setMusic).catch(() => {});
		if (meta.clientId) api.client(meta.clientId).then(setClient).catch(() => {});
	}, [meta.clientId]);
	// nastavení se průběžně ukládá (zpracování ho použije, i když průvodce ještě neskončil)
	React.useEffect(() => {
		const t = setTimeout(() => api.answers(meta.id, {setup}), 600);
		return () => clearTimeout(t);
	}, [setup, meta.id]);
	React.useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 4000);
		return () => clearTimeout(t);
	}, [toast]);

	const set = (patch: Partial<Setup>) => setSetup((x) => ({...x, ...patch, hook: {...x.hook, ...(patch.hook ?? {})}, music: patch.music ? {...patch.music} : x.music}));

	const ask = async (text: string) => {
		const m = [...msgs, {role: 'user' as const, text}];
		setMsgs(m);
		setBusy(true);
		try {
			const r = await api.assist(meta.id, {messages: m, setup, step: s.key});
			setMsgs([...m, {role: 'ai', text: r.reply, previews: r.previews}]);
			const keys = Object.keys(r.setup ?? {});
			if (keys.length) {
				set(r.setup);
				setToast('AI nastavila: ' + keys.map((k) => ({color: 'barvu', bg: 'pozadí', font: 'písmo', caption: 'titulky', captionsOn: 'titulky', gfx: 'grafiku', gfxAmount: 'množství grafiky', zoom: 'zoom', hook: 'hook', music: 'hudbu', sfx: 'efekty', broll: 'B-roll', tempo: 'tempo', maxLength: 'délku', layout: 'rozložení'})[k] ?? k).join(', '));
			}
			if (r.goto) {
				const i = STEPS.findIndex((x) => x.key === r.goto);
				if (i >= 0 && i !== step && s.key !== 'chat') setStep(i);
			}
		} catch (e) {
			setMsgs([...m, {role: 'ai', text: 'Teď mi nejde odpovědět (' + (e as Error).message.slice(0, 140) + '). Vybírej klidně ručně, nic se neztratí.'}]);
		}
		setBusy(false);
	};
	const pickForMe = () => ask(`Vyber za mě: ${SETUP_STEPS.find((x) => x.key === s.key)?.title ?? s.label}. Ať to sedí k videu.`);
	const onPreview = (p: Preview) => {
		if (p.kind === 'gfx' && !setup.gfx.includes(p.id)) set({gfx: [...setup.gfx, p.id]});
		if (p.kind === 'zoom') set({zoom: p.id as Setup['zoom']});
		if (p.kind === 'hook') set({hook: {...setup.hook, visual: p.id as Setup['hook']['visual']}});
		if (p.kind === 'color') set({color: p.id});
	};

	// stav zpracování po krocích
	const log = job?.log ?? [];
	const stageIdx = (() => {
		let k = -1;
		STAGES.forEach((st, i) => {
			if (log.some((l) => new RegExp(st.k).test(l.line))) k = i;
		});
		return meta.status === 'ready' ? STAGES.length : k;
	})();

	const questions = (project?.plan?.questions ?? []).filter((q) => q.id !== 'length');
	const finish = async () => {
		setApplying('Ukládám nastavení…');
		const answers: Answers = {setup, script, cutMode, order: order.length > 1 ? order : undefined, done: true};
		try {
			const j = await api.finishSetup(meta.id, {...answers, ...(aiAns.hook ? {first: aiAns.hook} : {}), ...(title || aiAns.title ? {title: title || aiAns.title} : {})} as Answers);
			if (j.status === 'running') await waitJob(j.id, (x) => setApplying(x.step));
			onDone();
		} catch (e) {
			setApplying(null);
			alert('Nepovedlo se: ' + (e as Error).message);
		}
	};
	const saveMeta = (patch: Answers) => api.answers(meta.id, patch);
	const multi = (meta.sources?.length ?? 0) > 1;
	const move = (i: number, d: number) => {
		const n = [...order];
		const j = i + d;
		if (j < 0 || j >= n.length) return;
		[n[i], n[j]] = [n[j], n[i]];
		setOrder(n);
		saveMeta({order: n});
	};

	return (
		<div className="builder">
			<aside className="wz-side">
				<div className="brand small">
					<a href={meta.clientId ? `#c/${meta.clientId}` : '#'}>
						<img src="/aidit-logo.png" alt="" className="brand-logo" /> AIDIT
					</a>
				</div>
				<div className="wz-file">
					<b>{meta.name}</b>
					<span className="muted small">
						{client ? `${client.name} · ` : ''}
						{platform === 'youtube' ? 'YouTube 16:9' : `Krátké video ${meta.answers?.format ?? '9:16'}`}
						{multi ? ` · ${meta.sources!.length} klipy` : ''}
					</span>
				</div>
				<div className="stages">
					{STAGES.map((st, i) => (
						<div key={st.l} className={'stage-row' + (i < stageIdx ? ' done' : i === stageIdx ? ' on' : '')}>
							<span className="dot">{i < stageIdx ? <Icon name="check" /> : i === stageIdx ? <span className="spin" /> : null}</span>
							{st.l}
						</div>
					))}
				</div>
				{meta.status !== 'ready' && meta.status !== 'error' ? (
					<div className="bar">
						<div style={{width: `${(job?.progress ?? 0) * 100}%`}} />
					</div>
				) : null}
				<h4>
					<Icon name="ai" /> Co AI dělá
				</h4>
				<div className="ailog">
					{log.slice(-10).map((l, i) => (
						<div key={i} className={l.line.startsWith('AI:') || l.line.startsWith('•') ? 'ai' : ''}>
							{l.line}
						</div>
					))}
					{meta.status === 'error' ? <div className="err">{meta.error}</div> : null}
				</div>
			</aside>

			<main className="b-main">
				<nav className="b-steps">
					{STEPS.map((x, i) => (
						<button key={x.key} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)}>
							<span className="b-num">{i < step ? <Icon name="check" /> : i + 1}</span>
							{x.label}
						</button>
					))}
				</nav>

				<div className="b-body">
					{client && s.key === 'chat' ? (
						<div className="client-banner">
							<span className="dot-c big" style={{background: client.setup.color}} />
							<div>
								<b>Styl klienta {client.name} je načtený</b>
								<span className="muted small">
									{label.caption(client.setup.caption)} · {client.setup.gfx.length ? `${client.setup.gfx.length} šablon grafiky` : 'grafiku vybere AI'} · zoom {label.zoom(client.setup.zoom).toLowerCase()} · hook {label.hook(client.setup.hook.visual).toLowerCase()}
								</span>
							</div>
							<div style={{flex: 1}} />
							<button className="primary" onClick={() => setStep(STEPS.length - 1)}>
								Rovnou stříhat se stylem klienta
							</button>
						</div>
					) : null}

					{s.key === 'chat' ? (
						<div className="chat-page">
							<div>
								<h1>Řekni mi o videu</h1>
								<p className="muted">To, co napíšeš, je hlavní zadání: AI podle toho nastaví výběr v dalších krocích a podle toho video sestříhá.</p>
								<AiBar big messages={msgs} busy={busy} onSend={ask} setup={setup} onPreview={onPreview} placeholder="Např.: Video o spánku pro mladé, dynamické, modrá barva, hodně grafiky, energická hudba, hook ať je provokativní…" />
							</div>
							<div className="chat-side">
								<div className="side-card">
									<b>Jak je video natočené?</b>
									{CUT_MODES.map((c) => (
										<label key={c.v} className={'radio-card' + (cutMode === c.v ? ' on' : '')}>
											<input type="radio" checked={cutMode === c.v} onChange={() => (setCutMode(c.v), saveMeta({cutMode: c.v}))} />
											<span>
												<b>{c.l}</b>
												<span className="muted small">{c.h}</span>
											</span>
										</label>
									))}
									{meta.status !== 'queued' && meta.status !== 'processing' ? null : <span className="muted small">Změna se projeví ve střihu.</span>}
								</div>
								{multi ? (
									<div className="side-card">
										<b>Pořadí klipů</b>
										<span className="muted small">Ve videu budou přesně v tomhle pořadí.</span>
										{order.map((k, i) => (
											<div key={k} className="clip-row">
												<span className="clip-n">{i + 1}</span>
												<span className="clip-name">{meta.sources![k]?.name}</span>
												<button className="ghost icon" onClick={() => move(i, -1)} disabled={i === 0}>
													<Icon name="up" />
												</button>
												<button className="ghost icon" onClick={() => move(i, 1)} disabled={i === order.length - 1}>
													<Icon name="down" />
												</button>
											</div>
										))}
									</div>
								) : null}
								<div className="side-card">
									<b>Scénář (nepovinné)</b>
									<span className="muted small">Když ho vložíš, AI podle něj opraví slova v titulcích (jména, čísla) a vybere správné pokusy.</span>
									<textarea rows={5} value={script} placeholder="Sem vlož text, který ve videu říkáš…" onChange={(e) => setScript(e.target.value)} onBlur={() => saveMeta({script})} />
								</div>
							</div>
						</div>
					) : null}

					{s.key !== 'chat' && s.key !== 'summary' ? (
						<>
							<div className="b-head">
								<h1>{SETUP_STEPS.find((x) => x.key === s.key)!.title}</h1>
								<button className="ghost" onClick={pickForMe} disabled={busy}>
									<Icon name="ai" /> Vyber za mě
								</button>
							</div>
							<StepView step={s.key as StepKey} ctx={{setup, set, projectId: meta.id, music, platform, ready}} />
						</>
					) : null}

					{s.key === 'summary' ? (
						<div className="summary-page">
							<h1>Souhrn – takhle to sestříhám</h1>
							<p className="muted">Klikni na řádek a změň, co chceš. Všechno půjde upravit i potom v editoru (nebo napsat AI dole).</p>
							<SetupSummary setup={setup} go={(k) => setStep(STEPS.findIndex((x) => x.key === k))} />
							<div className="sum-extra">
								<span className="muted small">Střih: {CUT_MODES.find((c) => c.v === cutMode)?.l}</span>
								{script ? <span className="muted small">· scénář vložený</span> : null}
								{multi ? <span className="muted small">· {order.length} klipy v pořadí {order.map((k) => k + 1).join(', ')}</span> : null}
							</div>
							{ready && questions.length ? (
								<div className="ai-qs">
									<h3 className="sub-h">AI se ptá k videu</h3>
									{questions.map((q) => (
										<div key={q.id} className="ai-q">
											<b>{q.question}</b>
											<div className="ai-opts">
												{q.options.map((o) => (
													<button key={o.value} className={'choice wide' + (aiAns[q.id] === o.value ? ' on' : '')} onClick={() => setAiAns({...aiAns, [q.id]: o.value})}>
														<span>{o.label}</span>
														{o.hint ? <span className="muted small">{o.hint}</span> : null}
													</button>
												))}
											</div>
											{q.id === 'title' ? <input className="own" value={title} placeholder="…nebo napiš vlastní nadpis" onChange={(e) => setTitle(e.target.value)} /> : null}
										</div>
									))}
								</div>
							) : null}
							{!ready ? (
								<div className="wait-note">
									<div className="spinner small" /> Video se ještě zpracovává ({job?.step ?? 'čekám'}). Jakmile bude hotové, stříhám podle tohohle nastavení.
								</div>
							) : null}
						</div>
					) : null}
				</div>

				<div className="b-foot">
					{s.key !== 'chat' ? <AiBar messages={msgs} busy={busy} onSend={ask} setup={setup} onPreview={onPreview} placeholder="Napiš AI, co chceš (např. „dej tam jen čísla a seznamy“, „chci klidnější hudbu“)…" /> : null}
					<div className="wz-nav">
						<button className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
							<Icon name="back" /> Zpět
						</button>
						<div style={{flex: 1}} />
						{step < STEPS.length - 1 ? (
							<button className="primary" onClick={() => setStep(step + 1)}>
								Další: {STEPS[step + 1].label}
							</button>
						) : (
							<button className="primary big" disabled={!ready || Boolean(applying)} onClick={finish}>
								{applying ?? (ready ? 'Stříhej!' : 'Čekám na dokončení zpracování…')}
							</button>
						)}
					</div>
				</div>
			</main>
			{toast ? <div className="toast">{toast}</div> : null}
		</div>
	);
};
