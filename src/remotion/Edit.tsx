import React from 'react';
import {AbsoluteFill, Audio, Easing, interpolate, interpolateColors, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {caseText, CaptionStyle, FORMATS, Group, LaidBeat, LaidCard, Layout, layout, Project, TlWord} from '../model';
import {loadFonts} from './fonts';
import type {ZoomStyle} from '../setup';
import {Bg, Chip, Enter, fw, GfxView, Grain, OVERLAY_TYPES, OverlayView, Theme} from './gfx';

loadFonts();

// scale: náhled v editoru běží v polovičním rozlišení (4× méně pixelů = plynulé přehrávání), render v plném
export type EditProps = {project: Project; mediaBase: string; quality: 'preview' | 'full'; scale?: number};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const themeOf = (p: Project): Theme => ({
	accent: p.look.accent,
	bg: p.look.theme?.bg ?? (p.look.cardKind === 'cream' ? 'cream' : 'dark'),
	font: p.look.theme?.font ?? (p.look.preset === 'creator' ? 'Archivo Black' : 'Montserrat'),
	serif: p.look.theme?.serif ?? 'DM Serif Display',
	brand: p.look.theme?.brand,
});

// ---------------------------------------------------------------- zoomy na mluvčího (autor si vybírá v průvodci; výchozí = kamera stojí)
// punch: tvrdý skok na 110 % po dobu beatu · pulse: rychlý nájezd na 112 % a usazení na 108 % · ken: plynule 100 → 110 % přes větu
// creep: každý záběr pomalu jede 100 → 104 % (101, 102, 103…), střih ho vrátí · jump: řeší souvislé video (střídání 100/112 %)
export const zoomAt = (style: ZoomStyle, t: number, beat: LaidBeat | null, clip: {start: number; dur: number} | null, hookZoom: number): number => {
	let z = 1;
	if (beat?.kind === 'punch') {
		const lt = t - beat.start;
		const d = beat.end - beat.start;
		if (style === 'pulse') z = lt < 0.22 ? interpolate(lt, [0, 0.22], [1, 1.12], {...clamp, easing: EASE}) : interpolate(lt, [0.22, 0.6], [1.12, 1.08], {...clamp, easing: EASE});
		else if (style === 'ken') z = interpolate(lt, [0, d], [1, 1.1], {...clamp, easing: Easing.inOut(Easing.cubic)});
		else if (style !== 'none' && style !== 'creep') z = 1.1;
	}
	if (style === 'creep' && clip) z = Math.max(z, 1 + 0.04 * Math.min(1, (t - clip.start) / Math.max(clip.dur, 0.5)));
	return Math.max(z, hookZoom);
};

export const HOOK_END = 2.3;
// hook = vlastní grafika prvních ~2,3 s (nadpis / rámeček / půlka / celá obrazovka / nájezd), text napsal autor nebo navrhla AI
export const hookBeat = (p: Project, L: Layout): LaidBeat | null => {
	const h = p.look.hook;
	const text = (h?.text || p.plan?.hook || '').trim();
	if (!h || !text || !['split', 'full', 'box'].includes(h.visual)) return null;
	const end = Math.min(HOOK_END, L.durationInFrames / L.fps);
	const words = text.split(/\s+/);
	const highlight = [...words].sort((a, b) => b.length - a.length)[0];
	if (h.visual === 'box') return {id: 'hook', wi: 0, dur: end, kind: 'gfx', layout: 'overlay', gfx: {type: 'pill', text}, pos: {x: 0, y: L.fps && p.format === '16:9' ? -0.36 : -0.33, scale: 0.9}, start: 0, end};
	return {id: 'hook', wi: 0, dur: end, kind: 'gfx', layout: h.visual === 'split' ? 'split' : 'full', gfx: {type: 'reveal', text, highlight}, start: 0, end: h.visual === 'full' ? Math.min(1.6, end) : end};
};

export const Edit: React.FC<EditProps> = ({project, mediaBase, quality, scale = 1}) => {
	const L = React.useMemo(() => layout(project), [project]);
	const {fps} = L;
	const W = FORMATS[project.format].w * scale;
	const H = FORMATS[project.format].h * scale;
	const file = quality === 'full' ? project.base.full : project.base.preview;
	const lk = project.look;
	const frame = useCurrentFrame();
	const t = frame / fps;
	const total = L.durationInFrames / fps;
	const theme = themeOf(project);
	const hb = React.useMemo(() => hookBeat(project, L), [project, L]);
	const beats = hb ? [hb, ...L.beats.filter((b) => b.start >= hb.end - 0.01 || b.kind === 'chip')] : L.beats;
	const beat = beats.find((b) => b.kind !== 'chip' && t >= b.start && t < b.end) ?? null;
	const chip = beats.find((b) => b.kind === 'chip' && t >= b.start && t < b.end) ?? null;
	const clipNow = L.clips.find((c) => frame >= c.fromF && frame < c.fromF + c.durF);
	const hookText = (lk.hook?.text || project.plan?.hook || '').trim();
	const hookZoom = lk.hook?.visual === 'zoom' && t < HOOK_END ? interpolate(t, [0, 0.45], [1, 1.14], {...clamp, easing: EASE}) : 1;
	const zoom = zoomAt((lk.zoomStyle ?? (lk.zoom ? 'punch' : 'none')) as ZoomStyle, t, beat, clipNow ? {start: clipNow.fromF / fps, dur: clipNow.durF / fps} : null, hookZoom);
	const card = L.cards.find((c) => t >= c.start && t < c.end) ?? null; // starší projekty
	// grafika přes záběr (srovnání, karty vedle mluvčího, skleněný štítek) – mluvčí zůstává vidět
	const overlay = beat?.kind === 'gfx' && beat.gfx && (beat.layout === 'overlay' || OVERLAY_TYPES.has(beat.gfx.type));
	const covers = beat && !overlay && (beat.kind === 'broll' || (beat.kind === 'gfx' && (beat.layout ?? 'full') === 'full'));
	const endFade = lk.preset === 'cinematic' ? interpolate(t, [total - 0.8, total], [1, 0], clamp) : 1;
	const split = beat?.kind === 'gfx' && beat.layout === 'split';
	const pip = beat?.kind === 'gfx' && beat.layout === 'pip';

	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			<AbsoluteFill style={{opacity: endFade}}>
				{/* mluvčí – podle aktivního beatu na celou plochu / v rámečku / dole ve splitu / v rohu */}
				<Speaker src={file ? mediaBase + file : null} mode={split ? 'split' : pip ? 'pip' : lk.layout === 'framed' ? 'framed' : 'full'} zoom={zoom} t={t} beat={beat} W={W} H={H} accent={theme.accent} mute={lk.muteVoice} />
				{lk.hook?.visual === 'title' && hookText && t < HOOK_END + 0.3 ? <HookTitle text={hookText} t={t} W={W} H={H} theme={theme} /> : null}
				{/* B-roll (hlas běží dál) */}
				{L.beats
					.filter((b) => b.kind === 'broll' && b.broll?.mixkit && b.broll.ready)
					.map((b) => (
						<Sequence key={b.id} from={Math.round(b.start * fps)} durationInFrames={Math.max(1, Math.round((b.end - b.start) * fps))} premountFor={fps}>
							<Broll src={`${mediaBase}broll/${b.id}.mp4`} dur={b.end - b.start} framed={lk.layout === 'framed'} W={W} H={H} />
						</Sequence>
					))}
				{/* motion grafika */}
				{beat?.kind === 'gfx' && beat.gfx && !overlay ? <GfxLayer beat={beat} t={t} fps={fps} W={W} H={H} theme={theme} /> : null}
				{overlay && beat?.gfx ? (
					OVERLAY_TYPES.has(beat.gfx.type) ? (
						<Pos pos={beat.pos} W={W} H={H}>
							<OverlayView g={beat.gfx} t={t - beat.start} dur={beat.end - beat.start} fps={fps} W={W} H={H} theme={beat.font ? {...theme, font: beat.font} : theme} />
						</Pos>
					) : (
						// text přímo přes záběr (montáž bez mluvení): bez pozadí, jen jemné ztmavení kvůli čitelnosti
						<Enter t={t - beat.start} dur={beat.end - beat.start} full>
							<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.12) 70%)'}} />
							<Pos pos={beat.pos} W={W} H={H}>
								<GfxView g={beat.gfx} t={t - beat.start} dur={beat.end - beat.start} fps={fps} W={W} H={H} theme={{...theme, bg: 'dark', ...(beat.font ? {font: beat.font} : {})}} />
							</Pos>
						</Enter>
					)
				) : null}
				{!beat && card && lk.layout !== 'split' ? <LegacyCard card={card} t={t} W={W} H={H} theme={theme} /> : null}
				{/* titulky – schované, když obrazovku zakrývá grafika */}
				{project.captions.enabled && !(beat?.kind === 'gfx' && !overlay && (beat.layout ?? 'full') === 'full') && !pip && beat?.gfx?.type !== 'pill' ? (
					<Captions groups={L.groups} style={project.captions} accent={lk.accent} W={W} H={H} t={t} y={split ? 0.8 : project.captions.y} emojis={project.plan?.emojis} />
				) : null}
				{chip?.chip && !covers ? (
					<Pos pos={chip.pos} W={W} H={H}>
						<Chip text={chip.chip} t={t - chip.start} dur={chip.end - chip.start} fps={fps} W={W} H={H} theme={theme} y={W > H ? 0.07 : 0.125} />
					</Pos>
				) : null}
				{lk.grade !== 'none' ? <Grain t={t} /> : null}
			</AbsoluteFill>
			<Sounds L={L} project={project} mediaBase={mediaBase} />
		</AbsoluteFill>
	);
};

