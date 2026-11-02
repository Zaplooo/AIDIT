import React from 'react';
import {api, Client, Style} from '../api';
import {CATALOG, CutMode} from '../setup';
import {Icon} from './Mocks';

const FORMATS = [
	{v: '9:16', platform: 'reels', title: 'Na výšku', sub: 'Reels · TikTok · Shorts'},
	{v: '16:9', platform: 'youtube', title: 'Na šířku', sub: 'YouTube · web · TV'},
	{v: '1:1', platform: 'reels', title: 'Čtverec', sub: 'feed · reklama'},
] as const;

const CUT_MODES: {v: CutMode; l: string; h: string}[] = [
	{v: 'full', l: 'Surový záznam', h: 'AI vybere povedené pokusy, vystřihne přeřeknutí a zakoktání'},
	{v: 'pauses', l: 'Natočeno po kouscích', h: 'nechá všechny věty, jen zkrátí pauzy'},
	{v: 'none', l: 'Už je sestříhané', h: 'nic nestříhá, jen titulky, grafika a zvuk'},
];

const BRIEF_HINT: Record<string, string> = {
	product: 'Např.: Hodinky Goat One – titan, safírové sklo, 5 ATM, cena 4 990 Kč, objednávky na goat.cz',
	realestate: 'Např.: Byt 3+kk, Praha 7 – Holešovice, 85 m², balkon, sklep, 12 490 000 Kč, RE/MAX Jana Nováková',
	ad: 'Např.: Kavárna Bean – nová sezónní káva, jen do konce listopadu, Vinohradská 12',
};

const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const q = () => new URLSearchParams(location.hash.split('?')[1] ?? '');

