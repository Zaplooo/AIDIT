// Knihovna motion grafiky v3 (podle referencí: Apple-style odhalování textu, svítící slova, čísla z částic, skleněné štítky,
// čipy se září, kapitoly na modré mřížce, karty s ikonami, srovnání přes mluvčího, budíky, ručně psaný text…).
// Pravidla: animace jen přes frame/interpolate/spring, statické fonty, grafika NIKDY úplně nestojí (jemný drift + živé pozadí).
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, staticFile} from 'remotion';
import {Ico} from './icons';
import {FONTS} from './fonts';

export type CardItem = {icon?: string; title: string; sub?: string};
export type Gfx = (
	| {type: 'headline'; text: string; highlight?: string; sub?: string}
	| {type: 'reveal'; text: string; highlight?: string}
	| {type: 'stat'; value: string; label: string; sub?: string}
	| {type: 'particles'; value: string; text?: string}
	| {type: 'list'; title: string; items: string[]}
	| {type: 'quote'; text: string; highlight?: string; sub?: string}
	| {type: 'chat'; messages: {from: 'me' | 'them'; text: string}[]}
	| {type: 'compare'; left: string; right: string; leftItems: string[]; rightItems: string[]}
	| {type: 'slam'; words: string[]}
	| {type: 'timer'; value: string; label?: string}
	| {type: 'step'; n: number; title: string; sub?: string}
	| {type: 'chapter'; n: number; title: string}
	| {type: 'chips'; items: string[]; icons?: string[]}
	| {type: 'cards'; title?: string; items: CardItem[]}
	| {type: 'gauge'; value: string; label: string; level: number}
	| {type: 'crowd'; you: string; them: string}
	| {type: 'prompt'; text: string}
	| {type: 'note'; lines: string[]}
	| {type: 'versus'; left: string; leftSub?: string; leftIcon?: string; right: string; rightSub?: string; rightIcon?: string}
	| {type: 'side'; items: CardItem[]}
	| {type: 'pill'; text: string}
	| {type: 'bars'; title?: string; items: {label: string; value: number}[]}
	| {type: 'timeline'; title?: string; items: string[]}
	| {type: 'bigicon'; icon: string; text: string; sub?: string}
	| {type: 'lowerthird'; title: string; sub?: string}
	| {type: 'counter'; value: string; label?: string}
	| {type: 'question'; text: string}
	| {type: 'marquee'; text: string}
	| {type: 'progress'; label: string; level: number; text?: string}
	| {type: 'kinetic'; words: string[]}
	| {type: 'custom'; title?: string; layout: 'stack' | 'row' | 'grid' | 'hero'; items: CustomItem[]; note?: string}
) & {times?: number[]}; // times = kdy která položka naskočí (s od začátku grafiky) – podle toho, kdy ji mluvčí vysloví
export type CustomItem = {kind: 'text' | 'number' | 'icon' | 'check' | 'cross' | 'badge'; text?: string; sub?: string; icon?: string};