// ---------------------------------------------------------------- mluvčí
// velký nadpis hooku nahoře přes záběr: slova se odhalí s rozostřením, nejdelší slovo v barvě
export const HookTitle: React.FC<{text: string; t: number; W: number; H: number; theme: Theme}> = ({text, t, W, H, theme}) => {
	const words = text.split(/\s+/);
	const u = Math.min(W, H) / 1080;
	const longest = [...words].sort((a, b) => b.length - a.length)[0];
	// velké písmo na 2–3 řádky (hook musí být čitelný na první pohled)
	const size = Math.max(70 * u, Math.min(118 * u, (W * 3.4) / Math.max(text.length, 10)));
	const out = interpolate(t, [HOOK_END - 0.05, HOOK_END + 0.25], [1, 0], clamp);
	return (
		<div style={{position: 'absolute', left: W * 0.07, width: W * 0.86, top: H * (W > H ? 0.07 : 0.095), textAlign: 'center', lineHeight: 1.04, fontFamily: theme.font, fontWeight: 800, fontSize: size, color: '#fff', letterSpacing: '-0.02em', opacity: out, filter: `blur(${((1 - out) * 10 * u).toFixed(2)}px)`}}>
			{words.map((w, i) => {
				const k = interpolate(t, [0.08 + i * 0.09, 0.4 + i * 0.09], [0, 1], {...clamp, easing: EASE});
				const hl = w === longest;
				return (
					<React.Fragment key={i}>
						<span style={{display: 'inline-block', opacity: k, filter: `blur(${((1 - k) * 14 * u).toFixed(2)}px)`, translate: `0 ${((1 - k) * 24 * u).toFixed(2)}px`, color: hl ? (theme.brand ?? theme.accent) : '#fff', textShadow: hl ? `0 0 ${34 * u}px ${theme.brand ?? theme.accent}aa, 0 ${4 * u}px ${18 * u}px rgba(0,0,0,0.6)` : `0 ${4 * u}px ${22 * u}px rgba(0,0,0,0.65)`}}>{w}</span>
						{i < words.length - 1 ? ' ' : ''}
					</React.Fragment>
				);
			})}
		</div>
	);
};

