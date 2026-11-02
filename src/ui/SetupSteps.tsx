import React from 'react';
import {api, MusicTrack} from '../api';
import {CATALOG, captionFromSetup, HookVisual, label, musicLabel, Setup, themeFromSetup, ThemeBg, ZoomStyle} from '../setup';
import {shade} from '../remotion/gfx';
import {Icon, TempoMock} from './Mocks';
import {CaptionCard, captionStyleOf, FontCard, GfxCard, HoverDemo, HookCard, PlayButton, SFX_LIB, ZoomCard} from './previews';
import {CaptionEditor} from './CaptionEditor';
import {SfxPicker} from './SfxPicker';

// Kroky výběru stylu – stejné pro průvodce u videa i pro styl klienta.
export type StepKey = 'color' | 'type' | 'gfx' | 'zoom' | 'hook' | 'sound' | 'length';
export const SETUP_STEPS: {key: StepKey; label: string; icon: string; title: string}[] = [
	{key: 'color', label: 'Barva', icon: 'color', title: 'Jakou barvou začneme?'},
	{key: 'type', label: 'Písmo a titulky', icon: 'font', title: 'Jaké písmo a titulky?'},
	{key: 'gfx', label: 'Motion grafika', icon: 'card', title: 'Jakou motion grafiku chceš?'},
	{key: 'zoom', label: 'Zoomy', icon: 'zoom', title: 'Jak má kamera přibližovat?'},
	{key: 'hook', label: 'Hook', icon: 'hook', title: 'Jak má video začít?'},
	{key: 'sound', label: 'Hudba a zvuky', icon: 'music', title: 'Hudba a zvukové efekty'},
	{key: 'length', label: 'Tempo a délka', icon: 'clock', title: 'Tempo a délka'},
];

export type StepCtx = {setup: Setup; set: (patch: Partial<Setup>) => void; projectId: string | null; music: MusicTrack[]; platform: 'reels' | 'youtube'; ready?: boolean};

const Seg = <T extends string | number | null>({value, options, onChange}: {value: T; options: [T, string][]; onChange: (v: T) => void}) => (
	<div className="seg">
		{options.map(([v, l]) => (
			<button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
				{l}
			</button>
		))}
	</div>
);

export const StepView: React.FC<{step: StepKey; ctx: StepCtx}> = ({step, ctx}) => {
	if (step === 'color') return <ColorStep {...ctx} />;
	if (step === 'type') return <TypeStep {...ctx} />;
	if (step === 'gfx') return <GfxStep {...ctx} />;
	if (step === 'zoom') return <ZoomStep {...ctx} />;
	if (step === 'hook') return <HookStep {...ctx} />;
	if (step === 'sound') return <SoundStep {...ctx} />;
	return <LengthStep {...ctx} />;
};

// živý náhled aktuálního nastavení (barva + pozadí + font)
const LivePreview: React.FC<{setup: Setup; type?: string}> = ({setup, type = 'reveal'}) => {
	const g = CATALOG.gfx.find((x) => x.type === type)!.sample;
	return (
		<div className="live-preview">
			<HoverDemo active props={{mode: 'gfx', g, theme: themeFromSetup(setup)}} poster={<div className="hd-poster" />} />
			<span className="muted small">Takhle bude grafika vypadat</span>
		</div>
	);
};

const bgCss = (bg: ThemeBg, color: string): React.CSSProperties => {
	if (bg === 'cream') return {background: '#F3EDE2', backgroundImage: 'linear-gradient(#DCD0BB 1px, transparent 1px), linear-gradient(90deg, #DCD0BB 1px, transparent 1px)', backgroundSize: '14px 14px', color: '#14161b'};
	if (bg === 'white') return {background: `radial-gradient(circle at 40% 40%, ${color}22, #FBFBFC 60%)`, color: '#14161b'};
	if (bg === 'brand') return {background: `linear-gradient(130deg, ${shade(color, -0.35)}, ${color} 50%, ${shade(color, 0.28)})`, color: '#fff'};
	if (bg === 'black') return {background: `radial-gradient(ellipse at 50% 50%, ${color}33, #020203 65%)`, color: '#fff'};
	return {background: `linear-gradient(115deg, transparent 30%, ${color}40 45%, transparent 58%), radial-gradient(ellipse at 50% 35%, #1d2029, #050506)`, color: '#fff'};
};