// načítání čísla: celé číslo včetně tisíců („12 490 000“, „1.5“, „60–90“), formát zůstane stejný
const countUp = (value: string, k: number) =>
	value.replace(/\d{1,3}(?:[  .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g, (m) => {
		const sep = m.match(/\d([  .])\d{3}/)?.[1];
		const dec = m.match(/[.,](\d+)$/) && !(sep && /\.\d{3}$/.test(m)) ? m.match(/[.,](\d+)$/)![1].length : 0;
		const num = Number((sep ? m.split(sep).join('') : m).replace(',', '.'));
		const v = num * k;
		let out = dec ? v.toFixed(dec) : String(Math.round(v));
		if (sep) out = out.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
		if (dec && m.includes(',')) out = out.replace('.', ',');
		return out;
	});

// kdy naskočí položka i: podle řeči (times), jinak rovnoměrně
const at = (g: {times?: number[]}, i: number, fallback: number) => (g.times && g.times[i] !== undefined ? g.times[i] : fallback);

export type Theme = {accent: string; bg: 'dark' | 'cream' | 'brand' | 'glass' | 'white' | 'black'; font: string; serif: string; brand?: string};

// odstín barvy: k < 0 ztmaví, k > 0 zesvětlí
export const shade = (hex: string, k: number) => {
	const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
	return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
};

// které šablony se kreslí PŘES záběr (mluvčí zůstává vidět)
export const OVERLAY_TYPES = new Set(['versus', 'side', 'pill', 'lowerthird', 'counter', 'marquee']);

const C = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const sp = (t: number, fps: number, delay = 0, damping = 15, stiffness = 170) => spring({frame: Math.max(0, (t - delay) * fps), fps, config: {damping, stiffness, mass: 0.9}});
// statické řezy: Inter Tight / Montserrat / Poppins jen ExtraBold, Archivo Black / Anton / Bebas jen Regular
// nejtučnější statický řez, který je k dispozici (variabilní fonty dělaly v renderu třes)
export const fw = (font: string) => Math.max(400, ...FONTS.filter((f) => f.family === font && !f.style).map((f) => Number(f.weight)));
const light = (theme: Theme) => theme.bg === 'cream' || theme.bg === 'white';
const fg = (theme: Theme) => (light(theme) ? '#111318' : '#FFFFFF');
const sub = (theme: Theme) => (light(theme) ? '#5a5f6b' : '#aab0bd');
const mono = 'IBM Plex Mono';
// deterministická „náhoda“ (stejný výsledek v náhledu i renderu)
const rnd = (i: number) => {
	const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};

// ---------------------------------------------------------------- nástup, drift, odchod
export const Enter: React.FC<{t: number; dur: number; children: React.ReactNode; full?: boolean}> = ({t, dur, children, full}) => {
	// nástup 0,45 s a odchod 0,35 s s jemným rozostřením – grafika se do záběru „rozplyne“, ne cvakne
	const io = Math.min(0.45, dur * 0.3);
	const oo = Math.min(0.35, dur * 0.25);
	const i = interpolate(t, [0, io], [0, 1], {...C, easing: EASE});
	const o = interpolate(t, [dur - oo, dur], [1, 0], {...C, easing: Easing.inOut(Easing.cubic)});
	const k = Math.min(i, o);
	// jemný drift po celou dobu – grafika nikdy nestojí (stojící obraz působí jako zaseknutí)
	const drift = interpolate(t, [0, Math.max(dur, 0.5)], [1, 1.03]);
	return (
		<AbsoluteFill style={{opacity: full ? Math.min(1, k * 1.25) : k, scale: String(interpolate(i, [0, 1], [1.05, 1]) * interpolate(o, [0, 1], [1.03, 1]) * drift), filter: `blur(${((1 - k) * 10).toFixed(2)}px)`}}>
			{children}
		</AbsoluteFill>
	);
};

// ---------------------------------------------------------------- pozadí (všechna se pomalu hýbou)
export const Grain: React.FC<{t?: number}> = ({t = 0}) => (
	<AbsoluteFill
		style={{
			opacity: 0.07,
			mixBlendMode: 'overlay',
			backgroundImage: `url(${staticFile('fx/grain.png')})`,
			backgroundSize: '512px 512px',
			backgroundPosition: `${Math.floor(rnd(Math.floor(t * 24)) * 512)}px ${Math.floor(rnd(Math.floor(t * 24) + 9) * 512)}px`,
		}}
	/>
);

export const Bg: React.FC<{theme: Theme; t: number}> = ({theme, t}) => {
	const a = theme.accent;
	if (theme.bg === 'cream')
		return (
			<AbsoluteFill style={{background: '#F3EDE2'}}>
				<AbsoluteFill style={{backgroundImage: 'linear-gradient(#DCD0BB 1.5px, transparent 1.5px), linear-gradient(90deg, #DCD0BB 1.5px, transparent 1.5px)', backgroundSize: '96px 96px', backgroundPosition: `${t * 6}px ${t * 4}px`, opacity: 0.55}} />
				<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(120,95,60,0.18) 100%)'}} />
			</AbsoluteFill>
		);
	if (theme.bg === 'white')
		return (
			<AbsoluteFill style={{background: '#FBFBFC'}}>
				<AbsoluteFill style={{background: `radial-gradient(circle at ${40 + Math.sin(t * 0.6) * 12}% ${45 + Math.cos(t * 0.5) * 10}%, ${a}14 0%, transparent 55%)`}} />
			</AbsoluteFill>
		);
	if (theme.bg === 'brand') {
		// modrá mřížka ze zaoblených dlaždic + pohyblivý gradient (jako v referenci)
		return (
			<AbsoluteFill style={{background: theme.brand ? `linear-gradient(${120 + t * 8}deg, ${shade(theme.brand, -0.35)} 0%, ${theme.brand} 50%, ${shade(theme.brand, 0.28)} 100%)` : `linear-gradient(${120 + t * 8}deg, #1C3CE6 0%, #1E5BF0 45%, #18A6F2 100%)`}}>
				<AbsoluteFill
					style={{
						backgroundImage: 'linear-gradient(rgba(255,255,255,0.10) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.10) 2px, transparent 2px)',
						backgroundSize: '120px 120px',
						backgroundPosition: `${-t * 10}px 0px`,
					}}
				/>
				<AbsoluteFill style={{background: `radial-gradient(circle at ${30 + Math.sin(t * 0.7) * 20}% ${40 + Math.cos(t * 0.5) * 15}%, rgba(255,255,255,0.18) 0%, transparent 45%)`}} />
				<Grain t={t} />
			</AbsoluteFill>
		);
	}
	if (theme.bg === 'black')
		return (
			<AbsoluteFill style={{background: '#020203'}}>
				<AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 50%, ${a}${Math.round(26 + 10 * Math.sin(t * 2)).toString(16)} 0%, transparent 60%)`}} />
				<Grain t={t} />
			</AbsoluteFill>
		);
	// tmavé: hloubka + dva měkké světelné paprsky, které pomalu přejíždějí
	return (
		<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 35%, #1d2029 0%, #0a0b0e 62%, #050506 100%)'}}>
			<AbsoluteFill style={{background: `linear-gradient(${115 + t * 3}deg, transparent 30%, ${a}38 45%, transparent 58%)`, transform: `translateX(${(t * 3) % 30 - 15}%)`}} />
			<AbsoluteFill style={{background: `linear-gradient(${300 + t * 2}deg, transparent 40%, ${a}26 52%, transparent 62%)`}} />
			<Grain t={t} />
		</AbsoluteFill>
	);
};

// ---------------------------------------------------------------- textové stavebnice
// Apple-style: slova najíždějí s rozostřením; zvýrazněné slovo v barvě akcentu se září (nebo s fixem na světlém pozadí)
const Reveal: React.FC<{text: string; highlight?: string; t: number; fps: number; size: number; color: string; theme: Theme; maxWidth: number; stagger?: number; font?: string; marker?: boolean}> = ({text, highlight, t, fps, size, color, theme, maxWidth, stagger = 0.07, font, marker}) => {
	const words = text.split(/\s+/);
	const hl = (highlight ?? '').toLowerCase().split(/\s+/).filter(Boolean).map((h) => h.replace(/[^\p{L}\p{N}]/gu, ''));
	const fam = font ?? theme.font;
	return (
		<div style={{maxWidth, textAlign: 'center', lineHeight: 1.08, fontFamily: fam, fontWeight: fw(fam), fontSize: size, color, letterSpacing: '-0.025em'}}>
			{words.map((w, i) => {
				const k = sp(t, fps, i * stagger, 18, 140);
				const clean = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
				const isH = hl.some((h) => h && clean.startsWith(h));
				const m = isH ? interpolate(t, [0.25 + i * stagger, 0.6 + i * stagger], [0, 1], {...C, easing: EASE}) : 0;
				const useMarker = marker ?? light(theme);
				return (
					<span key={i} style={{display: 'inline-block', marginRight: '0.24em', position: 'relative', opacity: Math.min(1, k * 1.25), translate: `0 ${((1 - k) * size * 0.35).toFixed(2)}px`, filter: `blur(${((1 - Math.min(k, 1)) * 12).toFixed(2)}px)`}}>
						{isH && useMarker ? <span style={{position: 'absolute', left: '-0.08em', right: '-0.08em', top: '0.14em', bottom: '0.04em', background: theme.bg === 'cream' ? '#FFD84D' : theme.accent, transformOrigin: 'left', scale: `${m} 1`, borderRadius: size * 0.08}} /> : null}
						<span
							style={{
								position: 'relative',
								color: isH && !useMarker ? theme.accent : isH && useMarker && theme.bg !== 'cream' ? '#fff' : undefined,
								textShadow: isH && !useMarker ? `0 0 ${size * 0.35}px ${theme.accent}aa` : undefined,
							}}
						>
							{w}
						</span>
					</span>
				);
			})}
		</div>
	);
};

const Label: React.FC<{text: string; t: number; fps: number; u: number; theme: Theme}> = ({text, t, fps, u, theme}) => (
	<div style={{fontFamily: mono, fontSize: 30 * u, letterSpacing: '0.18em', textTransform: 'uppercase', color: light(theme) ? '#8a7f6c' : theme.accent, marginBottom: 26 * u, opacity: sp(t, fps), translate: `0 ${((1 - sp(t, fps)) * 20 * u).toFixed(2)}px`}}>{text}</div>
);

const Dots: React.FC<{t: number; u: number}> = ({t, u}) => (
	<span style={{display: 'inline-flex', gap: 10 * u, padding: `${6 * u}px 0`}}>
		{[0, 1, 2].map((i) => (
			<span key={i} style={{width: 16 * u, height: 16 * u, borderRadius: '50%', background: '#9aa0ad', opacity: 0.35 + 0.65 * Math.abs(Math.sin(t * 7 - i * 0.8))}} />
		))}
	</span>
);

// číslo složené z tisíců teček (jako „$500“ v referenci) – tečky se slétnou na místo a jemně blikají
const ParticleNumber: React.FC<{value: string; t: number; W: number; H: number; color: string}> = ({value, t, W, H, color}) => {
	const pts = React.useMemo(() => {
		if (typeof document === 'undefined') return [] as [number, number][];
		const cw = 900;
		const ch = 360;
		const cv = document.createElement('canvas');
		cv.width = cw;
		cv.height = ch;
		const g = cv.getContext('2d')!;
		g.fillStyle = '#fff';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		let size = 320;
		g.font = `800 ${size}px Montserrat`;
		while (g.measureText(value).width > cw * 0.95 && size > 60) {
			size -= 10;
			g.font = `800 ${size}px Montserrat`;
		}
		g.fillText(value, cw / 2, ch / 2);
		const d = g.getImageData(0, 0, cw, ch).data;
		const out: [number, number][] = [];
		for (let y = 0; y < ch; y += 7) for (let x = 0; x < cw; x += 7) if (d[(y * cw + x) * 4 + 3] > 128) out.push([x / cw, y / ch]);
		return out.slice(0, 2600);
	}, [value]);
	const bw = W * 0.92;
	const bh = bw * 0.4;
	return (
		<svg width={W} height={H} style={{position: 'absolute', inset: 0, filter: `drop-shadow(0 0 ${(W / 1080) * 10}px ${color})`}}>
			{pts.map(([x, y], i) => {
				const k = interpolate(t, [0.05 + rnd(i) * 0.4, 0.9 + rnd(i) * 0.3], [0, 1], {...C, easing: EASE});
				const sx = rnd(i + 1) * W;
				const sy = rnd(i + 2) * H;
				const tx = (W - bw) / 2 + x * bw;
				const ty = (H - bh) / 2 + y * bh;
				const tw = 0.55 + 0.45 * Math.sin(t * 3 + i);
				return <circle key={i} cx={sx + (tx - sx) * k} cy={sy + (ty - sy) * k} r={(W / 1080) * 3.6} fill={i % 3 ? color : '#ffffff'} opacity={Math.min(1, k * (0.75 + 0.35 * tw))} />;
			})}
		</svg>
	);
};

// ---------------------------------------------------------------- šablony
export const GfxView: React.FC<{g: Gfx; t: number; dur: number; fps: number; W: number; H: number; theme: Theme}> = ({g, t, dur, fps, W, H, theme}) => {
	const vertical = H > W * 1.4;
	const u = (Math.min(W, H) / 1080) * (vertical ? 1.18 : 1);
	const col = fg(theme);
	const pad = W * 0.08;
	const center: React.CSSProperties = {alignItems: 'center', justifyContent: 'center', padding: pad, flexDirection: 'column'};
	switch (g.type) {
		case 'headline':
		case 'reveal':
			return (
				<AbsoluteFill style={center}>
					{g.type === 'headline' && g.sub ? <Label text={g.sub} t={t} fps={fps} u={u} theme={theme} /> : null}
					<Reveal text={g.text} highlight={g.highlight} t={t} fps={fps} size={(g.text.length > 30 ? 82 : g.text.length > 16 ? 100 : 128) * u} color={col} theme={theme} maxWidth={W - pad * 2} marker={g.type === 'headline' ? undefined : false} />
				</AbsoluteFill>
			);
		case 'stat': {
			const k = interpolate(t, [0.1, 0.9], [0, 1], {...C, easing: EASE});
			const shown = countUp(g.value, k);
			const ring = interpolate(t, [0.05, 1.1], [0, 1], {...C, easing: EASE});
			const R = Math.min(W * 0.36, 330 * u);
			const numSize = Math.min(220 * u, (R * 1.5) / Math.max(g.value.length * 0.6, 1.2));
			return (
				<AbsoluteFill style={center}>
					<div style={{position: 'relative', width: R * 2.4, height: R * 2.4, display: 'grid', placeItems: 'center', scale: String(0.9 + 0.1 * sp(t, fps))}}>
						<svg width={R * 2.4} height={R * 2.4} style={{position: 'absolute', inset: 0}}>
							<circle cx={R * 1.2} cy={R * 1.2} r={R} fill="none" stroke={light(theme) ? '#E2D7C4' : '#ffffff14'} strokeWidth={14 * u} />
							<circle cx={R * 1.2} cy={R * 1.2} r={R} fill="none" stroke={theme.accent} strokeWidth={14 * u} strokeLinecap="round" strokeDasharray={2 * Math.PI * R} strokeDashoffset={2 * Math.PI * R * (1 - ring * 0.82)} transform={`rotate(-90 ${R * 1.2} ${R * 1.2})`} style={{filter: `drop-shadow(0 0 ${18 * u}px ${theme.accent})`}} />
						</svg>
						<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: numSize, color: col, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textShadow: light(theme) ? 'none' : `0 0 ${40 * u}px ${theme.accent}55`}}>{shown}</div>
					</div>
					<div style={{maxWidth: W * 0.84, textAlign: 'center', marginTop: 10 * u}}>
						<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 56 * u, color: col, lineHeight: 1.12, opacity: interpolate(t, [0.35, 0.65], [0, 1], C), translate: `0 ${(interpolate(t, [0.35, 0.65], [20, 0], C) * u).toFixed(2)}px`}}>{g.label}</div>
						{g.sub ? <div style={{fontFamily: 'Inter', fontWeight: 500, fontSize: 38 * u, color: sub(theme), marginTop: 12 * u, opacity: interpolate(t, [0.6, 0.9], [0, 1], C)}}>{g.sub}</div> : null}
					</div>
				</AbsoluteFill>
			);
		}
		case 'particles':
			return (
				<AbsoluteFill>
					<ParticleNumber value={g.value} t={t} W={W} H={H} color={theme.bg === 'brand' || theme.accent === '#FFFFFF' ? '#dff0ff' : theme.accent} />
					<AbsoluteFill style={{...center, justifyContent: 'flex-end', paddingBottom: H * 0.2}}>
						{g.text ? <Reveal text={g.text} t={t - 0.7} fps={fps} size={(g.text.length > 22 ? 66 : 84) * u} color="#fff" theme={{...theme, bg: 'black'}} maxWidth={W - pad * 2} /> : null}
					</AbsoluteFill>
				</AbsoluteFill>
			);
		case 'list':
			return (
				<AbsoluteFill style={center}>
					<div style={{width: '100%', maxWidth: 960 * u, background: light(theme) ? '#FFFFFF' : 'rgba(255,255,255,0.06)', border: light(theme) ? 'none' : '1px solid rgba(255,255,255,0.12)', borderRadius: 40 * u, padding: `${52 * u}px ${48 * u}px`, boxShadow: light(theme) ? `0 ${30 * u}px ${80 * u}px rgba(60,40,10,0.18)` : `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.35)`, translate: `0 ${((1 - sp(t, fps)) * 60 * u).toFixed(2)}px`}}>
						<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 72 * u, color: col, letterSpacing: '-0.02em', marginBottom: 30 * u, lineHeight: 1.1}}>{g.title}</div>
						{g.items.slice(0, 5).map((it, i) => {
							const d = at(g, i, 0.35 + i * Math.max(0.18, (dur - 1) / Math.max(g.items.length, 1)));
							const k = sp(t, fps, d);
							const chk = interpolate(t, [d + 0.15, d + 0.4], [0, 1], {...C, easing: EASE});
							return (
								<div key={i} style={{display: 'flex', alignItems: 'center', gap: 26 * u, padding: `${18 * u}px 0`, borderTop: i ? `1px solid ${light(theme) ? '#EFE7D8' : 'rgba(255,255,255,0.08)'}` : 'none', opacity: Math.min(1, k * 1.4), translate: `${((1 - k) * 40 * u).toFixed(2)}px 0`}}>
									<div style={{width: 66 * u, height: 66 * u, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: chk > 0.5 ? theme.accent : 'transparent', border: `${4 * u}px solid ${chk > 0.5 ? theme.accent : light(theme) ? '#D9CCB6' : '#ffffff40'}`, fontFamily: mono, fontSize: 28 * u, color: chk > 0.5 ? '#fff' : col, boxShadow: chk > 0.5 ? `0 0 ${24 * u}px ${theme.accent}88` : 'none'}}>
										{chk > 0.5 ? <Ico name="check" size={34 * u} color="#fff" stroke={3} /> : String(i + 1).padStart(2, '0')}
									</div>
									<div style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 52 * u, color: col, letterSpacing: '-0.01em', lineHeight: 1.15}}>{it}</div>
								</div>
							);
						})}
					</div>
				</AbsoluteFill>
			);
		case 'quote':
			return (
				<AbsoluteFill style={center}>
					<div style={{fontFamily: theme.serif, fontStyle: 'italic', fontSize: 240 * u, lineHeight: 0.6, color: theme.accent, opacity: interpolate(t, [0, 0.3], [0, 1], C), height: 120 * u}}>“</div>
					<Reveal text={g.text} highlight={g.highlight} t={t - 0.1} fps={fps} size={(g.text.length > 40 ? 76 : 96) * u} color={col} theme={theme} font={theme.serif} maxWidth={W - pad * 2.2} stagger={0.05} />
					{g.sub ? <div style={{fontFamily: mono, fontSize: 30 * u, letterSpacing: '0.14em', textTransform: 'uppercase', color: sub(theme), marginTop: 40 * u, opacity: interpolate(t, [0.6, 0.9], [0, 1], C)}}>{g.sub}</div> : null}
				</AbsoluteFill>
			);
		case 'chat':
			return (
				<AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
					{g.messages.slice(0, 5).map((m, i) => {
						const d = at(g, i, 0.15 + i * Math.max(0.35, (dur - 0.6) / g.messages.length));
						const k = sp(t, fps, d, 12, 200);
						const typing = t > d - 0.35 && t < d && m.from === 'them';
						if (t < d - 0.35) return null;
						const me = m.from === 'me';
						return (
							<div key={i} style={{display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', marginBottom: 22 * u}}>
								<div style={{maxWidth: '80%', padding: `${26 * u}px ${34 * u}px`, borderRadius: 42 * u, borderBottomRightRadius: me ? 10 * u : 42 * u, borderBottomLeftRadius: me ? 42 * u : 10 * u, background: me ? '#2F7CF6' : light(theme) ? '#FFFFFF' : '#26282E', color: me || !light(theme) ? '#fff' : '#111', fontFamily: 'Inter', fontWeight: 500, fontSize: 52 * u, lineHeight: 1.25, scale: String(typing ? 1 : 0.6 + 0.4 * k), transformOrigin: me ? 'right bottom' : 'left bottom', opacity: typing ? 1 : Math.min(1, k * 1.5), boxShadow: '0 8px 30px rgba(0,0,0,0.25)'}}>
									{typing ? <Dots t={t} u={u} /> : m.text}
								</div>
							</div>
						);
					})}
				</AbsoluteFill>
			);
		case 'compare': {
			const col2 = (title: string, items: string[], good: boolean, delay: number) => {
				const k = sp(t, fps, delay);
				return (
					<div style={{flex: 1, borderRadius: 34 * u, padding: 38 * u, background: good ? `${theme.accent}22` : light(theme) ? '#fff' : 'rgba(255,255,255,0.05)', border: `${3 * u}px solid ${good ? theme.accent : light(theme) ? '#E6DCCB' : 'rgba(255,255,255,0.1)'}`, opacity: Math.min(1, k * 1.4), translate: `0 ${((1 - k) * 50 * u).toFixed(2)}px`}}>
						<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 62 * u, color: good ? theme.accent : col, marginBottom: 22 * u}}>{title}</div>
						{items.slice(0, 4).map((it, i) => (
							<div key={i} style={{display: 'flex', gap: 14 * u, alignItems: 'center', fontFamily: 'Inter', fontWeight: 600, fontSize: 46 * u, color: col, marginBottom: 16 * u, opacity: interpolate(t, [delay + 0.3 + i * 0.2, delay + 0.5 + i * 0.2], [0, 1], C)}}>
								<Ico name={good ? 'check' : 'x'} size={42 * u} color={good ? '#3CCF8E' : '#FF5C5C'} stroke={3} />
								<span>{it}</span>
							</div>
						))}
					</div>
				);
			};
			return (
				<AbsoluteFill style={{justifyContent: 'center', padding: pad * 0.7}}>
					<div style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 28 * u}}>
						{col2(g.left, g.leftItems, false, 0)}
						{col2(g.right, g.rightItems, true, 0.25)}
					</div>
				</AbsoluteFill>
			);
		}
		case 'slam': {
			const per = Math.max(0.28, dur / g.words.length);
			const i = Math.min(g.words.length - 1, Math.floor(t / per));
			const lt = t - at(g, i, i * per);
			const k = sp(lt, fps, 0, 11, 260);
			const palette = [
				['#0B0B0D', '#FFFFFF'],
				[theme.accent, '#FFFFFF'],
				['#FFFFFF', '#0B0B0D'],
			];
			const [bg, fgc] = palette[i % palette.length];
			const w = g.words[i];
			return (
				<AbsoluteFill style={{background: bg, alignItems: 'center', justifyContent: 'center'}}>
					<div style={{fontFamily: 'Anton', fontSize: Math.min((W * 1.5) / Math.max(w.length, 2), 480 * u), color: fgc, textTransform: 'uppercase', scale: String((1.25 - 0.25 * k) * interpolate(lt, [0, per], [1, 1.06])), lineHeight: 0.9}}>{w}</div>
				</AbsoluteFill>
			);
		}
		case 'timer': {
			const parts = g.value.split(':');
			const tick = Math.floor(t);
			const shown = parts.map((p, i) => (i === parts.length - 1 ? String(Math.max(0, Number(p) - tick)).padStart(p.length, '0') : p)).join(':');
			return (
				<AbsoluteFill style={center}>
					<div style={{fontFamily: mono, fontSize: Math.min(180 * u, (W * 1.6) / Math.max(shown.length, 4)), color: col, letterSpacing: '0.02em', textShadow: light(theme) ? 'none' : `0 0 ${40 * u}px ${theme.accent}`, scale: String(0.9 + 0.1 * sp(t, fps))}}>{shown}</div>
					{g.label ? <div style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 46 * u, color: theme.accent, marginTop: 20 * u}}>{g.label}</div> : null}
				</AbsoluteFill>
			);
		}
		case 'step': {
			const k = sp(t, fps);
			return (
				<AbsoluteFill style={center}>
					<div style={{fontFamily: mono, fontSize: 34 * u, letterSpacing: '0.24em', color: theme.accent, opacity: k}}>KROK {String(g.n).padStart(2, '0')}</div>
					<div style={{fontFamily: theme.serif, fontStyle: 'italic', fontSize: 300 * u, lineHeight: 1, color: theme.accent, scale: String(0.7 + 0.3 * k), margin: `${10 * u}px 0`}}>{g.n}</div>
					<Reveal text={g.title} t={t - 0.15} fps={fps} size={(g.title.length > 22 ? 88 : 124) * u} color={col} theme={theme} maxWidth={W - pad * 2} />
					{g.sub ? <div style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 46 * u, color: sub(theme), marginTop: 24 * u, opacity: interpolate(t, [0.5, 0.8], [0, 1], C), textAlign: 'center'}}>{g.sub}</div> : null}
				</AbsoluteFill>
			);
		}
		case 'chapter': {
			// kapitola: číslo vlevo nahoře se svislou čárou, velký titulek (jako „3 REACHING OUT“)
			const k = sp(t, fps, 0, 16, 120);
			return (
				<AbsoluteFill>
					<div style={{position: 'absolute', left: W * 0.06, top: 0, bottom: 0, width: 6 * u, background: '#fff', opacity: 0.9, translate: `${((1 - k) * W * 0.5).toFixed(1)}px 0`}} />
					<div style={{position: 'absolute', left: W * 0.06 + 40 * u, top: H * 0.05, fontFamily: 'Archivo Black', fontSize: 150 * u, color: '#fff', textShadow: '0 10px 40px rgba(0,0,0,0.25)', translate: `${((1 - k) * W * 0.5).toFixed(1)}px 0`, filter: `blur(${((1 - k) * 10).toFixed(2)}px)`}}>{g.n}</div>
					<AbsoluteFill style={center}>
						<div style={{fontFamily: 'Archivo Black', fontSize: (g.title.length > 22 ? 96 : 128) * u, color: '#fff', textAlign: 'center', lineHeight: 1.02, textTransform: 'uppercase', textShadow: '0 12px 50px rgba(0,0,0,0.3)', opacity: interpolate(t, [0.15, 0.45], [0, 1], C), scale: String(interpolate(t, [0.15, 0.6], [1.12, 1], {...C, easing: EASE}))}}>{g.title}</div>
					</AbsoluteFill>
				</AbsoluteFill>
			);
		}
		case 'chips': {
			// řada tlačítek s ikonami, postupně se rozsvěcují (jako „Create / Write / Learn“)
			const n = g.items.length;
			const active = Math.floor(interpolate(t, [0.5, Math.max(dur - 0.3, 0.8)], [0, n], C));
			return (
				<AbsoluteFill style={center}>
					<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20 * u, maxWidth: W * 0.9}}>
						{g.items.slice(0, 6).map((it, i) => {
							const k = sp(t, fps, at(g, i, i * 0.08));
							const on = i <= active;
							return (
								<div key={i} style={{display: 'flex', alignItems: 'center', gap: 14 * u, padding: `${22 * u}px ${34 * u}px`, borderRadius: 26 * u, border: `${3 * u}px solid ${on ? theme.accent : light(theme) ? '#d9d4ca' : 'rgba(255,255,255,0.35)'}`, background: on ? `${theme.accent}33` : light(theme) ? '#fff' : 'rgba(0,0,0,0.4)', boxShadow: on ? `0 0 ${36 * u}px ${theme.accent}99, inset 0 0 ${20 * u}px ${theme.accent}44` : 'none', color: on && !light(theme) ? '#FFE8C2' : col, fontFamily: 'Inter', fontWeight: 600, fontSize: 48 * u, opacity: Math.min(1, k * 1.4), scale: String(0.8 + 0.2 * k)}}>
									<Ico name={g.icons?.[i]} size={44 * u} color={on ? theme.accent : col} />
									{it}
								</div>
							);
						})}
					</div>
				</AbsoluteFill>
			);
		}
		case 'cards': {
			const n = Math.min(g.items.length, 4);
			const colN = vertical && n > 2 ? 1 : n;
			const cw = colN === 1 ? W * 0.78 : Math.min(330 * u, (W * 0.88 - (colN - 1) * 24 * u) / colN);
			return (
				<AbsoluteFill style={center}>
					{g.title ? (
						<div style={{display: 'flex', alignItems: 'center', gap: 16 * u, padding: `${16 * u}px ${32 * u}px`, borderRadius: 999, background: '#fff', color: '#14163a', fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 50 * u, marginBottom: 40 * u, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', opacity: sp(t, fps)}}>{g.title}</div>
					) : null}
					<div style={{display: 'grid', gridTemplateColumns: `repeat(${colN}, ${cw}px)`, gap: 24 * u}}>
						{g.items.slice(0, 4).map((c, i) => {
							const k = sp(t, fps, at(g, i, 0.15 + i * 0.12), 13, 190);
							return (
								<div key={i} style={{background: '#fff', borderRadius: 34 * u, padding: `${30 * u}px ${32 * u}px`, display: colN === 1 ? 'flex' : 'block', alignItems: 'center', gap: 28 * u, boxShadow: `0 ${20 * u}px ${60 * u}px rgba(0,0,0,0.25)`, opacity: Math.min(1, k * 1.4), translate: `0 ${((1 - k) * 60 * u).toFixed(2)}px`, scale: String(0.9 + 0.1 * k)}}>
									<div style={{fontFamily: mono, fontSize: 26 * u, color: '#5a5f8a', marginBottom: colN === 1 ? 0 : 14 * u}}>[{i + 1}]</div>
									<Ico name={c.icon} size={(colN === 1 ? 70 : 96) * u} color="#16185a" stroke={1.7} />
									<div>
										<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 50 * u, color: '#16185a', marginTop: colN === 1 ? 0 : 18 * u, lineHeight: 1.05}}>{c.title}</div>
										{c.sub ? <div style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 32 * u, color: '#4a4f7a', marginTop: 6 * u}}>{c.sub}</div> : null}
									</div>
								</div>
							);
						})}
					</div>
				</AbsoluteFill>
			);
		}
		case 'gauge': {
			const lvl = Math.min(Math.max(g.level, 0), 1);
			const k = interpolate(t, [0.2, 1.2], [0, lvl], {...C, easing: EASE});
			const R = Math.min(W * 0.34, 320 * u);
			const ang = Math.PI * (1 - k);
			const cx = R * 1.2;
			const cy = R * 1.1;
			const arc = (a0: number, a1: number) => `M ${cx + R * Math.cos(Math.PI * (1 - a0))} ${cy - R * Math.sin(Math.PI * (1 - a0))} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(Math.PI * (1 - a1))} ${cy - R * Math.sin(Math.PI * (1 - a1))}`;
			return (
				<AbsoluteFill style={center}>
					<div style={{background: '#fff', borderRadius: 40 * u, padding: `${40 * u}px ${50 * u}px`, boxShadow: '0 30px 80px rgba(0,0,0,0.25)', textAlign: 'center', scale: String(0.92 + 0.08 * sp(t, fps))}}>
						<div style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 46 * u, color: '#111', marginBottom: 10 * u}}>{g.label}</div>
						<svg width={R * 2.4} height={R * 1.35}>
							<path d={arc(0.02, 0.32)} stroke="#16B86A" strokeWidth={34 * u} fill="none" />
							<path d={arc(0.36, 0.64)} stroke="#F59E0B" strokeWidth={34 * u} fill="none" />
							<path d={arc(0.68, 0.98)} stroke="#EF4444" strokeWidth={34 * u} fill="none" />
							<line x1={cx} y1={cy} x2={cx + R * 0.82 * Math.cos(ang)} y2={cy - R * 0.82 * Math.sin(ang)} stroke="#111" strokeWidth={10 * u} strokeLinecap="round" />
							<circle cx={cx} cy={cy} r={18 * u} fill="#111" />
						</svg>
						<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 110 * u, color: lvl < 0.34 ? '#16B86A' : lvl < 0.67 ? '#F59E0B' : '#EF4444', lineHeight: 1}}>{g.value}</div>
					</div>
				</AbsoluteFill>
			);
		}
		case 'crowd': {
			const k = sp(t, fps);
			const cols = vertical ? 5 : 6;
			const rows = vertical ? 4 : 5;
			const s = (vertical ? W * 0.12 : H * 0.11) * (vertical ? 1 : 1);
			return (
				<AbsoluteFill style={{...center, flexDirection: vertical ? 'column' : 'row', gap: 50 * u}}>
					<div style={{textAlign: 'center', scale: String(0.7 + 0.3 * k)}}>
						<div style={{position: 'relative', width: 260 * u, height: 260 * u, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', boxShadow: `0 0 ${60 * u}px rgba(255,255,255,0.5)`}}>
							<Ico name="user" size={150 * u} color="#1a2a9a" stroke={2.2} />
							<div style={{position: 'absolute', right: 0, top: 10 * u, width: 70 * u, height: 70 * u, borderRadius: '50%', background: theme.accent, display: 'grid', placeItems: 'center', border: `${5 * u}px solid #fff`}}>
								<Ico name="check" size={40 * u} color="#fff" stroke={3} />
							</div>
						</div>
						<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 64 * u, color: '#fff', marginTop: 20 * u}}>{g.you}</div>
					</div>
					<div style={{fontFamily: 'Archivo Black', fontSize: 120 * u, color: '#fff', opacity: interpolate(t, [0.3, 0.5], [0, 1], C), rotate: vertical ? '90deg' : '0deg'}}>&gt;</div>
					<div style={{textAlign: 'center'}}>
						<div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, ${s}px)`, gap: 14 * u}}>
							{Array.from({length: cols * rows}, (_, i) => (
								<div key={i} style={{width: s, height: s, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', display: 'grid', placeItems: 'center', opacity: interpolate(t, [0.4 + rnd(i) * 0.6, 0.7 + rnd(i) * 0.6], [0, 0.35 + 0.4 * rnd(i + 3)], C)}}>
									<Ico name="user" size={s * 0.55} color="#fff" stroke={2} />
								</div>
							))}
						</div>
						<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 50 * u, color: 'rgba(255,255,255,0.65)', marginTop: 20 * u}}>{g.them}</div>
					</div>
				</AbsoluteFill>
			);
		}
		case 'prompt': {
			// AI prompt okno: text se píše po písmenech, svítící okraj, tlačítko odeslat
			const n = Math.floor(interpolate(t, [0.3, Math.max(dur - 0.6, 0.8)], [0, g.text.length], C));
			const caret = Math.floor(t * 2.5) % 2 === 0;
			const bw = W * 0.86;
			return (
				<AbsoluteFill style={center}>
					<div style={{width: bw, minHeight: 300 * u, borderRadius: 40 * u, background: '#050506', border: `${2 * u}px solid ${theme.accent}aa`, boxShadow: `0 0 ${60 * u}px ${theme.accent}55, inset 0 0 ${30 * u}px ${theme.accent}22`, padding: `${36 * u}px ${40 * u}px`, position: 'relative', scale: String(0.94 + 0.06 * sp(t, fps))}}>
						<div style={{fontFamily: 'Inter', fontWeight: 500, fontSize: 52 * u, color: '#fff', lineHeight: 1.3}}>
							{g.text.slice(0, n)}
							<span style={{opacity: caret ? 1 : 0, color: theme.accent}}>|</span>
						</div>
						<div style={{position: 'absolute', right: 30 * u, bottom: 26 * u, width: 90 * u, height: 90 * u, borderRadius: 22 * u, background: theme.accent, display: 'grid', placeItems: 'center', scale: String(n >= g.text.length ? 1 + 0.08 * Math.sin(t * 8) : 1)}}>
							<svg viewBox="0 0 24 24" width={44 * u} height={44 * u} fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
								<path d="M12 19V5M5 12l7-7 7 7" />
							</svg>
						</div>
					</div>
				</AbsoluteFill>
			);
		}
		case 'note': {
			// ručně psaný text na papírové složce (jako „we all know THE SCRIPT“)
			const all = g.lines.join('\n');
			const n = Math.floor(interpolate(t, [0.2, Math.max(dur * 0.6, 0.7)], [0, all.length], C));
			let used = 0;
			const longest = Math.max(...g.lines.map((l) => l.length), 4);
			const noteSize = Math.min(150 * u, (W * 0.62 * 1.7) / longest);
			return (
				<AbsoluteFill style={{background: 'linear-gradient(160deg, #6b4a32 0%, #4a3020 60%, #3a2518 100%)', alignItems: 'center', justifyContent: 'center'}}>
					<AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 3px, transparent 3px 40px)', opacity: 0.6}} />
					<div style={{width: W * 0.76, minHeight: W * 0.5, background: '#E9E4D6', borderRadius: 10 * u, boxShadow: '0 40px 90px rgba(0,0,0,0.5)', rotate: '-1.5deg', padding: `${80 * u}px ${60 * u}px`, scale: String(0.96 + 0.04 * sp(t, fps))}}>
						{g.lines.map((l, i) => {
							const shown = l.slice(0, Math.max(0, n - used));
							used += l.length + 1;
							return (
								<div key={i} style={{fontFamily: 'Kalam', fontSize: noteSize, color: '#141414', lineHeight: 1.15, marginLeft: (i % 2) * 40 * u}}>
									{shown}
								</div>
							);
						})}
					</div>
				</AbsoluteFill>
			);
		}
		case 'bars': {
			// sloupcový graf – sloupce vyrostou postupně, hodnota se načte
			const items = g.items.slice(0, 5);
			const max = Math.max(...items.map((x) => x.value), 1);
			const bw = Math.min(170 * u, (W - pad * 2) / Math.max(items.length, 1) - 30 * u);
			const hMax = H * (vertical ? 0.36 : 0.42);
			return (
				<AbsoluteFill style={center}>
					{g.title ? <div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 70 * u, color: col, marginBottom: 50 * u, textAlign: 'center', opacity: sp(t, fps)}}>{g.title}</div> : null}
					<div style={{display: 'flex', alignItems: 'flex-end', gap: 30 * u, height: hMax + 120 * u}}>
						{items.map((it, i) => {
							const d0 = at(g, i, 0.25 + i * 0.18);
							const k = interpolate(t, [d0, d0 + 0.7], [0, 1], {...C, easing: EASE});
							const top = i === items.findIndex((x) => x.value === max);
							return (
								<div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 * u}}>
									<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 50 * u, color: top ? theme.accent : col, opacity: k}}>{Math.round(it.value * k)}</div>
									<div style={{width: bw, height: Math.max(6 * u, (hMax * it.value * k) / max), borderRadius: `${18 * u}px ${18 * u}px ${6 * u}px ${6 * u}px`, background: top ? theme.accent : light(theme) ? '#d9d2c4' : 'rgba(255,255,255,0.22)', boxShadow: top ? `0 0 ${40 * u}px ${theme.accent}88` : 'none'}} />
									<div style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 34 * u, color: sub(theme), textAlign: 'center', width: bw + 20 * u, lineHeight: 1.1}}>{it.label}</div>
								</div>
							);
						})}
					</div>
				</AbsoluteFill>
			);
		}
		case 'timeline': {
			// časová osa: čára se protáhne a body naskočí jeden po druhém
			const items = g.items.slice(0, 5);
			const line = interpolate(t, [0.15, at(g, items.length - 1, 0.3 + items.length * 0.3) + 0.2], [0, 1], {...C, easing: EASE});
			return (
				<AbsoluteFill style={center}>
					{g.title ? <div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 72 * u, color: col, marginBottom: 50 * u, textAlign: 'center'}}>{g.title}</div> : null}
					<div style={{position: 'relative', width: W - pad * 2.4, paddingLeft: 90 * u}}>
						<div style={{position: 'absolute', left: 30 * u, top: 20 * u, width: 6 * u, height: `calc(${line * 100}% - ${40 * u}px)`, background: theme.accent, borderRadius: 6 * u, boxShadow: `0 0 ${20 * u}px ${theme.accent}`}} />
						{items.map((it, i) => {
							const k = sp(t, fps, at(g, i, 0.3 + i * 0.3));
							return (
								<div key={i} style={{position: 'relative', display: 'flex', alignItems: 'center', minHeight: 130 * u, opacity: Math.min(1, k * 1.4), translate: `${((1 - k) * 40 * u).toFixed(1)}px 0`}}>
									<div style={{position: 'absolute', left: -78 * u, width: 42 * u, height: 42 * u, borderRadius: '50%', background: theme.accent, border: `${6 * u}px solid ${light(theme) ? '#fff' : '#0b0c10'}`, boxShadow: `0 0 ${24 * u}px ${theme.accent}`}} />
									<div style={{fontFamily: mono, fontSize: 30 * u, color: theme.accent, width: 90 * u}}>{String(i + 1).padStart(2, '0')}</div>
									<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 58 * u, color: col, lineHeight: 1.1}}>{it}</div>
								</div>
							);
						})}
					</div>
				</AbsoluteFill>
			);
		}
		case 'bigicon': {
			// obří ikona se září + krátký text
			const k = sp(t, fps, 0, 12, 160);
			return (
				<AbsoluteFill style={center}>
					<div style={{width: 380 * u, height: 380 * u, borderRadius: 110 * u, display: 'grid', placeItems: 'center', background: light(theme) ? '#fff' : 'rgba(255,255,255,0.06)', border: `${3 * u}px solid ${theme.accent}66`, boxShadow: `0 0 ${90 * u}px ${theme.accent}55, inset 0 0 ${60 * u}px ${theme.accent}22`, scale: String(0.6 + 0.4 * k), rotate: `${((1 - k) * -12).toFixed(2)}deg`}}>
						<Ico name={g.icon} size={220 * u} color={theme.accent} stroke={1.8} />
					</div>
					<div style={{marginTop: 60 * u}}>
						<Reveal text={g.text} t={t - 0.3} fps={fps} size={(g.text.length > 20 ? 78 : 100) * u} color={col} theme={theme} maxWidth={W - pad * 2} />
					</div>
					{g.sub ? <div style={{fontFamily: 'Inter', fontWeight: 500, fontSize: 40 * u, color: sub(theme), marginTop: 18 * u, opacity: interpolate(t, [0.7, 1], [0, 1], C)}}>{g.sub}</div> : null}
				</AbsoluteFill>
			);
		}
		case 'question': {
			// velký otazník + otázka
			const k = sp(t, fps, 0, 10, 140);
			return (
				<AbsoluteFill style={center}>
					<div style={{fontFamily: theme.serif, fontStyle: 'italic', fontSize: 520 * u, lineHeight: 0.8, color: theme.accent, scale: String(0.5 + 0.5 * k), rotate: `${(Math.sin(t * 2) * 4).toFixed(2)}deg`, textShadow: light(theme) ? 'none' : `0 0 ${80 * u}px ${theme.accent}88`}}>?</div>
					<div style={{marginTop: 30 * u}}>
						<Reveal text={g.text} t={t - 0.35} fps={fps} size={(g.text.length > 30 ? 72 : 92) * u} color={col} theme={theme} maxWidth={W - pad * 2} />
					</div>
				</AbsoluteFill>
			);
		}
		case 'progress': {
			// ukazatel průběhu s procenty
			const lv = Math.min(Math.max(g.level, 0), 1);
			const k = interpolate(t, [0.25, 1.3], [0, lv], {...C, easing: EASE});
			const bw = W - pad * 2.4;
			return (
				<AbsoluteFill style={center}>
					<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 200 * u, color: col, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: light(theme) ? 'none' : `0 0 ${50 * u}px ${theme.accent}66`}}>{Math.round(k * 100)} %</div>
					<div style={{width: bw, height: 54 * u, borderRadius: 999, background: light(theme) ? '#e6dfd2' : 'rgba(255,255,255,0.12)', marginTop: 40 * u, overflow: 'hidden', border: `${2 * u}px solid ${light(theme) ? '#d6ccb9' : 'rgba(255,255,255,0.18)'}`}}>
						<div style={{width: `${k * 100}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${theme.accent}aa, ${theme.accent})`, boxShadow: `0 0 ${30 * u}px ${theme.accent}`}} />
					</div>
					<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 62 * u, color: col, marginTop: 40 * u, textAlign: 'center'}}>{g.label}</div>
					{g.text ? <div style={{fontFamily: 'Inter', fontWeight: 500, fontSize: 40 * u, color: sub(theme), marginTop: 12 * u}}>{g.text}</div> : null}
				</AbsoluteFill>
			);
		}
		case 'kinetic': {
			// kinetická typografie: slova pod sebou, střídá se tučné a elegantní kurzíva, každé vjede jinak
			const words = g.words.slice(0, 5);
			const per = Math.max(0.16, (dur - 0.6) / Math.max(words.length, 1));
			return (
				<AbsoluteFill style={center}>
					{words.map((w, i) => {
						const k = sp(t, fps, at(g, i, 0.05 + i * per), 13, 190);
						const serif = i % 2 === 1;
						const size = Math.min((serif ? 170 : 190) * u, (W * 1.5) / Math.max(w.length, 3));
						return (
							<div key={i} style={{fontFamily: serif ? theme.serif : theme.font, fontStyle: serif ? 'italic' : 'normal', fontWeight: serif ? 400 : fw(theme.font), fontSize: size, lineHeight: 0.98, color: serif ? theme.accent : col, textTransform: serif ? 'none' : 'uppercase', letterSpacing: serif ? 0 : '-0.03em', opacity: Math.min(1, k * 1.5), translate: `${((1 - k) * (i % 2 ? 160 : -160) * u).toFixed(1)}px 0`, filter: `blur(${((1 - k) * 10).toFixed(2)}px)`}}>
								{w}
							</div>
						);
					})}
				</AbsoluteFill>
			);
		}
		case 'custom': {
			// grafika na míru (AI ji složí pro konkrétní místo videa ze stejných stavebních prvků jako šablony)
			const items = g.items.slice(0, 6);
			const glass = light(theme) ? {background: '#fff', border: 'none', boxShadow: `0 ${24 * u}px ${70 * u}px rgba(60,40,10,0.16)`} : {background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: `0 ${24 * u}px ${70 * u}px rgba(0,0,0,0.35)`};
			const mark = (it: CustomItem, size: number) =>
				it.kind === 'number' ? (
					<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: size, color: theme.accent, lineHeight: 1, letterSpacing: '-0.03em', textShadow: light(theme) ? 'none' : `0 0 ${30 * u}px ${theme.accent}77`, whiteSpace: 'nowrap'}}>{it.text}</div>
				) : it.kind === 'check' || it.kind === 'cross' ? (
					<div style={{width: size * 0.9, height: size * 0.9, borderRadius: '50%', display: 'grid', placeItems: 'center', background: it.kind === 'check' ? theme.accent : '#e5484d', flex: 'none'}}>
						<Ico name={it.kind === 'check' ? 'check' : 'x'} size={size * 0.5} color="#fff" stroke={3} />
					</div>
				) : it.kind === 'badge' ? (
					<div style={{padding: `${8 * u}px ${20 * u}px`, borderRadius: 999, background: theme.accent, fontFamily: mono, fontSize: size * 0.32, color: light(theme) ? '#fff' : '#0b0c10', fontWeight: 600, whiteSpace: 'nowrap'}}>{it.icon || 'TIP'}</div>
				) : (
					<div style={{width: size, height: size, borderRadius: size * 0.28, display: 'grid', placeItems: 'center', background: `${theme.accent}22`, border: `${2 * u}px solid ${theme.accent}66`, flex: 'none'}}>
						<Ico name={it.icon || 'star'} size={size * 0.56} color={theme.accent} stroke={2} />
					</div>
				);
			const label = (it: CustomItem, size: number, align: 'left' | 'center') => (
				<div style={{textAlign: align}}>
					{it.kind !== 'number' && it.text ? <div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: size, color: col, lineHeight: 1.1, letterSpacing: '-0.01em'}}>{it.text}</div> : null}
					{it.sub ? <div style={{fontFamily: 'Inter', fontWeight: 500, fontSize: size * 0.62, color: sub(theme), marginTop: 6 * u, lineHeight: 1.2}}>{it.sub}</div> : null}
				</div>
			);
			const title = g.title ? <div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 70 * u, color: col, textAlign: 'center', marginBottom: 40 * u, lineHeight: 1.1, opacity: sp(t, fps), letterSpacing: '-0.02em'}}>{g.title}</div> : null;
			const enter = (i: number, base: number) => {
				const k = sp(t, fps, at(g, i, base + i * 0.28), 14, 180);
				return {opacity: Math.min(1, k * 1.4), translate: `0 ${((1 - k) * 46 * u).toFixed(1)}px`, scale: String(0.92 + 0.08 * k)};
			};
			if (g.layout === 'hero') {
				const it = items[0] ?? {kind: 'text', text: ''};
				return (
					<AbsoluteFill style={center}>
						{title}
						<div style={{...enter(0, 0.1), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 * u}}>
							{mark(it, it.kind === 'number' ? Math.min(240 * u, (W * 1.4) / Math.max((it.text ?? '').length, 3)) : 230 * u)}
							{label(it.kind === 'number' ? {...it, text: undefined} : it, 72 * u, 'center')}
						</div>
						{items.slice(1).map((x, i) => (
							<div key={i} style={{...enter(i + 1, 0.5), marginTop: 26 * u}}>
								{label(x, 48 * u, 'center')}
							</div>
						))}
					</AbsoluteFill>
				);
			}
			if (g.layout === 'row' || g.layout === 'grid') {
				const cols = g.layout === 'grid' ? 2 : vertical ? Math.min(items.length, 2) : Math.min(items.length, 4);
				const cw = (W - pad * 2 - (cols - 1) * 26 * u) / cols;
				return (
					<AbsoluteFill style={center}>
						{title}
						<div style={{display: 'flex', flexWrap: 'wrap', gap: 26 * u, justifyContent: 'center', width: W - pad * 2}}>
							{items.map((it, i) => (
								<div key={i} style={{...glass, ...enter(i, 0.2), width: cw, borderRadius: 34 * u, padding: `${36 * u}px ${26 * u}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 * u}}>
									{mark(it, it.kind === 'number' ? 110 * u : 110 * u)}
									{label(it, 46 * u, 'center')}
								</div>
							))}
						</div>
						{g.note ? <div style={{fontFamily: 'Inter', fontWeight: 500, fontSize: 38 * u, color: sub(theme), marginTop: 34 * u, textAlign: 'center'}}>{g.note}</div> : null}
					</AbsoluteFill>
				);
			}
			return (
				<AbsoluteFill style={center}>
					{title}
					<div style={{display: 'flex', flexDirection: 'column', gap: 20 * u, width: Math.min(W - pad * 2, 940 * u)}}>
						{items.map((it, i) => (
							<div key={i} style={{...glass, ...enter(i, 0.2), borderRadius: 30 * u, padding: `${26 * u}px ${32 * u}px`, display: 'flex', alignItems: 'center', gap: 28 * u}}>
								{mark(it, it.kind === 'number' ? 80 * u : 84 * u)}
								{label(it, 52 * u, 'left')}
							</div>
						))}
					</div>
					{g.note ? <div style={{fontFamily: 'Inter', fontWeight: 500, fontSize: 38 * u, color: sub(theme), marginTop: 30 * u, textAlign: 'center'}}>{g.note}</div> : null}
				</AbsoluteFill>
			);
		}
		default:
			return null;
	}
};