export const Speaker: React.FC<{src: string | null; mode: 'full' | 'framed' | 'split' | 'pip'; zoom: number; t: number; beat: LaidBeat | null; W: number; H: number; accent: string; mute?: boolean}> = ({src, mode, zoom, t, beat, W, H, accent, mute}) => {
	if (!src) return <AbsoluteFill style={{background: '#111'}} />;
	// zoom podle stylu, který si autor vybral (výchozí 1 = kamera stojí)
	const video = <OffthreadVideo src={src} muted={mute} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: mute ? '50% 50%' : '50% 32%', scale: zoom.toFixed(4), transformOrigin: mute ? '50% 50%' : '50% 30%'}} />;
	const u = Math.min(W, H) / 1080;
	if (mode === 'framed') {
		// velký rámeček – mluvčí je hlavní, kolem jen tenký černý okraj
		const w = W * 0.94;
		const h = W > H ? H * 0.86 : H * 0.64;
		return <div style={{position: 'absolute', left: (W - w) / 2, top: (H - h) / 2 - H * 0.015, width: w, height: h, borderRadius: 40 * u, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.6)'}}>{video}</div>;
	}
	if (mode === 'split') {
		const k = beat ? Math.min(interpolate(t - beat.start, [0, 0.4], [0, 1], {...clamp, easing: EASE}), interpolate(t, [beat.end - 0.35, beat.end], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)})) : 1;
		const top = interpolate(k, [0, 1], [0, H * 0.48]);
		return <div style={{position: 'absolute', left: 0, top, width: W, height: H - top, overflow: 'hidden', borderTop: `${4 * u}px solid ${k > 0.02 ? accent : 'transparent'}`}}>{video}</div>;
	}
	if (mode === 'pip') {
		const k = beat ? Math.min(interpolate(t - beat.start, [0, 0.45], [0, 1], {...clamp, easing: EASE}), interpolate(t, [beat.end - 0.4, beat.end], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)})) : 1;
		const s = Math.min(W, H) * 0.34;
		return (
			<div
				style={{
					position: 'absolute',
					zIndex: 5,
					left: interpolate(k, [0, 1], [0, W - s - W * 0.04]),
					top: interpolate(k, [0, 1], [0, H - s - H * 0.05]),
					width: interpolate(k, [0, 1], [W, s]),
					height: interpolate(k, [0, 1], [H, s]),
					borderRadius: interpolate(k, [0, 1], [0, s / 2]),
					overflow: 'hidden',
					outline: `${6 * u}px solid ${k > 0.5 ? accent : 'transparent'}`,
					boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
				}}
			>
				{video}
			</div>
		);
	}
	return <AbsoluteFill>{video}</AbsoluteFill>;
};

