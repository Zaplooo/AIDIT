import React from 'react';
import type {Beat, Gfx} from '../model';
import {FONTS} from '../remotion/fonts';
import {CATALOG} from '../setup';
import {SFX_CATS, loadSfx, SfxItem} from '../sfx';
import {Icon} from './Mocks';
import {PlayButton} from './previews';

// Sdílené ovládání grafiky: popisky šablon, editor polí, výběr fontu s náhledem, pozice, zvuk.
export const GFX_LABEL: Record<string, string> = Object.fromEntries(CATALOG.gfx.map((g) => [g.type, g.label]));
export const OVERLAY = new Set(CATALOG.gfx.filter((g) => g.overlay).map((g) => g.type as string));
export const gfxDefault = (type: string): Gfx => structuredClone(CATALOG.gfx.find((g) => g.type === type)!.sample);
export const FAMILIES = [...new Set(FONTS.map((f) => f.family))];

const FIELD_LABEL: Record<string, string> = {
	text: 'Text', highlight: 'Zvýraznit (slova)', sub: 'Malý nadpis / popis', value: 'Hodnota', label: 'Popisek', title: 'Nadpis', items: 'Položky',
	messages: 'Zprávy (> na začátku = moje)', left: 'Vlevo', right: 'Vpravo', leftItems: 'Body vlevo', rightItems: 'Body vpravo', words: 'Slova',
	n: 'Číslo', icons: 'Ikony', level: 'Úroveň 0–1', you: 'Ty', them: 'Ostatní', lines: 'Řádky', leftSub: 'Vlevo – druhý řádek', rightSub: 'Vpravo – druhý řádek',
	leftIcon: 'Ikona vlevo', rightIcon: 'Ikona vpravo', icon: 'Ikona', layout: 'Rozložení (stack / row / grid / hero)', note: 'Poznámka dole', times: 'Časy položek (s)',
};
type AnyGfx = Record<string, unknown> & {type: Gfx['type']};

// obecný editor polí: text = pole, číslo = číslo, seznam = řádky, karty = „ikona | nadpis | popis“, graf = „popisek | hodnota“
export const GfxFields: React.FC<{g: Gfx; set: (g: Gfx) => void}> = ({g, set}) => {
	const o = g as unknown as AnyGfx;
	const put = (k: string, v: unknown) => set({...o, [k]: v} as unknown as Gfx);
	return (
		<div className="gfx-fields">
			{Object.entries(o)
				.filter(([k]) => k !== 'type')
				.map(([k, v]) => {
					const label = FIELD_LABEL[k] ?? k;
					if (typeof v === 'number')
						return (
							<label key={k}>
								<span>{label}</span>
								{k === 'level' ? <input type="range" min={0} max={1} step={0.05} value={v} onChange={(e) => put(k, Number(e.target.value))} /> : <input type="number" value={v} onChange={(e) => put(k, Number(e.target.value))} />}
							</label>
						);
					if (Array.isArray(v)) {
						const isMsg = k === 'messages';
						const isBar = g.type === 'bars';
						const isCustom = g.type === 'custom' && k === 'items';
						const isCard = !isBar && !isCustom && v.length > 0 && typeof v[0] === 'object' && !isMsg;
						const text = v
							.map((x) =>
								isMsg
									? ((x as {from: string}).from === 'me' ? '> ' : '') + (x as {text: string}).text
									: isCustom
										? [(x as {kind: string}).kind, (x as {text?: string}).text ?? '', (x as {sub?: string}).sub ?? '', (x as {icon?: string}).icon ?? ''].join(' | ')
										: isBar
										? `${(x as {label: string}).label} | ${(x as {value: number}).value}`
										: isCard
											? [(x as {icon?: string}).icon ?? '', (x as {title: string}).title, (x as {sub?: string}).sub ?? ''].join(' | ')
											: String(x),
							)
							.join('\n');
						return (
							<label key={k}>
								<span>
									{label}
									{isCustom ? ' (typ text/number/icon/check/cross/badge | text | popis | ikona)' : isCard ? ' (ikona | nadpis | popis)' : isBar ? ' (popisek | číslo)' : ' (každý řádek zvlášť)'}
								</span>
								<textarea
									rows={Math.max(2, v.length)}
									value={text}
									onChange={(e) => {
										const ls = e.target.value.split('\n');
										if (isMsg) put(k, ls.map((t) => (t.startsWith('>') ? {from: 'me', text: t.replace(/^>\s?/, '')} : {from: 'them', text: t})));
										else if (isCustom)
											put(k, ls.map((t) => {
												const [kind, text, sb, icon] = t.split('|').map((x) => x.trim());
												return {kind: ['text', 'number', 'icon', 'check', 'cross', 'badge'].includes(kind) ? kind : 'text', text: text || undefined, sub: sb || undefined, icon: icon || undefined};
											}));
										else if (isBar)
											put(k, ls.map((t) => {
												const [l, n] = t.split('|').map((x) => x.trim());
												return {label: l ?? '', value: Number(n) || 0};
											}));
										else if (isCard)
											put(k, ls.map((t) => {
												const [icon, title, sb] = t.split('|').map((x) => x.trim());
												return {icon: icon || undefined, title: title ?? '', sub: sb || undefined};
											}));
										else put(k, ls);
									}}
								/>
							</label>
						);
					}
					return (
						<label key={k}>
							<span>{label}</span>
							<input value={(v as string) ?? ''} onChange={(e) => put(k, e.target.value || undefined)} />
						</label>
					);
				})}
		</div>
	);
};