const ColorStep: React.FC<StepCtx> = ({setup, set}) => (
	<div className="step-split">
		<div>
			<h3 className="sub-h first">Hlavní barva</h3>
			<div className="color-grid">
				{CATALOG.colors.map((c) => (
					<button key={c.hex} className={'color-sw' + (setup.color.toLowerCase() === c.hex.toLowerCase() ? ' on' : '')} onClick={() => set({color: c.hex})} title={c.name}>
						<span style={{background: c.hex}} />
						<small>{c.name}</small>
					</button>
				))}
				<label className="color-sw custom" title="Vlastní barva">
					<input type="color" value={setup.color} onChange={(e) => set({color: e.target.value.toUpperCase()})} />
					<small>Vlastní</small>
				</label>
			</div>
			<h3 className="sub-h">Pozadí grafiky</h3>
			<div className="bg-grid">
				{CATALOG.bgs.map((b) => (
					<button key={b.id} className={'bg-card' + (setup.bg === b.id ? ' on' : '')} onClick={() => set({bg: b.id})}>
						<span className="bg-swatch" style={bgCss(b.id, setup.color)}>
							Aa <i style={{color: b.id === 'brand' ? '#FFD84D' : setup.color}}>klíč</i>
						</span>
						<b>{b.label}</b>
						<span className="muted small">{b.desc}</span>
					</button>
				))}
			</div>
		</div>
		<LivePreview setup={setup} />
	</div>
);

const TypeStep: React.FC<StepCtx> = ({setup, set}) => (
	<div className="step-split">
		<div>
			<h3 className="sub-h first">Titulky</h3>
			<div className="row" style={{gap: 10, marginBottom: 12}}>
				<Seg value={setup.captionsOn ? 'on' : 'off'} options={[['on', 'S titulky'], ['off', 'Bez titulků']]} onChange={(v) => set({captionsOn: v === 'on'})} />
				<span className="muted small">Najeď myší na kartu – přehraje se na tvém záběru.</span>
			</div>
			<div className={'pv-grid four' + (setup.captionsOn ? '' : ' dim')}>
				{CATALOG.captions.map((c) => (
					<CaptionCard key={c.id} id={c.id} setup={setup} on={setup.caption === c.id} onClick={() => set({caption: c.id, captionsOn: true, captionCustom: undefined})} />
				))}
			</div>
			<CaptionDetail setup={setup} set={set} />
			<h3 className="sub-h">Hlavní písmo motion grafiky</h3>
			{CATALOG.fontCats.map((c) => (
				<div key={c.id} className="font-group">
					<span className="muted small">{c.label}</span>
					<div className="font-grid">
						{CATALOG.fonts
							.filter((f) => f.cat === c.id)
							.map((f) => (
								<FontCard key={f.family} family={f.family} color={setup.color} on={setup.font === f.family} onClick={() => set({font: f.family})} />
							))}
					</div>
				</div>
			))}
			<h3 className="sub-h">Doplňkové písmo (kurzíva a zvýraznění v grafice)</h3>
			<div className="font-grid">
				{CATALOG.fonts
					.filter((f) => f.cat === 'elegant' || f.cat === 'hand')
					.map((f) => (
						<FontCard key={f.family} family={f.family} color={setup.color} on={(setup.serif ?? 'DM Serif Display') === f.family} onClick={() => set({serif: f.family})} />
					))}
			</div>
		</div>
		<div className="live-col">
			<div className="live-preview">
				<HoverDemo active props={{mode: 'caption', caption: captionStyleOf(setup.caption, setup), theme: themeFromSetup(setup)}} poster={<div className="hd-poster" />} />
				<span className="muted small">Titulky: {label.caption(setup.caption)}</span>
			</div>
			<LivePreview setup={setup} type="headline" />
		</div>
	</div>
);

// detailní úprava titulků (ukládá se jako vlastní úpravy nad vybraným stylem)
const CaptionDetail: React.FC<{setup: Setup; set: (p: Partial<Setup>) => void}> = ({setup, set}) => {
	const [open, setOpen] = React.useState(Boolean(setup.captionCustom));
	return (
		<div style={{marginTop: 12}}>
			<button className={open ? 'active' : ''} onClick={() => setOpen(!open)}>
				<Icon name="sliders" /> {open ? 'Skrýt detailní úpravy' : 'Upravit titulky do detailu (fonty, aktivní slovo, obrys…)'}
			</button>
			{open ? (
				<div style={{marginTop: 10, maxWidth: 720}}>
					<CaptionEditor style={captionFromSetup(setup)} accent={setup.color} set={(p) => set({captionCustom: {...(setup.captionCustom ?? {}), ...p}})} />
				</div>
			) : null}
		</div>
	);
};

