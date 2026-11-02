import React from 'react';
import {SFX} from '../remotion/Edit';
import {loadSfx, SFX_CATS, SfxItem} from '../sfx';
import {PlayButton} from './previews';

// Výběr zvukových efektů po kategoriích: poslech + zaškrtnutí. Odškrtnuté (co se nelíbí) se ve videu nepoužijí.
export const SfxPicker: React.FC<{value?: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void}> = ({value = {}, onChange}) => {
	const [lib, setLib] = React.useState<SfxItem[]>([]);
	const [cat, setCat] = React.useState('whoosh');
	React.useEffect(() => {
		loadSfx().then(setLib);
	}, []);
	const chosen = (c: string) => value[c] ?? SFX[c] ?? [];
	const toggle = (file: string) => {
		const cur = chosen(cat);
		const next = cur.includes(file) ? cur.filter((f) => f !== file) : [...cur, file];
		onChange({...value, [cat]: next});
	};
	const items = lib.filter((x) => x.cat === cat);
	const info = SFX_CATS.find((c) => c.cat === cat);
	return (
		<div className="sfx-picker">
			<div className="sfx-cats">
				{SFX_CATS.map((c) => (
					<button key={c.cat} className={'chip' + (cat === c.cat ? ' on' : '')} onClick={() => setCat(c.cat)}>
						{c.label}
						<small>{chosen(c.cat).length}</small>
					</button>
				))}
			</div>
			<p className="muted small" style={{margin: '0 0 6px'}}>
				{info?.label}: {info?.use}. Zaškrtnuté se ve videu střídají, odškrtnuté se nepoužijí.
			</p>
			<div className="sfx-list">
				{items.map((x) => {
					const on = chosen(cat).includes(x.file);
					return (
						<label key={x.id} className={'sfx-row' + (on ? '' : ' off')}>
							<input type="checkbox" checked={on} onChange={() => toggle(x.file)} />
							<PlayButton src={'/' + x.file} seconds={3} />
							<span>{x.name}</span>
						</label>
					);
				})}
			</div>
			<div className="row" style={{gap: 6, marginTop: 6}}>
				<button className="ghost small" onClick={() => onChange({...value, [cat]: items.map((x) => x.file)})}>
					Zaškrtnout vše
				</button>
				<button className="ghost small" onClick={() => onChange({...value, [cat]: []})}>
					Odškrtnout vše
				</button>
				<button
					className="ghost small"
					onClick={() => {
						const n = {...value};
						delete n[cat];
						onChange(n);
					}}
				>
					Výchozí
				</button>
			</div>
		</div>
	);
};