export const Broll: React.FC<{src: string; dur: number; framed: boolean; W: number; H: number}> = ({src, dur, framed, W, H}) => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = f / fps;
	// prolnutí 0,3 s s rozostřením, pomalý filmový posun (jako u profi střihu), měkký odchod zpět na mluvčího
	const k = interpolate(t, [0, Math.min(0.3, dur * 0.25)], [0, 1], {...clamp, easing: EASE});
	const o = interpolate(t, [dur - Math.min(0.25, dur * 0.2), dur], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)});
	const push = interpolate(t, [0, Math.max(dur, 0.5)], [1, 1.06]);
	const style: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover', scale: push.toFixed(4)};
	if (framed) {
		const w = W * 0.94;
		const h = W > H ? H * 0.86 : H * 0.64;
		return (
			<div style={{position: 'absolute', left: (W - w) / 2, top: (H - h) / 2 - H * 0.015, width: w, height: h, borderRadius: 40 * (Math.min(W, H) / 1080), overflow: 'hidden', opacity: Math.min(k, o), filter: `blur(${((1 - Math.min(k, o)) * 8).toFixed(2)}px)`}}>
				<OffthreadVideo src={src} muted style={style} />
			</div>
		);
	}
	return (
		<AbsoluteFill style={{opacity: Math.min(k, o), scale: String(interpolate(k, [0, 1], [1.04, 1])), filter: `blur(${((1 - Math.min(k, o)) * 8).toFixed(2)}px)`}}>
			<OffthreadVideo src={src} muted style={style} />
		</AbsoluteFill>
	);
};

// posun a velikost grafiky z timeline (x, y = podíl šířky / výšky)
export const Pos: React.FC<{pos?: {x: number; y: number; scale: number}; W: number; H: number; children: React.ReactNode}> = ({pos, W, H, children}) =>
	pos && (pos.x || pos.y || pos.scale !== 1) ? <AbsoluteFill style={{translate: `${(pos.x * W).toFixed(1)}px ${(pos.y * H).toFixed(1)}px`, scale: String(pos.scale ?? 1)}}>{children}</AbsoluteFill> : <>{children}</>;

export const GfxLayer: React.FC<{beat: LaidBeat; t: number; fps: number; W: number; H: number; theme: Theme}> = ({beat, t, fps, W, H, theme: theme0}) => {
	const theme = beat.font ? {...theme0, font: beat.font} : theme0;
	const lt = t - beat.start;
	const dur = beat.end - beat.start;
	const lay = beat.layout ?? 'full';
	if (lay === 'split') {
		// horní polovina: grafika (zmenšená celá scéna), dolní polovina: mluvčí
		const k = Math.min(interpolate(lt, [0, 0.4], [0, 1], {...clamp, easing: EASE}), interpolate(lt, [dur - 0.35, dur], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)}));
		const h = H * 0.48;
		return (
			<div style={{position: 'absolute', left: 0, top: 0, width: W, height: h * k, overflow: 'hidden'}}>
				<div style={{position: 'absolute', left: 0, top: 0, width: W, height: h}}>
					<Bg theme={theme} t={lt} />
					{/* grafika se rozvrhne přímo do horního panelu (vlastní rozměr, vycentrovaná) */}
					<div style={{position: 'absolute', left: 0, top: 0, width: W, height: h}}>
						<Pos pos={beat.pos} W={W} H={h}>
							<GfxView g={beat.gfx!} t={lt} dur={dur} fps={fps} W={W} H={h} theme={theme} />
						</Pos>
					</div>
				</div>
			</div>
		);
	}
	return (
		<Enter t={lt} dur={dur} full>
			<Bg theme={theme} t={lt} />
			<Pos pos={beat.pos} W={W} H={H}>
				<GfxView g={beat.gfx!} t={lt} dur={dur} fps={fps} W={W} H={H} theme={theme} />
			</Pos>
		</Enter>
	);
};

const LegacyCard: React.FC<{card: LaidCard; t: number; W: number; H: number; theme: Theme}> = ({card, t, W, H, theme}) => {
	const {fps} = useVideoConfig();
	return (
		<Enter t={t - card.start} dur={card.end - card.start} full>
			<Bg theme={theme} t={t - card.start} />
			<GfxView g={{type: 'headline', text: card.text, sub: card.sub}} t={t - card.start} dur={card.end - card.start} fps={fps} W={W} H={H} theme={theme} />
		</Enter>
	);
};

// ---------------------------------------------------------------- titulky
const smooth = (x: number) => {
	const k = Math.min(Math.max(x, 0), 1);
	return k * k * (3 - 2 * k);
};