const GfxStep: React.FC<StepCtx> = ({setup, set}) => {
	const toggle = (t: string) => set({gfx: setup.gfx.includes(t) ? setup.gfx.filter((x) => x !== t) : [...setup.gfx, t]});
	return (
		<>
			<div className="row gfx-tools">
				<span className="muted small">{setup.gfx.length ? `Vybráno ${setup.gfx.length} – do videa půjdou jen tyhle.` : 'Nic nevybráno = AI vybere ze všech podle toho, co říkáš.'} Najeď na kartu – přehraje se.</span>
				<div style={{flex: 1}} />
				<button className="ghost small" onClick={() => set({gfx: CATALOG.gfx.map((g) => g.type)})}>
					Vybrat všechny
				</button>
				<button className="ghost small" onClick={() => set({gfx: []})}>
					Zrušit výběr
				</button>
				<Seg value={setup.gfxAmount} options={[['low', 'Méně grafiky'], ['mid', 'Akorát'], ['high', 'Hodně']]} onChange={(v) => set({gfxAmount: v})} />
			</div>
			<div className="pv-grid gfx">
				{CATALOG.gfx.map((g) => (
					<GfxCard key={g.type} type={g.type} setup={setup} on={setup.gfx.includes(g.type)} onClick={() => toggle(g.type)} />
				))}
			</div>
		</>
	);
};

const ZoomStep: React.FC<StepCtx> = ({setup, set}) => (
	<>
		<p className="muted">Najeď na kartu – uvidíš přesně, jak se kamera pohne (dole je vidět, na kolik procent).</p>
		<div className="pv-grid three">
			{CATALOG.zooms.map((z) => (
				<ZoomCard key={z.id} id={z.id as ZoomStyle} setup={setup} on={setup.zoom === z.id} onClick={() => set({zoom: z.id})} />
			))}
		</div>
	</>
);

const HookStep: React.FC<StepCtx> = ({setup, set, projectId, ready}) => {
	const [ideas, setIdeas] = React.useState<{text: string; why: string}[] | null>(null);
	const [busy, setBusy] = React.useState(false);
	const suggest = async () => {
		if (!projectId) return;
		setBusy(true);
		try {
			setIdeas((await api.hooks(projectId)).hooks);
		} catch (e) {
			alert('AI teď nemůže navrhnout hook: ' + (e as Error).message);
		}
		setBusy(false);
	};
	return (
		<>
			<div className="hook-text">
				<label>
					<b>Text hooku</b> <span className="muted small">– první 2 sekundy, které rozhodnou, jestli divák zůstane. Napiš vlastní, nebo nech navrhnout AI.</span>
				</label>
				<div className="row" style={{gap: 8}}>
					<input value={setup.hook.text} placeholder="Např.: Proč jsi ve 2 odpoledne mrtvý?" onChange={(e) => set({hook: {...setup.hook, text: e.target.value}})} />
					{projectId ? (
						<button onClick={suggest} disabled={busy || !ready} title={ready ? '' : 'Až bude hotový přepis videa'}>
							<Icon name="ai" /> {busy ? 'Přemýšlím…' : ready ? 'Navrhni hooky' : 'Čekám na přepis…'}
						</button>
					) : null}
				</div>
				{ideas ? (
					<div className="hook-ideas">
						{ideas.map((h) => (
							<button key={h.text} className={'hook-idea' + (setup.hook.text === h.text ? ' on' : '')} onClick={() => set({hook: {...setup.hook, text: h.text}})}>
								<b>{h.text}</b>
								<span className="muted small">{h.why}</span>
							</button>
						))}
					</div>
				) : null}
				<label className="check">
					<input type="checkbox" checked={setup.hook.sfx} onChange={(e) => set({hook: {...setup.hook, sfx: e.target.checked}})} /> Výrazný zvuk na začátku (úder + whoosh)
					<PlayButton src="/sfx/hit_06.mp3" seconds={2} />
				</label>
			</div>
			<h3 className="sub-h">Jak má hook vypadat</h3>
			<div className="pv-grid four">
				{CATALOG.hooks.map((h) => (
					<HookCard key={h.id} id={h.id as HookVisual} setup={setup} on={setup.hook.visual === h.id} onClick={() => set({hook: {...setup.hook, visual: h.id}})} />
				))}
			</div>
		</>
	);
};

