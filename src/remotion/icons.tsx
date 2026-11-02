// Ikony pro motion grafiku (24×24, tahy). AI vybírá podle klíče.
import React from 'react';

export const ICONS: Record<string, string> = {
	clock: 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z',
	moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
	sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
	bed: 'M3 18V8M3 14h18v4M21 18v-6a3 3 0 00-3-3h-7v5M7 12a2 2 0 100-4 2 2 0 000 4z',
	phone: 'M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zM11 18h2',
	screen: 'M3 5h18v11H3zM8 20h8M12 16v4',
	food: 'M7 3v8a2 2 0 002 2v8M5 3v5a2 2 0 002 2M9 3v5M17 3c-1.5 0-3 2-3 5v4h3v9',
	bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
	brain: 'M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 0V4a3 3 0 00-3 0zM15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 0',
	heart: 'M12 20s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z',
	check: 'M5 12l5 5 9-10',
	x: 'M6 6l12 12M18 6L6 18',
	star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
	user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
	users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7.5M18 14a6 6 0 014 7',
	chat: 'M4 5h16v11H9l-5 4z',
	play: 'M7 5l12 7-12 7z',
	money: 'M3 7h18v10H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 10v4M18 10v4',
	chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
	calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
	coffee: 'M4 9h12v6a5 5 0 01-5 5H9a5 5 0 01-5-5zM16 11h2a2 2 0 010 4h-2M8 3v3M12 3v3',
	fire: 'M12 22c4 0 7-3 7-7 0-5-4-6-5-11-2 3-3 4-3 7-2-1-3-3-3-4-2 2-3 5-3 8 0 4 3 7 7 7z',
	target: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
	book: 'M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6M20 4v14h-6',
	bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z',
	rocket: 'M5 15c-1 1-2 4-2 6 2 0 5-1 6-2M9 13l2 2M15 3c-4 1-7 5-8 9l5 5c4-1 8-4 9-8 1-3 0-6 0-6s-3-1-6 0zM15 9a1 1 0 100-2 1 1 0 000 2z',
	eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
	lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
	music: 'M9 18V6l10-2v12M9 18a2 2 0 11-4 0 2 2 0 014 0zM19 16a2 2 0 11-4 0 2 2 0 014 0z',
	wind: 'M3 8h11a3 3 0 10-3-3M3 12h16a3 3 0 11-3 3M3 16h7',
	stress: 'M12 21a9 9 0 110-18 9 9 0 010 18zM8 15s1.5-2 4-2 4 2 4 2M9 9l2 1M15 9l-2 1',
	water: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
	run: 'M13 4a2 2 0 100-.01M7 21l3-6 3 2v5M10 15l1-5 4 3 3-1M8 10l3-2',
	pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
	code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
	folder: 'M3 6h6l2 2h10v11H3z',
	gift: 'M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0',
};

export const Ico: React.FC<{name?: string; size: number; color?: string; stroke?: number}> = ({name, size, color = 'currentColor', stroke = 1.8}) => (
	<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
		<path d={ICONS[name ?? ''] ?? ICONS.star} />
	</svg>
);