export const Captions: React.FC<{groups: Group[]; style: CaptionStyle; accent: string; W: number; H: number; t: number; y: number; emojis?: Record<number, string>}> = ({groups, style, accent, W, H, t, y, emojis}) => {
	const {fps} = useVideoConfig();
	const g = groups.find((x) => t >= x.start && t < x.end);
	if (!g) return null;
	const size = style.size * (Math.min(W, H) / 1080);
	const lt = t - g.start;
	const pop = spring({frame: lt * fps, fps, config: {damping: 16, stiffness: 190, mass: 0.7}});
	// „blur“: nástup s rozostřením + pružinou a odchod s rozostřením (jako v referencích)
	const blurIn = style.animation === 'blur';
	const outK = blurIn && g.end - t < 0.12 ? (g.end - t) / 0.12 : 1;
	// slovo po slovu (karaoke / psací stroj / bounce): celý řádek stojí, animují se jednotlivá slova
	const perWord = PER_WORD.has(style.animation);
	const pin = style.animation === 'none' || perWord ? 1 : style.animation === 'pop' || blurIn ? Math.min(pop, outK) : smooth(lt / 0.2);
	const scale = style.animation === 'pop' ? interpolate(pop, [0, 1], [0.8, 1]) : blurIn ? interpolate(pop, [0, 1], [0.9, 1]) : 1;
	const lift = style.animation === 'fade-up' ? (1 - pin) * size * 0.14 : 0;
	const slideX = style.animation === 'slide' ? (1 - pin) * -size * 0.9 : 0;
	const blur = blurIn ? (1 - Math.min(1, pin)) * size * 0.07 : 0;
	const shadow = style.shadow ? `0 0 ${0.3 * size}px rgba(0,0,0,0.75), 0 ${0.04 * size}px ${0.12 * size}px rgba(0,0,0,0.6)` : 'none';
	const hl = style.highlight || accent;
	return (
		<div
			style={{
				position: 'absolute',
				left: W * 0.07,
				width: W * 0.86,
				top: H * y,
				translate: `${slideX.toFixed(1)}px calc(-50% + ${lift}px)`,
				scale: String(scale),
				opacity: style.animation === 'none' ? 1 : Math.min(1, pin * 1.6),
				filter: `blur(${blur.toFixed(2)}px)`,
				textAlign: 'center',
				fontSize: size, // mezery mezi slovy mají velikost písma titulků
				color: style.color,
				textShadow: style.stroke ? 'none' : shadow,
				lineHeight: style.mode === 'bold' ? 1.02 : 1.12,
				WebkitTextStroke: style.stroke ? `${(style.stroke * (Math.min(W, H) / 1080)).toFixed(2)}px ${style.strokeColor ?? '#000'}` : undefined,
				paintOrder: 'stroke fill',
			}}
		>
			<span style={style.box ? {background: style.box, padding: '0.06em 0.28em', borderRadius: size * 0.18, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'} : undefined}>
				{g.words.map((w, i) => (
					<React.Fragment key={w.wi}>
							<WordAnim w={w} style={style} t={t} fps={fps}>
								<CapWord w={w} next={g.words[i + 1]} style={style} size={size} hl={hl} t={t} index={i} />
								{style.emoji && emojis?.[w.wi] ? <Emoji e={emojis[w.wi]} t={t - w.start} fps={fps} size={size} /> : null}
							</WordAnim>
							{i < g.words.length - 1 ? ' ' : ''}
						</React.Fragment>
				))}
			</span>
		</div>
	);
};

// animace jednoho slova: karaoke (nevyslovená ztlumená), psací stroj (slova přibývají), bounce (vyslovené slovo vyskočí)
const PER_WORD = new Set(['karaoke', 'typewriter', 'bounce', 'rise', 'zoom']);
const WordAnim: React.FC<{w: TlWord; style: CaptionStyle; t: number; fps: number; children: React.ReactNode}> = ({w, style, t, fps, children}) => {
	const a = style.animation;
	if (!PER_WORD.has(a)) return <>{children}</>;
	const said = smooth((t - w.start + 0.03) / 0.1);
	if (a === 'rise') {
		// slovo se plynule vynoří zespodu z rozostření (bez skoku)
		const r = interpolate(t, [w.start - 0.06, w.start + 0.22], [0, 1], {...clamp, easing: EASE});
		return <span style={{display: 'inline-block', opacity: r, translate: `0 ${((1 - r) * 0.35).toFixed(3)}em`, filter: `blur(${((1 - r) * 6).toFixed(2)}px)`}}>{children}</span>;
	}
	if (a === 'zoom') {
		// vyslovené slovo dosedne z mírného zvětšení
		const r = interpolate(t, [w.start - 0.04, w.start + 0.2], [0, 1], {...clamp, easing: EASE});
		return <span style={{display: 'inline-block', opacity: Math.min(1, r * 2), scale: String(interpolate(r, [0, 1], [1.35, 1]))}}>{children}</span>;
	}
	if (a === 'typewriter') return <span style={{opacity: t >= w.start - 0.02 ? 1 : 0}}>{children}</span>;
	if (a === 'karaoke') return <span style={{opacity: 0.38 + 0.62 * said}}>{children}</span>;
	const k = spring({frame: Math.max(0, (t - w.start + 0.03) * fps), fps, config: {damping: 12, stiffness: 230, mass: 0.6}});
	return <span style={{display: 'inline-block', opacity: t >= w.start - 0.03 ? 1 : 0, scale: String(interpolate(k, [0, 1], [0.55, 1])), translate: `0 ${((1 - k) * 18).toFixed(1)}px`}}>{children}</span>;
};

// emoji za klíčovým slovem (vyskočí s pružinou)
const Emoji: React.FC<{e: string; t: number; fps: number; size: number}> = ({e, t, fps, size}) => {
	const k = spring({frame: Math.max(0, t * fps), fps, config: {damping: 10, stiffness: 200, mass: 0.6}});
	return <span style={{display: 'inline-block', marginLeft: size * 0.12, fontSize: size * 0.95, scale: String(0.3 + 0.7 * k), rotate: `${((1 - k) * -25).toFixed(1)}deg`, WebkitTextStroke: '0px', fontFamily: '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'}}>{e}</span>;
};

const CapWord: React.FC<{w: TlWord; next?: TlWord; style: CaptionStyle; size: number; hl: string; t: number; index: number}> = ({w, next, style, size, hl, t, index}) => {
	const text = caseText(w.text, style.textCase);
	if (style.mode === 'custom') {
		// vlastní kombinace: druhý font (každé druhé / třetí / klíčové slovo) + jiný vzhled právě vysloveného slova
		const alt = style.alt;
		const isAlt = Boolean(alt && (alt.every === 'alternate' ? index % 2 === 1 : alt.every === 'third' ? index % 3 === 1 : alt.every === 'keyword' ? w.key : false));
		const a = style.active;
		const on = smooth((t - w.start + 0.03) / 0.12);
		const off = next ? smooth((t - next.start + 0.03) / 0.12) : 0;
		const k = a ? Math.max(0, on - off) : 0;
		const font = k > 0.5 && a?.font ? a.font : isAlt && alt?.font ? alt.font : style.font;
		const italic = (k > 0.5 && a?.italic) || (isAlt && alt?.italic) || style.italic;
		const base = isAlt && alt?.color ? alt.color : w.key && style.highlight ? style.highlight : style.color;
		const color = a?.color && k > 0 ? interpolateColors(k, [0, 1], [base, a.color]) : base;
		const box = a?.box && k > 0 ? interpolateColors(k, [0, 1], [a.box.slice(0, 7) + '00', a.box]) : 'transparent';
		return (
			<span
				style={{
					display: 'inline-block',
					fontFamily: font,
					fontWeight: fw(font),
					fontStyle: italic ? 'italic' : 'normal',
					fontSize: size * (isAlt ? (alt?.scale ?? 1) : 1),
					color,
					scale: String(1 + ((a?.scale ?? 1) - 1) * k),
					background: box,
					padding: a?.box ? '0 0.14em' : undefined,
					margin: a?.box ? '0 -0.06em' : undefined,
					borderRadius: size * 0.14,
					letterSpacing: '-0.01em',
					textShadow: a?.glow && k > 0 ? `0 0 ${size * 0.4}px ${a.color ?? style.highlight}cc` : undefined,
				}}
			>
				{text}
			</span>
		);
	}
	// klíčové slovo: barva + záře (jako „DID IT!“ v referenci)
	if (style.mode === 'bold')
		return <span style={{fontFamily: style.font, fontWeight: style.weight, fontSize: size, color: w.key ? hl : style.color, letterSpacing: '-0.01em', textShadow: w.key ? `0 0 ${size * 0.35}px ${hl}aa, 0 2px ${size * 0.15}px rgba(0,0,0,0.6)` : undefined}}>{text}</span>;
	if (style.mode === 'mix') {
		const serif = w.key || index % 3 === 1;
		return serif ? (
			<span style={{fontFamily: 'DM Serif Display', fontStyle: 'italic', fontWeight: 400, fontSize: size * 1.14, color: w.key ? hl : style.color}}>{text}</span>
		) : (
			<span style={{fontFamily: style.font, fontWeight: style.weight, fontSize: size * 0.86, letterSpacing: '-0.02em'}}>{text}</span>
		);
	}
	if (style.mode === 'word')
		return w.key ? (
			<span style={{fontFamily: 'Instrument Serif', fontStyle: 'italic', fontWeight: 400, fontSize: size * 1.4}}>{text}</span>
		) : (
			<span style={{fontFamily: style.font, fontWeight: style.weight, fontSize: size, letterSpacing: '-0.02em'}}>{text}</span>
		);
	const on = smooth((t - w.start + 0.02) / 0.09);
	const off = next ? smooth((t - next.start + 0.02) / 0.09) : 0;
	const k = style.highlight ? Math.max(0, on - off) : 0;
	return <span style={{fontFamily: style.font, fontWeight: style.weight, fontSize: size, color: k > 0 ? interpolateColors(k, [0, 1], [style.color, style.highlight]) : style.color}}>{text}</span>;
};

// ---------------------------------------------------------------- zvuk: efekty k beatům (vyrovnané na -14 LUFS) + hudba se ztišuje pod hlasem
export const SFX: Record<string, string[]> = {
	whoosh: ['sfx/whoosh_01.mp3', 'sfx/whoosh_05.mp3', 'sfx/whoosh_11.mp3', 'sfx/whoosh_14.mp3', 'sfx/whoosh_02.mp3', 'sfx/whoosh_06.mp3', 'sfx2/transition_1146_n.mp3'],
	pop: ['sfx2/pop_2357_n.mp3', 'sfx2/pop_2364_n.mp3', 'sfx2/pop_2354_n.mp3'],
	click: ['sfx2/click_1109_n.mp3', 'sfx2/click_1113_n.mp3', 'sfx/click_01.mp3'],
	impact: ['sfx/hit_02.mp3', 'sfx/hit_06.mp3', 'sfx/hit_08.mp3', 'sfx2/impact_2150_n.mp3'],
	notification: ['sfx2/notification_2310_n.mp3', 'sfx2/notification_2317_n.mp3'],
	camera: ['sfx/camera_03.mp3'],
	riser: ['sfx/riser_01.mp3'],
	glitch: ['sfx2/glitch_1021_n.mp3'],
	tick: ['sfx2/tick_1045_n.mp3', 'sfx2/tick_1047_n.mp3'],
	typing: ['sfx2/typing_1386_n.mp3', 'sfx2/typing_1387_n.mp3'],
	cash: ['sfx2/cash_1936_n.mp3', 'sfx2/cash_1939_n.mp3'],
	swipe: ['sfx2/swipe_1522_n.mp3', 'sfx2/swipe_1523_n.mp3', 'sfx2/swipe_1524_n.mp3'],
	success: ['sfx2/success_1928_n.mp3'],
	boom: ['sfx2/impact_2150_n.mp3'],
	ding: ['sfx2/ding_1017_n.mp3'],
	magic: ['sfx2/magic_2342_n.mp3'],
};

// Všechny zvukové efekty videa jako seznam událostí (stejný výpočet pro render i pro timeline, kde jde každý upravit).
// auto = efekt ke grafice / štítku / hooku (jde vypnout, vyměnit, posunout, ztlumit přes plan.sfxEdit), custom = autor přidal sám.
export type SfxEvent = {id: string; t: number; file: string; v: number; kind: 'auto' | 'custom'; beatId?: string; label: string};

export function sfxEvents(L: Layout, project: Project): SfxEvent[] {
	const lk = project.look;
	const base = lk.sfx === 'bold' ? 0.62 : 0.42; // efekty zřetelně slyšet, ale pod hlasem
	const out: SfxEvent[] = [];
	// efekty vybrané autorem (co se mu nelíbí, v sadě není); jinak výchozí
	const pick = (cat: string) => (lk.sfxSet && cat in lk.sfxSet ? lk.sfxSet[cat] : SFX[cat] ?? []);
	const at = (g: {times?: number[]} | undefined, k: number, fb: number) => (g?.times && g.times[k] !== undefined ? g.times[k] : fb);
	if (lk.sfx !== 'off') {
		L.beats.forEach((b, i) => {
			let n = 0;
			const push = (t: number, file: string | undefined, v: number, label: string) => file && out.push({id: `${b.id}:${n++}`, t: Math.max(0, t), file, v, kind: 'auto', beatId: b.id, label});
			// vlastní zvuk u beatu z timeline (nebo ticho)
			if (b.sfx === null) return;
			if (typeof b.sfx === 'string' && b.sfx) return push(b.start - 0.12, b.sfx, base, 'vlastní');
			const add = (cat: string, t: number, v: number) => {
				const a = pick(cat);
				if (a?.length) push(t, a[i % a.length], v, cat);
			};
			if (b.kind === 'broll' || b.kind === 'gfx') add('whoosh', b.start - 0.15, base);
			if (b.kind === 'chip') add('pop', b.start, base * 0.9);
			if (b.kind === 'punch' && lk.sfx === 'bold') add('impact', b.start, base * 0.6);
			const g = b.kind === 'gfx' ? b.gfx : undefined;
			const d = b.end - b.start;
			if (g?.type === 'slam') g.words.forEach((_, k) => add('impact', b.start + at(g, k, (k * d) / g.words.length), base * 0.75));
			if (g?.type === 'stat') add('impact', b.start + 0.85, base * 0.55);
			if (g?.type === 'list') g.items.slice(0, 5).forEach((_, k) => add('click', b.start + at(g, k, 0.35 + k * Math.max(0.18, (d - 1) / Math.max(g.items.length, 1))) + 0.15, base * 0.8));
			if (g?.type === 'timer') add('tick', b.start + 0.2, base * 0.6);
			if (g?.type === 'prompt') add('typing', b.start + 0.25, base * 0.55);
			if ((g?.type === 'particles' || g?.type === 'stat' || g?.type === 'counter') && /[$€£]|kč|korun|peněz/i.test(('value' in g ? g.value : '') + ('text' in g ? (g.text ?? '') : '') + ('label' in g ? (g.label ?? '') : ''))) add('cash', b.start + 0.6, base * 0.6);
			if (g?.type === 'cards' || g?.type === 'side') g.items.slice(0, 4).forEach((_, k) => add('swipe', b.start + at(g, k, 0.15 + k * 0.25), base * 0.55));
			if (g?.type === 'chips') g.items.slice(0, 6).forEach((_, k) => add('pop', b.start + at(g, k, 0.3 + k * 0.22), base * 0.5));
			if (g?.type === 'custom' || g?.type === 'timeline' || g?.type === 'kinetic') (g.type === 'kinetic' ? g.words : g.items).slice(0, 6).forEach((_, k) => k > 0 && add('pop', b.start + at(g, k, 0.3 + k * 0.28), base * 0.45));
			if (g?.type === 'chat') g.messages.forEach((_, k) => add('notification', b.start + at(g, k, 0.15 + k * Math.max(0.35, (d - 0.6) / g.messages.length)), base * 0.6));
		});
		L.cards.forEach((c, i) => out.push({id: `card${i}`, t: Math.max(0, c.start - 0.12), file: pick('whoosh')[i % pick('whoosh').length], v: base, kind: 'auto', label: 'whoosh'}));
	}
	// hook: výrazný úder na startu + whoosh, když grafika hooku odjede
	if (lk.hook?.sfx) {
		const imp = pick('impact');
		const wh = pick('whoosh');
		if (imp.length) out.push({id: 'hook:0', t: 0, file: imp[1 % imp.length], v: 0.7, kind: 'auto', beatId: 'hook', label: 'hook úder'});
		if (wh.length && lk.hook.visual !== 'none' && lk.hook.visual !== 'broll') out.push({id: 'hook:1', t: HOOK_END - 0.2, file: wh[2 % wh.length], v: base, kind: 'auto', beatId: 'hook', label: 'hook whoosh'});
	}
	// úpravy jednotlivých efektů z timeline (vypnout / vyměnit / posunout / hlasitost)
	const edit = project.plan?.sfxEdit ?? {};
	const res = out
		.filter((e) => !edit[e.id]?.off)
		.map((e) => (edit[e.id] ? {...e, file: edit[e.id].file ?? e.file, v: edit[e.id].vol ?? e.v, t: Math.max(0, e.t + (edit[e.id].dt ?? 0))} : e));
	// vlastní zvuky autora
	const byWi = new Map(L.words.map((w) => [w.wi, w]));
	for (const c of project.plan?.sounds ?? []) {
		const w = byWi.get(c.wi);
		if (w) res.push({id: c.id, t: Math.max(0, w.start + (c.shift ?? 0)), file: c.file, v: c.vol ?? 0.6, kind: 'custom', label: c.name ?? 'vlastní zvuk'});
	}
	return res.sort((a, b) => a.t - b.t);
}

const Sounds: React.FC<{L: Layout; project: Project; mediaBase: string}> = ({L, project, mediaBase}) => {
	const {fps} = useVideoConfig();
	const lk = project.look;
	const events = React.useMemo(() => sfxEvents(L, project).map((e) => ({f: Math.round(e.t * fps), file: e.file, v: e.v})), [L, project, fps]);
	const speaking = React.useMemo(() => {
		const arr = new Float32Array(L.durationInFrames);
		for (const w of L.words) for (let f = Math.max(0, Math.floor((w.start - 0.12) * fps)); f < Math.min(arr.length, Math.ceil((w.end + 0.2) * fps)); f++) arr[f] = 1;
		const out = new Float32Array(arr.length);
		const r = Math.round(fps * 0.2);
		for (let i = 0; i < arr.length; i++) {
			let s = 0;
			let n = 0;
			for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) {
				s += arr[j];
				n++;
			}
			out[i] = s / n;
		}
		return out;
	}, [L, fps]);
	const music = lk.music;
	const musicSrc = music ? (music.file.startsWith('music/') ? staticFile(music.file) : mediaBase + music.file) : null;
	return (
		<>
			{events.map((e, i) => (
				<Sequence key={i} from={e.f} durationInFrames={fps * 3}>
					<Audio src={/^sfx2?\//.test(e.file) ? staticFile(e.file) : mediaBase + e.file} volume={e.v} />
				</Sequence>
			))}
			{music && musicSrc ? (
				<Audio
					src={musicSrc}
					startFrom={Math.round((music.start ?? 0) * fps)}
					loop
					volume={(f) => {
						const v = music.volume * (1 - 0.5 * (speaking[f] ?? 0)); // pod hlasem o ~6 dB tišší
						const fadeOut = interpolate(f, [L.durationInFrames - fps * 1.2, L.durationInFrames], [1, 0], clamp);
						return v * fadeOut;
					}}
				/>
			) : null}
		</>
	);
};