const SoundStep: React.FC<StepCtx> = ({setup, set, projectId, music}) => {
	const [cat, setCat] = React.useState(setup.music.mood ?? CATALOG.moods[0].id);
	const [up, setUp] = React.useState<number | null>(null);
	const m = setup.music;
	const upload = async (f?: File) => {
		if (!f || !projectId) return;
		setUp(0);
		try {
			const r = await api.music(projectId, f, setUp);
			set({music: {mode: 'custom', file: r.music.file, name: r.music.name}});
		} catch (e) {
			alert('Nahrání se nepovedlo: ' + (e as Error).message);
		}
		setUp(null);
	};
	return (
		<>
			<div className="music-now">
				<Icon name="music" /> <b>Do videa půjde:</b> {musicLabel(m)}
				{m.mode === 'track' && m.file ? <PlayButton src={'/' + m.file} /> : null}
			</div>
			<Seg
				value={m.mode}
				options={[
					['auto', 'Vybere AI'],
					['mood', 'Podle nálady'],
					['track', 'Konkrétní skladba'],
					...(projectId ? ([['custom', 'Vlastní skladba']] as [Setup['music']['mode'], string][]) : []),
					['off', 'Bez hudby'],
				]}
				onChange={(v) => set({music: v === 'mood' ? {mode: 'mood', mood: cat} : v === 'track' ? {mode: 'track', file: m.file, name: m.name} : {mode: v}})}
			/>
			{m.mode === 'mood' || m.mode === 'track' ? (
				<>
					<div className="mood-chips">
						{CATALOG.moods.map((md) => (
							<button key={md.id} className={'chip' + (cat === md.id ? ' on' : '')} onClick={() => (setCat(md.id), m.mode === 'mood' && set({music: {mode: 'mood', mood: md.id}}))}>
								{md.label}
							</button>
						))}
					</div>
					<div className="track-grid">
						{music
							.filter((t) => t.cat === cat)
							.map((t) => (
								<div key={t.id} className={'track' + (m.mode === 'track' && m.file === t.file ? ' on' : '')} onClick={() => set({music: {mode: 'track', file: t.file, name: t.name, mood: t.cat}})}>
									<PlayButton src={'/' + t.file} />
									<span>{t.name}</span>
									<span className="muted small">{Math.round(t.duration)} s</span>
									{m.mode === 'track' && m.file === t.file ? <Icon name="check" /> : null}
								</div>
							))}
					</div>
					<p className="muted small">Hudba je z Mixkitu – zdarma i pro komerční videa. Pod tvým hlasem se sama ztiší.</p>
				</>
			) : null}
			{m.mode === 'custom' ? (
				<div className="upload-music">
					<label className="drop small">
						<Icon name="upload" /> {up !== null ? `Nahrávám ${Math.round(up * 100)} %` : m.file ? `Nahráno: ${m.name}` : 'Vyber MP3 / WAV'}
						<input type="file" accept="audio/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
					</label>
					<p className="muted small">Nahraj jen hudbu, kterou smíš použít (vlastní, zakoupenou licenci nebo bez autorských práv). Cizí písně z internetu kvůli autorským právům stahovat nebudu.</p>
				</div>
			) : null}
			<h3 className="sub-h">Zvukové efekty</h3>
			<div className="grid3">
				{(
					[
						['off', 'Žádné', 'jen hlas a hudba'],
						['soft', 'Jemné', 'whoosh na grafice, pop na štítcích, click u seznamů'],
						['bold', 'Výrazné', 'navíc hity na číslech a důrazech'],
					] as const
				).map(([v, l, h]) => (
					<button key={v} className={'choice' + (setup.sfx === v ? ' on' : '')} onClick={() => set({sfx: v})}>
						<b>{l}</b>
						<span className="muted small">{h}</span>
					</button>
				))}
			</div>
			<h3 className="sub-h">Které efekty chceš (poslechni a zaškrtni)</h3>
			<div style={{maxWidth: 900}}>
				<SfxPicker value={setup.sfxSet} onChange={(v) => set({sfxSet: v})} />
			</div>
			<h3 className="sub-h">B-roll (stock záběry zdarma)</h3>
			<Seg value={setup.broll} options={[['off', 'Bez B-rollu'], ['some', 'Jen u silných míst'], ['lots', 'Hodně B-rollu']]} onChange={(v) => set({broll: v})} />
		</>
	);
};

