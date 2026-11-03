import React from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {Demo, DEMO_FPS, DEMO_FRAMES, DemoProps} from '../remotion/Demo';
import type {CaptionStyle} from '../model';
import {CATALOG, captionFromSetup, HookVisual, Setup, themeFromSetup, ZoomStyle} from '../setup';
import {Icon} from './Mocks';

// Náhledy, které se po najetí myší přehrají (Remotion Player s ukázkou na autorově záběru).
// Bez najetí jen statický obrázek – na stránce jich je hodně a přehrávač běží vždy jen jeden.

const W = 360;
const H = 640;

export const HoverDemo: React.FC<{props: Omit<DemoProps, 'W' | 'H'>; poster: React.ReactNode; active?: boolean; ratio?: string; still?: number}> = ({props, poster, active, ratio = '9 / 16', still}) => {
	const [hover, setHover] = React.useState(false);
	const ref = React.useRef<PlayerRef>(null);
	const on = hover || active;
	// still = snímek, který se ukáže bez najetí (živě v barvách, které autor zvolil); po najetí se přehraje
	React.useEffect(() => {
		const p = ref.current;
		if (!p || still === undefined) return;
		if (on) {
			p.seekTo(0);
			p.play();
		} else {
			p.pause();
			p.seekTo(still);
		}
	}, [on, still]);
	const live = still !== undefined;
	return (
		<div className="hover-demo" style={{aspectRatio: ratio}} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
			{live ? null : poster}
			{on || live ? (
				<Player
					ref={ref}
					component={Demo}
					inputProps={{...props, W, H}}
					durationInFrames={DEMO_FRAMES[props.mode]}
					compositionWidth={W}
					compositionHeight={H}
					fps={DEMO_FPS}
					autoPlay={on}
					initialFrame={live && !on ? still : 0}
					loop
					controls={false}
					style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
					acknowledgeRemotionLicense
				/>
			) : null}
			{!on ? (
				<span className="hd-play">
					<Icon name="play" />
				</span>
			) : null}
		</div>
	);
};

const Poster: React.FC<{src?: string; children?: React.ReactNode}> = ({src = '/demo/poster.jpg', children}) => (
	<div className="hd-poster">
		<img src={src} alt="" loading="lazy" />
		{children}
	</div>
);

const Tick: React.FC<{on: boolean}> = ({on}) =>
	on ? (
		<span className="sel-tick">
			<Icon name="check" />
		</span>
	) : null;

// ---------------------------------------------------------------- jednotlivé karty
export const GfxCard: React.FC<{type: string; setup: Setup; on?: boolean; onClick?: () => void; compact?: boolean}> = ({type, setup, on = false, onClick, compact}) => {
	const c = CATALOG.gfx.find((g) => g.type === type)!;
	return (
		<button className={'pv-card' + (on ? ' on' : '') + (compact ? ' compact' : '')} onClick={onClick}>
			<HoverDemo props={{mode: 'gfx', g: c.sample, theme: themeFromSetup(setup)}} poster={<Poster src={`/tpl/${type}.jpg`} />} />
			<Tick on={on} />
			<b>{c.label}</b>
			{!compact ? <span className="muted small">{c.desc}</span> : null}
		</button>
	);
};

export const ZoomCard: React.FC<{id: ZoomStyle; setup: Setup; on?: boolean; onClick?: () => void; compact?: boolean}> = ({id, setup, on = false, onClick, compact}) => {
	const c = CATALOG.zooms.find((z) => z.id === id)!;
	return (
		<button className={'pv-card' + (on ? ' on' : '') + (compact ? ' compact' : '')} onClick={onClick}>
			<HoverDemo props={{mode: 'zoom', zoom: id, theme: themeFromSetup(setup)}} poster={<Poster />} />
			<Tick on={on} />
			<b>{c.label}</b>
			{!compact ? <span className="muted small">{c.desc}</span> : null}
		</button>
	);
};

export const HookCard: React.FC<{id: HookVisual; setup: Setup; on?: boolean; onClick?: () => void; compact?: boolean}> = ({id, setup, on = false, onClick, compact}) => {
	const c = CATALOG.hooks.find((h) => h.id === id)!;
	return (
		<button className={'pv-card' + (on ? ' on' : '') + (compact ? ' compact' : '')} onClick={onClick}>
			<HoverDemo props={{mode: 'hook', hook: {visual: id, text: setup.hook.text}, theme: themeFromSetup(setup)}} poster={<Poster src={id === 'broll' ? '/demo/broll.jpg' : undefined} />} />
			<Tick on={on} />
			<b>{c.label}</b>
			{!compact ? <span className="muted small">{c.desc}</span> : null}
		</button>
	);
};

export const captionStyleOf = (id: string, setup: Setup): CaptionStyle => captionFromSetup({...setup, caption: id, captionCustom: id === setup.caption ? setup.captionCustom : undefined, captionsOn: true});

