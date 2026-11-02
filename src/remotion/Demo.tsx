import React from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CaptionStyle, groupWords, LaidBeat, TlWord} from '../model';
import type {HookVisual, ZoomStyle} from '../setup';
import {loadFonts} from './fonts';
import {Bg, Gfx, GfxView, OVERLAY_TYPES, OverlayView, Theme} from './gfx';
import {Broll, Captions, GfxLayer, HOOK_END, HookTitle, Speaker, zoomAt} from './Edit';
import demoWords from '../../public/demo/words.json';

loadFonts();

// Živé ukázky v průvodci a v knihovně: šablona grafiky, zoom, hook a titulky na autorově vlastním záběru.
// Reagují na zvolenou barvu, pozadí a font, takže autor vidí přesně to, co dostane.
export type DemoProps = {
	mode: 'gfx' | 'zoom' | 'hook' | 'caption';
	theme: Theme;
	g?: Gfx;
	zoom?: ZoomStyle;
	hook?: {visual: HookVisual; text: string};
	caption?: CaptionStyle;
	W: number;
	H: number;
};

export const DEMO_FPS = 30;
export const DEMO_FRAMES = {gfx: 105, zoom: 135, hook: 120, caption: 135};

const WORDS: TlWord[] = (demoWords as {text: string; start: number; end: number}[]).map((w, i) => ({wi: i, text: w.text, start: w.start, end: w.end, clip: 'c', key: i === 6}));
const SPEAKER = staticFile('demo/speaker.mp4');

export const Demo: React.FC<DemoProps> = ({mode, theme, g, zoom = 'none', hook, caption, W, H}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	if (mode === 'gfx' && g) {
		if (OVERLAY_TYPES.has(g.type))
			return (
				<AbsoluteFill style={{background: '#000'}}>
					<Speaker src={SPEAKER} mode="full" zoom={1} t={t} beat={null} W={W} H={H} accent={theme.accent} />
					<OverlayView g={g} t={t - 0.15} dur={3.3} fps={fps} W={W} H={H} theme={theme} />
				</AbsoluteFill>
			);
		return (
			<AbsoluteFill>
				<Bg theme={theme} t={t} />
				<GfxView g={g} t={t - 0.1} dur={3.4} fps={fps} W={W} H={H} theme={theme} />
			</AbsoluteFill>
		);
	}
	if (mode === 'zoom') {
		// ukázka: 3 záběry (střih v 1,5 s a 3 s), důraz 0,6–2,4 s
		const beat: LaidBeat = {id: 'z', wi: 0, dur: 1.8, kind: 'punch', start: 0.6, end: 2.4};
		const cut = t < 1.5 ? {start: 0, dur: 1.5} : t < 3 ? {start: 1.5, dur: 1.5} : {start: 3, dur: 1.5};
		const jump = zoom === 'jump' && t >= 1.5 && t < 3 ? 1.12 : 1;
		const z = Math.max(zoomAt(zoom, t, t >= beat.start && t < beat.end ? beat : null, cut, 1), jump);
		return (
			<AbsoluteFill style={{background: '#000'}}>
				<Speaker src={SPEAKER} mode="full" zoom={z} t={t} beat={null} W={W} H={H} accent={theme.accent} />
				<div style={{position: 'absolute', left: 0, right: 0, bottom: H * 0.06, textAlign: 'center', fontFamily: 'IBM Plex Mono', fontSize: H * 0.032, color: '#fff', textShadow: '0 2px 8px #000'}}>{Math.round(z * 100)} %</div>
			</AbsoluteFill>
		);
	}
	if (mode === 'hook' && hook) {
		const text = hook.text || 'Tohle ti nikdo neřekne';
		const words = text.split(/\s+/);
		const highlight = [...words].sort((a, b) => b.length - a.length)[0];
		const hb: LaidBeat | null =
			hook.visual === 'split' || hook.visual === 'full'
				? {id: 'h', wi: 0, dur: HOOK_END, kind: 'gfx', layout: hook.visual === 'split' ? 'split' : 'full', gfx: {type: 'reveal', text, highlight}, start: 0, end: hook.visual === 'full' ? 1.6 : HOOK_END}
				: null;
		const active = hb && t < hb.end ? hb : null;
		const z = hook.visual === 'zoom' && t < HOOK_END ? Math.min(1.14, 1 + 0.14 * Math.min(1, t / 0.45)) : 1;
		return (
			<AbsoluteFill style={{background: '#000'}}>
				<Speaker src={SPEAKER} mode={active?.layout === 'split' ? 'split' : 'full'} zoom={z} t={t} beat={active} W={W} H={H} accent={theme.accent} />
				{hook.visual === 'broll' ? (
					<Sequence durationInFrames={Math.round(1.5 * fps)}>
						<Broll src={staticFile('demo/broll.mp4')} dur={1.5} framed={false} W={W} H={H} />
					</Sequence>
				) : null}
				{active ? <GfxLayer beat={active} t={t} fps={fps} W={W} H={H} theme={theme} /> : null}
				{hook.visual === 'title' ? <HookTitle text={text} t={t} W={W} H={H} theme={theme} /> : null}
				{hook.visual === 'box' && t < HOOK_END ? (
					<AbsoluteFill style={{translate: `0 ${(-0.33 * H).toFixed(1)}px`, scale: '0.9'}}>
						<OverlayView g={{type: 'pill', text}} t={t} dur={HOOK_END} fps={fps} W={W} H={H} theme={theme} />
					</AbsoluteFill>
				) : null}
			</AbsoluteFill>
		);
	}
	if (mode === 'caption' && caption) {
		const groups = groupWords(WORDS, caption.maxWords);
		return (
			<AbsoluteFill style={{background: '#000'}}>
				<Speaker src={SPEAKER} mode="full" zoom={1} t={t} beat={null} W={W} H={H} accent={theme.accent} />
				<Captions groups={groups} style={caption} accent={theme.accent} W={W} H={H} t={t} y={caption.y} />
			</AbsoluteFill>
		);
	}
	return <AbsoluteFill style={{background: '#000'}} />;
};
