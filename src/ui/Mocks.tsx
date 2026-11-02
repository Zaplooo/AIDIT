import React from 'react';

// Grafické náhledy typů střihu – malé animované „telefony“, ať je hned vidět, jak bude který styl vypadat.

const Person: React.FC<{color?: string; scale?: number; y?: number}> = ({color = '#3a3f4b', scale = 1, y = 0}) => (
	<svg viewBox="0 0 100 120" style={{position: 'absolute', left: '50%', bottom: 0, width: `${78 * scale}%`, translate: `-50% ${y}%`}}>
		<circle cx="50" cy="38" r="20" fill={color} />
		<path d="M10 120 C12 80, 30 66, 50 66 C70 66, 88 80, 90 120 Z" fill={color} />
	</svg>
);

// náhled stylu: mluvčí + titulky v daném režimu + cyklicky naskočí grafika (jako ve videu)
export const StyleMock: React.FC<{id: string; small?: boolean; style?: {look?: Record<string, unknown>; captions?: Record<string, unknown>; theme?: {bg: string; font: string}; platform?: string}}> = ({id, small, style}) => {
	const cap = (style?.captions ?? {}) as {mode?: string; highlight?: string; font?: string};
	const look = (style?.look ?? {}) as {layout?: string; grade?: string; accent?: string};
	const mode = cap.mode ?? (id === 'creator' ? 'bold' : id === 'cinematic' ? 'word' : id === 'mixfont' ? 'mix' : id === 'goat-zaklad' ? 'goat' : 'word');
	const accent = look.accent ?? cap.highlight ?? '#ff3b3b';
	const bg = style?.theme?.bg ?? (id === 'mixfont' ? 'cream' : 'dark');
	const framed = look.layout === 'framed' || id === 'cinematic';
	const yt = style?.platform === 'youtube';
	const grade = look.grade && look.grade !== 'none';
	const cls = 'mock' + (small ? ' small' : '') + (yt ? ' yt' : '');
	const text =
		mode === 'bold' ? (
			<div className="mock-cap creator" style={{fontFamily: cap.font ? `'${cap.font}'` : undefined}}>
				TOHLE JE <span className="w2" style={{color: accent}}>KLÍČ</span>
			</div>
		) : mode === 'mix' ? (
			<div className="mock-cap mix">
				to je <i style={{color: accent}}>klíč</i> k úspěchu
			</div>
		) : mode === 'goat' ? (
			<div className="mock-cap goat">
				tohle je <span style={{color: accent}}>první</span>
			</div>
		) : (
			<div className="mock-cap cine">
				to je <i className="serif">jednoduché</i>
			</div>
		);
	return (
		<div className={cls} style={{background: framed ? '#000' : grade ? 'radial-gradient(ellipse at 50% 30%, #2a2622, #08080a 75%)' : 'linear-gradient(#d9d2c6, #bfb6a7)'}}>
			{framed ? (
				<div className="mock-frame big">
					<Person color="#5b6470" scale={1.15} />
				</div>
			) : (
				<div className={look.layout === 'full' && mode === 'bold' ? 'punch' : ''} style={{position: 'absolute', inset: 0}}>
					<Person color={grade ? '#4a4038' : '#2a2a2a'} />
				</div>
			)}
			{text}
			<div className={'mock-gfx ' + (bg === 'cream' ? 'cream' : 'dark')}>
				{yt ? <div className="mock-pip" /> : null}
				<small style={{color: accent}}>TIP 01</small>
				<b>60–90</b>
				<span>min bez obrazovky</span>
			</div>
			<div className="mock-broll" />
		</div>
	);
};

export const TempoMock: React.FC<{tempo: 'calm' | 'normal' | 'fast'; animated?: boolean}> = ({tempo, animated}) => {
	const gaps = tempo === 'calm' ? [0, 3, 7, 12] : tempo === 'normal' ? [0, 5, 11] : [];
	const bars = Array.from({length: 22}, (_, i) => (gaps.some((g) => i === g + 3 || i === g + 4) && tempo !== 'fast' ? 0 : 0.3 + 0.7 * Math.abs(Math.sin(i * 1.7))));
	return (
		<div className={'tempo-mock' + (animated ? ' anim ' + tempo : '')}>
			{bars.map((h, i) => (
				<span key={i} style={{height: `${h * 100}%`, opacity: h ? 1 : 0.15, animationDelay: `${i * 0.06}s`}} />
			))}
		</div>
	);
};

export const JumpMock: React.FC<{jump: 'hard' | 'punch'}> = ({jump}) => (
	<div className="jump-mock">
		<div className="fr">
			<Person color="#59606c" />
		</div>
		<span>→</span>
		<div className="fr">
			<Person color="#59606c" scale={jump === 'punch' ? 1.35 : 1} y={jump === 'punch' ? 14 : 0} />
		</div>
	</div>
);

export const Icon: React.FC<{name: string}> = ({name}) => {
	const p: Record<string, string> = {
		cut: 'M6 6l12 12M6 18L18 6M4 4h4v4H4zM16 16h4v4h-4z',
		wave: 'M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2',
		text: 'M5 6h14M12 6v13M9 19h6',
		card: 'M4 6h16v12H4zM8 10h8M8 14h5',
		sfx: 'M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
		music: 'M9 18V6l10-2v12M9 18a2 2 0 11-4 0 2 2 0 014 0zM19 16a2 2 0 11-4 0 2 2 0 014 0z',
		frame: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4',
		export: 'M12 4v11M7 10l5 5 5-5M5 20h14',
		ai: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
		style: 'M4 20l7-7M14 4l6 6-8 8-6-6z',
		clock: 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z',
		undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
		redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
		play: 'M7 5l12 7-12 7z',
		pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
		check: 'M5 12l5 5 9-10',
		x: 'M6 6l12 12M18 6L6 18',
		plus: 'M12 5v14M5 12h14',
		back: 'M15 6l-6 6 6 6',
		history: 'M3 12a9 9 0 103-6.7M3 4v5h5M12 8v4l3 2',
		eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
		users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6',
		folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
		upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
		trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
		up: 'M6 15l6-6 6 6',
		down: 'M6 9l6 6 6-6',
		send: 'M4 12l16-8-6 16-2-7z',
		film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
		zoom: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M11 8v6M8 11h6',
		hook: 'M13 2L4 14h7l-1 8 9-12h-7z',
		color: 'M12 3a9 9 0 100 18c1 0 2-.8 2-2 0-1.5 1-2 2-2h2a3 3 0 003-3c0-6-4-11-9-11zM7.5 12a1 1 0 100-2 1 1 0 000 2zM10 8a1 1 0 100-2 1 1 0 000 2zM15 8a1 1 0 100-2 1 1 0 000 2z',
		font: 'M4 20L10 4h1l6 16M6.5 14h8M17 20h4',
		edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
		home: 'M3 11l9-7 9 7M5 10v10h14V10',
		sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
		chat: 'M4 5h16v11H8l-4 4z',
	};
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
			<path d={p[name] ?? p.ai} />
		</svg>
	);
};