// Nové video: vyber, co stříháš (typ / odkaz / naučený styl), nahraj, napiš pár slov a „Sestříhat“. Nic víc není potřeba.
export const NewVideo: React.FC<{clientId: string | null}> = ({clientId}) => {
	const [client, setClient] = React.useState<Client | null>(null);
	const [typeId, setTypeId] = React.useState<string | null>(() => q().get('type'));
	const refUrl = React.useMemo(() => q().get('ref'), []);
	const styleId = React.useMemo(() => q().get('style'), []);
	const [style, setStyle] = React.useState<Style | null>(null);
	const vtype = CATALOG.types.find((t) => t.id === typeId) ?? null;
	const montage = vtype?.speech === false;
	const [format, setFormat] = React.useState<(typeof FORMATS)[number]>(() => FORMATS.find((f) => f.v === (vtype?.format ?? '9:16')) ?? FORMATS[0]);
	const [cutMode, setCutMode] = React.useState<CutMode>('full');
	const [files, setFiles] = React.useState<File[]>([]);
	const [brief, setBrief] = React.useState('');
	const [script, setScript] = React.useState('');
	const [name, setName] = React.useState('');
	const [maxLength, setMaxLength] = React.useState<number | null>(null);
	const [wizard, setWizard] = React.useState(false);
	const [more, setMore] = React.useState(false);
	const [over, setOver] = React.useState(false);
	const [uploading, setUploading] = React.useState<number | null>(null);
	const input = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		if (clientId)
			api.client(clientId).then((c) => {
				setClient(c);
				setFormat(FORMATS.find((f) => f.v === c.format) ?? FORMATS[0]);
			});
		if (styleId) api.styles().then((l) => setStyle(l.find((s) => s.id === styleId) ?? null));
	}, [clientId, styleId]);
	React.useEffect(() => {
		if (vtype) setFormat(FORMATS.find((f) => f.v === vtype.format) ?? FORMATS[0]);
	}, [typeId]);

	const add = (list: FileList | null) => {
		const vids = [...(list ?? [])].filter((f) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|mkv|webm)$/i.test(f.name));
		if (!vids.length) return;
		vids.sort((a, b) => a.name.localeCompare(b.name, 'cs', {numeric: true}));
		setFiles((cur) => [...cur, ...vids]);
	};
	const move = (i: number, d: number) =>
		setFiles((cur) => {
			const n = [...cur];
			const j = i + d;
			if (j < 0 || j >= n.length) return cur;
			[n[i], n[j]] = [n[j], n[i]];
			return n;
		});
	const start = async () => {
		if (!files.length) return;
		setUploading(0);
		try {
			const styleSetup = styleId ? await api.styleSetup(styleId) : null;
			const answers = {
				format: format.v,
				platform: format.platform,
				videoType: typeId ?? undefined,
				cutMode: montage ? ('montage' as CutMode) : cutMode,
				brief: brief.trim() || undefined,
				script: script.trim() || undefined,
				maxLength,
				refUrl: refUrl ?? undefined,
				autoRun: !wizard,
				...(styleSetup ? {setup: {...styleSetup, maxLength}, preset: styleId!} : {}),
			};
			const {id} = await api.upload(files, {answers, clientId, name: name.trim()}, setUploading);
			location.hash = `#p/${id}`;
		} catch (e) {
			alert('Nahrání selhalo: ' + (e as Error).message);
			setUploading(null);
		}
	};

	const chosen = Boolean(vtype || refUrl || styleId || client);
	const title = client ? `Nové video pro ${client.name}` : refUrl ? 'Sestříhat podle odkazu' : style ? `Ve stylu „${style.name}“` : vtype ? vtype.label : 'Co chceš stříhat?';
	const sub = client
		? 'Použije se uložený styl klienta.'
		: refUrl
			? 'Během zpracování si rozeberu video z odkazu a tvoje video sestříhám stejně (tempo, titulky, grafika, hudba).'
			: style
				? style.summary ?? style.description
				: vtype
					? vtype.desc
					: 'Vyber typ videa – každý má hotové přednastavení. Nebo vlož odkaz na video, které se ti líbí.';

	return (
		<div className="page narrow">
			<header className="page-head">
				<button className="ghost icon" onClick={() => (chosen && !clientId && !refUrl && !styleId && q().get('type') === null ? setTypeId(null) : (location.hash = clientId ? `#c/${clientId}` : ''))}>
					<Icon name="back" />
				</button>
				<div>
					<h1>{title}</h1>
					<span className="muted small">{sub}</span>
					{refUrl ? <div className="muted small" style={{wordBreak: 'break-all', marginTop: 4}}>{refUrl}</div> : null}
				</div>
			</header>

			{!chosen ? (
				<>
					<TypeGrid onPick={setTypeId} />
					<RefBox />
				</>
			) : (
				<>
					<section>
						<h3 className="sub-h first">Video</h3>
						<div
							className={'drop-big' + (over ? ' over' : '') + (files.length ? ' has' : '')}
							onClick={() => uploading === null && input.current?.click()}
							onDragOver={(e) => (e.preventDefault(), setOver(true))}
							onDragLeave={() => setOver(false)}
							onDrop={(e) => (e.preventDefault(), setOver(false), add(e.dataTransfer.files))}
						>
							<Icon name="upload" />
							<b>{files.length ? 'Přidat další záběry' : montage ? 'Přetáhni sem záběry (klidně desítky najednou)' : 'Přetáhni sem video (nebo víc klipů najednou)'}</b>
							<span className="muted small">MOV, MP4 · ve videu budou v tomhle pořadí</span>
						</div>
						<input ref={input} type="file" accept="video/*,.mov" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
						{files.length ? (
							<div className="file-list">
								{files.map((f, i) => (
									<div key={i} className="file-row">
										<span className="slot-n">{i + 1}</span>
										<span className="file-name">{f.name}</span>
										<span className="muted small">{fmtSize(f.size)}</span>
										<button className="ghost icon" onClick={() => move(i, -1)} disabled={i === 0}>
											<Icon name="up" />
										</button>
										<button className="ghost icon" onClick={() => move(i, 1)} disabled={i === files.length - 1}>
											<Icon name="down" />
										</button>
										<button className="ghost icon danger" onClick={() => setFiles(files.filter((_, k) => k !== i))}>
											<Icon name="x" />
										</button>
									</div>
								))}
							</div>
						) : null}
					</section>

					{!client ? (
						<section>
							<h3 className="sub-h">Formát</h3>
							<div className="fmt-row">
								{FORMATS.map((f) => (
									<button key={f.v} className={'fmt-pill' + (format.v === f.v ? ' on' : '')} onClick={() => setFormat(f)}>
										<span className="fmt-ico" style={{aspectRatio: f.v.replace(':', ' / ')}} />
										<b>{f.title}</b>
										<span className="muted small">{f.sub}</span>
									</button>
								))}
							</div>
						</section>
					) : null}

					<section>
						<h3 className="sub-h">{montage ? 'Co má video říct' : 'O čem video je (nepovinné)'}</h3>
						<textarea
							className="script"
							rows={montage ? 4 : 2}
							value={brief}
							onChange={(e) => setBrief(e.target.value)}
							placeholder={montage ? BRIEF_HINT[typeId ?? ''] ?? 'Název, hlavní výhody, cena, kontakt…' : 'Např.: video o spánku pro mladé lidi, chci to dynamické / klidné…'}
						/>
						{montage ? <span className="muted small">Popisky přes záběry vytvořím jen z toho, co tu napíšeš – nic si nevymyslím.</span> : null}
					</section>

					<section>
						<button className="ghost" onClick={() => setMore(!more)}>
							<Icon name="sliders" /> {more ? 'Méně možností' : 'Více možností'}
						</button>
						{more ? (
							<div className="more-opts">
								{!montage ? (
									<div className="field">
										<span>Jak je video natočené</span>
										<div className="seg">
											{CUT_MODES.map((c) => (
												<button key={c.v} className={cutMode === c.v ? 'on' : ''} onClick={() => setCutMode(c.v)} title={c.h}>
													{c.l}
												</button>
											))}
										</div>
										<span className="muted small">{CUT_MODES.find((c) => c.v === cutMode)?.h}</span>
									</div>
								) : null}
								<div className="field">
									<span>Maximální délka</span>
									<div className="seg">
										{([null, 15, 30, 45, 60, 90] as (number | null)[]).map((v) => (
											<button key={String(v)} className={maxLength === v ? 'on' : ''} onClick={() => setMaxLength(v)}>
												{v ? `${v} s` : 'Automaticky'}
											</button>
										))}
									</div>
								</div>
								{!montage ? (
									<label className="field">
										<span>Scénář (AI podle něj opraví titulky a vybere správné pokusy)</span>
										<textarea rows={4} value={script} onChange={(e) => setScript(e.target.value)} />
									</label>
								) : null}
								<label className="field">
									<span>Název videa</span>
									<input value={name} placeholder={files[0]?.name.replace(/\.[^.]+$/, '') ?? 'podle souboru'} onChange={(e) => setName(e.target.value)} />
								</label>
								<label className="check">
									<input type="checkbox" checked={wizard} onChange={(e) => setWizard(e.target.checked)} /> Chci si všechno nastavit krok za krokem (barvy, titulky, grafika, hudba…)
								</label>
							</div>
						) : null}
					</section>

					<div className="nv-foot">
						{uploading !== null ? (
							<div className="nv-progress">
								<div className="bar big">
									<div style={{width: `${uploading * 100}%`}} />
								</div>
								<span className="muted small">Nahrávám {files.length > 1 ? `${files.length} klipů` : files[0]?.name} · {Math.round(uploading * 100)} %</span>
							</div>
						) : (
							<span className="muted small">{files.length ? `${files.length} ${files.length === 1 ? 'soubor' : files.length < 5 ? 'soubory' : 'souborů'} · ${fmtSize(files.reduce((s, f) => s + f.size, 0))}` : 'Zatím žádné video'}</span>
						)}
						<div style={{flex: 1}} />
						<button className="primary big" disabled={!files.length || uploading !== null} onClick={start}>
							<Icon name="cut" /> {wizard ? 'Nahrát a nastavit' : 'Sestříhat'}
						</button>
					</div>
				</>
			)}
		</div>
	);
};