// ---------------------------------------------------------------- šablony PŘES záběr mluvčího
export const OverlayView: React.FC<{g: Gfx; t: number; dur: number; fps: number; W: number; H: number; theme: Theme}> = ({g, t, dur, fps, W, H, theme}) => {
	const vertical = H > W * 1.4;
	const u = (Math.min(W, H) / 1080) * (vertical ? 1.18 : 1);
	const o = interpolate(t, [dur - 0.2, dur], [1, 0], C);
	const shadow = '0 6px 40px rgba(0,0,0,0.55)';
	if (g.type === 'versus') {
		// dvě strany přes mluvčího: ikona + velký text vlevo a vpravo (jako „Claude Code 1 DAY / Pro 5 DAYS“)
		const side = (txt: string, s: string | undefined, icon: string | undefined, left: boolean, d: number) => {
			const k = sp(t, fps, d, 14, 170);
			return (
				<div style={{position: 'absolute', top: vertical ? H * 0.2 : H * 0.18, [left ? 'left' : 'right']: W * 0.04, width: W * 0.4, textAlign: 'center', opacity: Math.min(1, k * 1.4) * o, translate: `${((1 - k) * (left ? -80 : 80) * u).toFixed(1)}px 0`, filter: `blur(${((1 - k) * 8).toFixed(2)}px)`}}>
					<div style={{display: 'grid', placeItems: 'center', marginBottom: 14 * u, filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.45))'}}>
						<Ico name={icon} size={(vertical ? 150 : 200) * u} color={left ? theme.accent : '#fff'} stroke={2.4} />
					</div>
					<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: (vertical ? 66 : 84) * u, color: '#fff', lineHeight: 1.02, textShadow: shadow}}>{txt}</div>
					{s ? <div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: (vertical ? 58 : 76) * u, color: '#fff', textTransform: 'uppercase', textShadow: shadow}}>{s}</div> : null}
				</div>
			);
		};
		return (
			<AbsoluteFill>
				{side(g.left, g.leftSub, g.leftIcon, true, 0)}
				{side(g.right, g.rightSub, g.rightIcon, false, 0.2)}
			</AbsoluteFill>
		);
	}
	if (g.type === 'side') {
		// karty vedle mluvčího (YouTube vpravo, Reels nahoře) – naskakují postupně
		const items = g.items.slice(0, vertical ? 3 : 4);
		return (
			<AbsoluteFill>
				{items.map((c, i) => {
					const k = sp(t, fps, at(g, i, 0.1 + i * 0.25), 13, 180);
					const cw = vertical ? W * 0.27 : W * 0.17;
					const x = vertical ? W * 0.06 + i * (cw + W * 0.04) : W * 0.56 + (i % 2) * W * 0.21;
					const y = vertical ? H * 0.12 : H * 0.1 + Math.floor(i / 2) * H * 0.4 + (i % 2) * H * 0.12;
					return (
						<div key={i} style={{position: 'absolute', left: x, top: y, width: cw, opacity: Math.min(1, k * 1.4) * o, scale: String(0.7 + 0.3 * k), translate: `0 ${(Math.sin(t * 1.6 + i) * 6 * u).toFixed(2)}px`}}>
							<div style={{aspectRatio: '16 / 10', borderRadius: 26 * u, background: i % 2 ? '#fff' : '#0d0f14', border: `${4 * u}px solid #fff`, display: 'grid', placeItems: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.45)'}}>
								<Ico name={c.icon} size={cw * 0.32} color={i % 2 ? '#111' : theme.accent} stroke={1.8} />
							</div>
							<div style={{fontFamily: 'Archivo Black', fontSize: (vertical ? 34 : 40) * u, color: '#fff', textAlign: 'center', marginTop: 10 * u, textTransform: 'uppercase', textShadow: shadow, lineHeight: 1.05}}>{c.title}</div>
						</div>
					);
				})}
			</AbsoluteFill>
		);
	}
	if (g.type === 'pill') {
		// skleněný štítek přes záběr (jako „and clients have no idea?“)
		const k = sp(t, fps, 0, 14, 160);
		return (
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
				<div style={{padding: `${34 * u}px ${70 * u}px`, borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.45)', backdropFilter: 'blur(18px) saturate(1.4)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35), 0 20px 60px rgba(0,0,0,0.3)', opacity: Math.min(1, k * 1.4) * o, scale: String(0.85 + 0.15 * k), maxWidth: W * 0.9}}>
					<div style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 60 * u, color: '#fff', textAlign: 'center', textShadow: '0 2px 12px rgba(0,0,0,0.35)', letterSpacing: '-0.01em'}}>{g.text}</div>
				</div>
			</AbsoluteFill>
		);
	}
	if (g.type === 'lowerthird') {
		// jmenovka dole: barevný proužek vyjede zleva, pak text
		const k = sp(t, fps, 0, 15, 170);
		const k2 = sp(t, fps, 0.15, 15, 170);
		return (
			<AbsoluteFill>
				<div style={{position: 'absolute', left: W * 0.06, top: H * (vertical ? 0.47 : 0.7), opacity: o, display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
					<div style={{display: 'inline-flex', alignItems: 'center', gap: 20 * u, padding: `${22 * u}px ${36 * u}px`, background: theme.accent, borderRadius: 18 * u, clipPath: `inset(0 ${((1 - k) * 100).toFixed(1)}% 0 0)`, boxShadow: '0 16px 40px rgba(0,0,0,0.35)'}}>
						<span style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 62 * u, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 2px 10px rgba(0,0,0,0.25)'}}>{g.title}</span>
					</div>
					{g.sub ? (
						<div style={{marginTop: 10 * u, display: 'inline-block', padding: `${12 * u}px ${28 * u}px`, background: 'rgba(10,11,14,0.78)', borderRadius: 14 * u, clipPath: `inset(0 ${((1 - k2) * 100).toFixed(1)}% 0 0)`, fontFamily: 'Inter', fontWeight: 600, fontSize: 38 * u, color: '#fff', whiteSpace: 'nowrap'}}>{g.sub}</div>
					) : null}
				</div>
			</AbsoluteFill>
		);
	}
	if (g.type === 'counter') {
		// číslo, které se načítá přes záběr (mluvčí zůstává vidět)
		const kk = interpolate(t, [0.1, 1.1], [0, 1], {...C, easing: EASE});
		const shown = countUp(g.value, kk);
		const k = sp(t, fps, 0, 13, 170);
		return (
			<AbsoluteFill style={{alignItems: 'center'}}>
				<div style={{marginTop: H * (vertical ? 0.13 : 0.1), textAlign: 'center', opacity: Math.min(1, k * 1.4) * o, scale: String(0.8 + 0.2 * k)}}>
					<div style={{fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: Math.min(230 * u, (W * 1.5) / Math.max(g.value.length, 3)), color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 ${50 * u}px ${theme.accent}, 0 8px 30px rgba(0,0,0,0.6)`}}>{shown}</div>
					{g.label ? <div style={{fontFamily: 'Inter', fontWeight: 700, fontSize: 46 * u, color: '#fff', marginTop: 10 * u, textShadow: shadow, textTransform: 'uppercase', letterSpacing: '0.04em'}}>{g.label}</div> : null}
				</div>
			</AbsoluteFill>
		);
	}
	if (g.type === 'marquee') {
		// šikmý pás s běžícím textem přes záběr
		const k = sp(t, fps, 0, 15, 160);
		const unit = `${g.text.toUpperCase()}  •  `;
		return (
			<AbsoluteFill style={{justifyContent: 'center', opacity: o}}>
				<div style={{position: 'absolute', left: -W * 0.2, width: W * 1.4, top: H * 0.22, rotate: '-6deg', background: theme.accent, padding: `${18 * u}px 0`, overflow: 'hidden', whiteSpace: 'nowrap', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', clipPath: `inset(0 ${((1 - k) * 100).toFixed(1)}% 0 0)`}}>
					<div style={{display: 'inline-block', translate: `${(-((t * 260 * u) % (unit.length * 34 * u))).toFixed(1)}px 0`, fontFamily: theme.font, fontWeight: fw(theme.font), fontSize: 64 * u, color: '#fff', letterSpacing: '0.02em'}}>{unit.repeat(12)}</div>
				</div>
			</AbsoluteFill>
		);
	}
	return null;
};

// štítek přes záběr mluvčího (krátká informace, mluvčí zůstává vidět)
export const Chip: React.FC<{text: string; t: number; dur: number; fps: number; W: number; H: number; theme: Theme; y?: number}> = ({text, t, dur, fps, W, H, theme, y = 0.16}) => {
	const u = Math.min(W, H) / 1080;
	const k = sp(t, fps, 0, 13, 190);
	const o = interpolate(t, [dur - 0.15, dur], [1, 0], C);
	return (
		<div style={{position: 'absolute', left: 0, right: 0, top: H * y, display: 'flex', justifyContent: 'center', opacity: Math.min(k * 1.4, 1) * o}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 16 * u, padding: `${18 * u}px ${34 * u}px`, borderRadius: 999, background: 'rgba(12,13,16,0.6)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(14px)', scale: String(0.7 + 0.3 * k), boxShadow: '0 10px 40px rgba(0,0,0,0.35)'}}>
				<span style={{width: 18 * u, height: 18 * u, borderRadius: '50%', background: theme.accent, boxShadow: `0 0 ${18 * u}px ${theme.accent}`}} />
				<span style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 42 * u, color: '#fff', letterSpacing: '-0.01em'}}>{text}</span>
			</div>
		</div>
	);
};