const LengthStep: React.FC<StepCtx> = ({setup, set, platform}) => (
	<>
		<h3 className="sub-h first">Tempo střihu</h3>
		<div className="grid3">
			{(
				[
					['calm', 'Klidné', 'pauza mezi větami ~0,45 s · vyprávění, YouTube'],
					['normal', 'Svižné', 'pauza ~0,3 s · přirozený rytmus'],
					['fast', 'Rychlé', 'pauza ~0,24 s · hustý Reels rytmus'],
				] as const
			).map(([v, l, h]) => (
				<button key={v} className={'choice' + (setup.tempo === v ? ' on' : '')} onClick={() => set({tempo: v})}>
					<TempoMock tempo={v} animated />
					<b>{l}</b>
					<span className="muted small">{h}</span>
				</button>
			))}
		</div>
		<h3 className="sub-h">Maximální délka</h3>
		<Seg
			value={setup.maxLength}
			options={
				platform === 'youtube'
					? [
							[null, 'Bez limitu'],
							[180, 'Do 3 min'],
							[300, 'Do 5 min'],
							[600, 'Do 10 min'],
						]
					: [
							[null, 'Bez limitu'],
							[30, 'Do 30 s'],
							[45, 'Do 45 s'],
							[60, 'Do 60 s'],
							[90, 'Do 90 s'],
						]
			}
			onChange={(v) => set({maxLength: v})}
		/>
		<p className="muted small">Když bude delší, AI vynechá nejméně důležité myšlenky. Hook a závěr nechá.</p>
		<h3 className="sub-h">Rozložení záběru</h3>
		<Seg value={setup.layout} options={[['full', 'Přes celou plochu'], ['framed', 'Velký rámeček na černé']]} onChange={(v) => set({layout: v})} />
	</>
);

// souhrn nastavení (kartičky „Změnit“)
export const SetupSummary: React.FC<{setup: Setup; go: (s: StepKey) => void}> = ({setup, go}) => {
	const rows: [StepKey, string, React.ReactNode][] = [
		['color', 'Barva a pozadí', <><span className="dot-c" style={{background: setup.color}} /> {label.color(setup.color)} · {label.bg(setup.bg)}</>],
		['type', 'Písmo a titulky', `${setup.font} · ${setup.captionsOn ? label.caption(setup.caption) : 'bez titulků'}`],
		['gfx', 'Motion grafika', setup.gfx.length ? setup.gfx.map(label.gfx).join(', ') : 'vybere AI ze všech'],
		['zoom', 'Zoomy', label.zoom(setup.zoom)],
		['hook', 'Hook', `${label.hook(setup.hook.visual)}${setup.hook.text ? ` – „${setup.hook.text}“` : ' – text navrhne AI'}${setup.hook.sfx ? ' + zvuk' : ''}`],
		['sound', 'Hudba a zvuky', `${musicLabel(setup.music)} · efekty ${setup.sfx === 'off' ? 'žádné' : setup.sfx === 'soft' ? 'jemné' : 'výrazné'} · B-roll ${setup.broll === 'off' ? 'ne' : setup.broll === 'some' ? 'občas' : 'hodně'}`],
		['length', 'Tempo a délka', `${setup.tempo === 'calm' ? 'klidné' : setup.tempo === 'normal' ? 'svižné' : 'rychlé'} · ${setup.maxLength ? `do ${setup.maxLength} s` : 'bez limitu'} · ${setup.layout === 'framed' ? 'rámeček' : 'celá plocha'}`],
	];
	return (
		<div className="summary">
			{rows.map(([k, l, v]) => (
				<div key={k} className="sum-row" onClick={() => go(k)}>
					<span className="muted small">{l}</span>
					<span className="sum-v">{v}</span>
					<button className="ghost small">
						<Icon name="edit" /> Změnit
					</button>
				</div>
			))}
		</div>
	);
};