export const CaptionCard: React.FC<{id: string; setup: Setup; on?: boolean; onClick?: () => void}> = ({id, setup, on = false, onClick}) => {
	const c = CATALOG.captions.find((x) => x.id === id)!;
	const st = captionStyleOf(id, setup);
	const sample = st.textCase === 'upper' ? 'TOHLE JE ' : st.textCase === 'lower' ? 'tohle je ' : 'Tohle je ';
	const word = st.textCase === 'upper' ? 'PRVNÍ' : 'první';
	return (
		<button className={'pv-card' + (on ? ' on' : '')} onClick={onClick}>
			<HoverDemo
				props={{mode: 'caption', caption: st, theme: themeFromSetup(setup)}}
				poster={
					<Poster>
						<span className="cap-sample" style={{fontFamily: `'${st.font}'`, fontWeight: st.weight, fontSize: Math.max(11, st.size * 0.22), top: `${st.y * 100}%`}}>
							{sample}
							<span style={{color: st.highlight || '#fff'}}>{word}</span>
						</span>
					</Poster>
				}
			/>
			<Tick on={on} />
			<b>{c.label}</b>
			<span className="muted small">{c.desc}</span>
		</button>
	);
};

export const FontCard: React.FC<{family: string; on?: boolean; onClick?: () => void; color?: string}> = ({family, on = false, onClick, color}) => {
	const f = CATALOG.fonts.find((x) => x.family === family)!;
	return (
		<button className={'font-card' + (on ? ' on' : '')} onClick={onClick}>
			<span className="fc-sample" style={{fontFamily: `'${family}'`, fontStyle: /Instrument/.test(family) ? 'italic' : undefined}}>
				Aa <span style={{color}}>Spánek</span>
			</span>
			<b>{f.label}</b>
			<span className="muted small">{f.desc}</span>
			<Tick on={on} />
		</button>
	);
};

// přehrání zvuku (hudba / efekt) – vždy jen jeden
let current: HTMLAudioElement | null = null;
let currentSrc = '';
const listeners = new Set<() => void>();
export const playSound = (src: string, seconds = 12) => {
	if (current && currentSrc === src && !current.paused) {
		current.pause();
		listeners.forEach((l) => l());
		return;
	}
	current?.pause();
	const a = new Audio(src);
	a.volume = 0.8;
	a.play().catch(() => {});
	current = a;
	currentSrc = src;
	a.onpause = a.onended = () => listeners.forEach((l) => l());
	setTimeout(() => a === current && a.pause(), seconds * 1000);
	listeners.forEach((l) => l());
};
export const usePlaying = (src: string) => {
	const [, force] = React.useReducer((x) => x + 1, 0);
	React.useEffect(() => {
		listeners.add(force);
		return () => void listeners.delete(force);
	}, []);
	return currentSrc === src && current != null && !current.paused;
};

export const PlayButton: React.FC<{src: string; seconds?: number}> = ({src, seconds}) => {
	const on = usePlaying(src);
	return (
		<span
			className={'play-btn inline' + (on ? ' on' : '')}
			onClick={(e) => {
				e.stopPropagation();
				playSound(src, seconds);
			}}
		>
			<Icon name={on ? 'pause' : 'play'} />
		</span>
	);
};

// zvukové efekty knihovny (pro přehled a ukázky)
export const SFX_LIB: {cat: string; label: string; files: string[]}[] = [
	{cat: 'whoosh', label: 'Whoosh (přechod grafiky)', files: ['sfx/whoosh_01.mp3', 'sfx/whoosh_05.mp3', 'sfx/whoosh_11.mp3', 'sfx/whoosh_14.mp3', 'sfx2/transition_1146_n.mp3']},
	{cat: 'hit', label: 'Hit / úder (čísla, hook)', files: ['sfx/hit_02.mp3', 'sfx/hit_06.mp3', 'sfx/hit_08.mp3', 'sfx2/impact_2150_n.mp3']},
	{cat: 'pop', label: 'Pop (štítky)', files: ['sfx2/pop_2357_n.mp3', 'sfx2/pop_2364_n.mp3', 'sfx2/pop_2354_n.mp3']},
	{cat: 'click', label: 'Click (seznamy)', files: ['sfx2/click_1109_n.mp3', 'sfx2/click_1113_n.mp3', 'sfx/click_01.mp3']},
	{cat: 'notification', label: 'Notifikace (chat)', files: ['sfx2/notification_2310_n.mp3', 'sfx2/notification_2317_n.mp3']},
	{cat: 'riser', label: 'Riser / glitch / foťák', files: ['sfx/riser_01.mp3', 'sfx2/glitch_1021_n.mp3', 'sfx/camera_03.mp3']},
];