// typy videí (každý s přednastavením)
export const TypeGrid: React.FC<{onPick?: (id: string) => void}> = ({onPick}) => (
	<div className="type-grid">
		{CATALOG.types.map((t) => (
			<button key={t.id} className={'type-card' + (t.speech ? '' : ' montage')} onClick={() => (onPick ? onPick(t.id) : (location.hash = `#new/_?type=${t.id}`))}>
				<span className="tc-ico">
					<Icon name={t.icon} />
				</span>
				<b>{t.label}</b>
				<span className="muted small">{t.desc}</span>
				<span className="tc-tag">{t.speech ? (t.format === '16:9' ? 'mluvení · na šířku' : 'mluvení · na výšku') : 'bez mluvení · do rytmu hudby'}</span>
			</button>
		))}
	</div>
);

// vložit odkaz -> sestříhat podle něj
export const RefBox: React.FC = () => {
	const [ref, setRef] = React.useState('');
	const ok = /^https?:\/\//.test(ref.trim());
	const go = () => ok && (location.hash = `#new/_?ref=${encodeURIComponent(ref.trim())}`);
	return (
		<section className="ref-hero">
			<div>
				<b>Sestříhat podle odkazu</b>
				<span className="muted small">Vlož odkaz na video, které se ti líbí (Instagram, TikTok, YouTube). Nahraješ své video a já ho sestříhám stejně. Každý odkaz si zapamatuju.</span>
			</div>
			<div className="ref-input">
				<input value={ref} placeholder="https://www.instagram.com/reel/…" onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
				<button className="primary" disabled={!ok} onClick={go}>
					<Icon name="style" /> Pokračovat
				</button>
			</div>
		</section>
	);
};