// výběr fontu: každý font ukázaný svým písmem
export const FontSelect: React.FC<{value?: string; onChange: (f: string | undefined) => void; allowDefault?: string; sample?: string}> = ({value, onChange, allowDefault, sample = 'Spánek'}) => {
	const [open, setOpen] = React.useState(false);
	const ref = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
		addEventListener('mousedown', close);
		return () => removeEventListener('mousedown', close);
	}, [open]);
	const italic = (f?: string) => (f && /Instrument|Italic/.test(f) ? 'italic' : undefined);
	return (
		<div className="font-select" ref={ref}>
			<button className="fs-btn" onClick={() => setOpen(!open)}>
				<span style={{fontFamily: value ? `'${value}'` : undefined, fontStyle: italic(value)}}>{value ?? allowDefault ?? 'Vyber font'}</span>
				<Icon name="down" />
			</button>
			{open ? (
				<div className="fs-pop">
					{allowDefault ? (
						<button className={!value ? 'on' : ''} onClick={() => (onChange(undefined), setOpen(false))}>
							<span className="muted">{allowDefault}</span>
						</button>
					) : null}
					{CATALOG.fontCats.map((c) => (
						<React.Fragment key={c.id}>
							<div className="fs-cat">{c.label}</div>
							{CATALOG.fonts
								.filter((f) => f.cat === c.id && FAMILIES.includes(f.family))
								.map((f) => (
									<button key={f.family} className={value === f.family ? 'on' : ''} onClick={() => (onChange(f.family), setOpen(false))}>
										<span style={{fontFamily: `'${f.family}'`, fontStyle: italic(f.family), fontSize: 24, lineHeight: 1.15}}>{sample}</span>
										<small>
											{f.label} · {f.desc}
										</small>
									</button>
								))}
						</React.Fragment>
					))}
				</div>
			) : null}
		</div>
	);
};

// pozice grafiky: 9 míst + jemné doladění + velikost
const SPOTS: [number, number][] = [
	[-0.25, -0.28], [0, -0.28], [0.25, -0.28],
	[-0.25, 0], [0, 0], [0.25, 0],
	[-0.25, 0.28], [0, 0.28], [0.25, 0.28],
];
export const PosEditor: React.FC<{pos?: Beat['pos']; set: (p: Beat['pos']) => void}> = ({pos, set}) => {
	const p = pos ?? {x: 0, y: 0, scale: 1};
	return (
		<div className="pos-editor">
			<div className="pos-grid">
				{SPOTS.map(([x, y], i) => (
					<button key={i} className={Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01 ? 'on' : ''} onClick={() => set({...p, x, y})} title={['vlevo nahoře', 'nahoře', 'vpravo nahoře', 'vlevo', 'uprostřed', 'vpravo', 'vlevo dole', 'dole', 'vpravo dole'][i]}>
						<span />
					</button>
				))}
			</div>
			<div className="pos-sliders">
				<label>
					<span>Do boku</span>
					<input type="range" min={-0.45} max={0.45} step={0.01} value={p.x} onChange={(e) => set({...p, x: Number(e.target.value)})} />
				</label>
				<label>
					<span>Výš / níž</span>
					<input type="range" min={-0.45} max={0.45} step={0.01} value={p.y} onChange={(e) => set({...p, y: Number(e.target.value)})} />
				</label>
				<label>
					<span>Velikost {Math.round(p.scale * 100)} %</span>
					<input type="range" min={0.4} max={1.6} step={0.02} value={p.scale} onChange={(e) => set({...p, scale: Number(e.target.value)})} />
				</label>
				<button className="ghost small" onClick={() => set(undefined)}>
					Vrátit na střed
				</button>
			</div>
		</div>
	);
};

// zvuk u jedné grafiky: výchozí / bez zvuku / konkrétní efekt z knihovny
export const BeatSfx: React.FC<{value: Beat['sfx']; set: (v: Beat['sfx']) => void}> = ({value, set}) => {
	const [lib, setLib] = React.useState<SfxItem[]>([]);
	const [cat, setCat] = React.useState('whoosh');
	React.useEffect(() => {
		loadSfx().then((l) => {
			setLib(l);
			const cur = l.find((x) => x.file === value);
			if (cur) setCat(cur.cat);
		});
	}, [value]);
	return (
		<div className="beat-sfx">
			<div className="seg">
				<button className={value === undefined ? 'on' : ''} onClick={() => set(undefined)}>
					Automaticky
				</button>
				<button className={value === null ? 'on' : ''} onClick={() => set(null)}>
					Bez zvuku
				</button>
				<button className={typeof value === 'string' ? 'on' : ''} onClick={() => set(lib.find((x) => x.cat === cat)?.file ?? null)}>
					Vybrat efekt
				</button>
			</div>
			{typeof value === 'string' ? (
				<>
					<select value={cat} onChange={(e) => setCat(e.target.value)}>
						{SFX_CATS.map((c) => (
							<option key={c.cat} value={c.cat}>
								{c.label} – {c.use}
							</option>
						))}
					</select>
					<div className="sfx-list">
						{lib
							.filter((x) => x.cat === cat)
							.map((x) => (
								<div key={x.id} className={'sfx-row' + (value === x.file ? ' on' : '')} onClick={() => set(x.file)}>
									<PlayButton src={'/' + x.file} seconds={3} />
									<span>{x.name}</span>
									{value === x.file ? <Icon name="check" /> : null}
								</div>
							))}
					</div>
				</>
			) : null}
		</div>
	);
};
