import React from 'react';
import type {CaptionStyle} from '../model';
import {CATALOG} from '../setup';
import {FontSelect} from './gfxedit';

// Editor titulků do detailu: písmo, velikost, řádky, barvy, obrys, podklad, druhý font a vzhled právě vysloveného slova.
// Jakmile autor něco změní, titulky přejdou na „vlastní“ režim (umí všechno najednou) – vzhled stylu se převede.
type Patch = Partial<CaptionStyle>;

const toCustom = (s: CaptionStyle): Patch => {
	if (s.mode === 'custom') return {};
	if (s.mode === 'goat') return {mode: 'custom', active: s.highlight ? {color: s.highlight} : undefined};
	if (s.mode === 'bold') return {mode: 'custom', alt: {every: 'keyword', color: s.highlight}};
	if (s.mode === 'word') return {mode: 'custom', alt: {every: 'keyword', font: 'Instrument Serif', italic: true, scale: 1.4}};
	return {mode: 'custom', alt: {every: 'third', font: 'DM Serif Display', italic: true, scale: 1.14}};
};

const Colors: React.FC<{value?: string; onChange: (c: string | undefined) => void; allowNone?: string; accent?: string}> = ({value, onChange, allowNone, accent}) => (
	<div className="ce-colors">
		{allowNone ? (
			<button className={'ghost small' + (!value ? ' active' : '')} style={{width: 'auto', borderRadius: 8, padding: '2px 8px'}} onClick={() => onChange(undefined)}>
				{allowNone}
			</button>
		) : null}
		{[...new Set([accent, '#FFFFFF', '#FFD84D', '#111111', ...CATALOG.colors.slice(0, 16).map((c) => c.hex)].filter(Boolean) as string[])].slice(0, 12).map((c) => (
			<button key={c} className={value?.toLowerCase() === c.toLowerCase() ? 'on' : ''} style={{background: c}} onClick={() => onChange(c)} />
		))}
		<input type="color" value={value?.slice(0, 7) ?? '#ffffff'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
	</div>
);

const Seg = <T extends string>({value, options, onChange}: {value: T; options: [T, string][]; onChange: (v: T) => void}) => (
	<div className="seg">
		{options.map(([v, l]) => (
			<button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
				{l}
			</button>
		))}
	</div>
);

export const CaptionEditor: React.FC<{style: CaptionStyle; set: (p: Patch) => void; accent: string}> = ({style: s, set, accent}) => {
	// každá změna „vlastní“ volby převede titulky do vlastního režimu (se zachováním vzhledu)
	const custom = (p: Patch) => set({...toCustom(s), ...p});
	const alt = s.mode === 'custom' ? s.alt : toCustom(s).alt;
	const act = s.mode === 'custom' ? s.active : toCustom(s).active;
	return (
		<div className="cap-editor">
			<div className="ce-group">
				<b>Písmo a řádky</b>
				<div className="ce-row">
					<span>Font</span>
					<FontSelect value={s.font} onChange={(f) => f && set({font: f})} sample="Titulky" />
				</div>
				<div className="ce-row">
					<span>Velikost {Math.round(s.size)}</span>
					<input type="range" min={28} max={130} value={s.size} onChange={(e) => set({size: Number(e.target.value)})} />
				</div>
				<div className="ce-row">
					<span>Písmena</span>
					<Seg value={s.textCase} options={[['lower', 'malá'], ['normal', 'Normální'], ['upper', 'VELKÁ']]} onChange={(v) => set({textCase: v})} />
				</div>
				<div className="ce-row">
					<span>Slov na řádek {s.maxWords}</span>
					<input type="range" min={1} max={7} value={s.maxWords} onChange={(e) => set({maxWords: Number(e.target.value)})} />
				</div>
				<div className="ce-row">
					<span>Výška {Math.round(s.y * 100)} %</span>
					<input type="range" min={0.15} max={0.9} step={0.01} value={s.y} onChange={(e) => set({y: Number(e.target.value)})} />
				</div>
				<div className="ce-row">
					<span>Animace</span>
					<Seg value={s.animation} options={[['pop', 'Pružina'], ['fade-up', 'Vyjede'], ['blur', 'Rozostření'], ['none', 'Žádná']]} onChange={(v) => set({animation: v})} />
				</div>
			</div>
			<div className="ce-group">
				<b>Barvy a čitelnost</b>
				<div className="ce-row">
					<span>Barva textu</span>
					<Colors value={s.color} onChange={(c) => c && set({color: c})} accent={accent} />
				</div>
				<div className="ce-row">
					<span>Obrys {s.stroke ?? 0}</span>
					<input type="range" min={0} max={16} value={s.stroke ?? 0} onChange={(e) => custom({stroke: Number(e.target.value) || undefined})} />
				</div>
				{s.stroke ? (
					<div className="ce-row">
						<span>Barva obrysu</span>
						<Colors value={s.strokeColor ?? '#000000'} onChange={(c) => custom({strokeColor: c})} accent={accent} />
					</div>
				) : null}
				<div className="ce-row">
					<span>Podklad</span>
					<Colors value={s.box} onChange={(c) => custom({box: c ? (c.length === 7 ? c + 'c0' : c) : undefined})} allowNone="žádný" accent={accent} />
				</div>
				<div className="ce-row">
					<span>Stín</span>
					<Seg value={s.shadow ? 'on' : 'off'} options={[['on', 'Ano'], ['off', 'Ne']]} onChange={(v) => set({shadow: v === 'on'})} />
				</div>
			</div>
			<div className="ce-group">
				<b>Druhý font (kombinace)</b>
				<div className="ce-row">
					<span>Které slovo</span>
					<Seg
						value={alt?.every ?? 'none'}
						options={[['none', 'Žádné'], ['alternate', 'Každé 2.'], ['third', 'Každé 3.'], ['keyword', 'Klíčová']]}
						onChange={(v) => custom({alt: v === 'none' ? undefined : {font: 'Instrument Serif', italic: true, scale: 1.15, ...(alt ?? {}), every: v}})}
					/>
				</div>
				{alt && alt.every !== 'none' ? (
					<>
						<div className="ce-row">
							<span>Font</span>
							<FontSelect value={alt.font} onChange={(f) => custom({alt: {...alt, font: f}})} allowDefault="stejný" sample="kurzíva" />
						</div>
						<div className="ce-row">
							<span>Kurzíva</span>
							<Seg value={alt.italic ? 'on' : 'off'} options={[['on', 'Ano'], ['off', 'Ne']]} onChange={(v) => custom({alt: {...alt, italic: v === 'on'}})} />
						</div>
						<div className="ce-row">
							<span>Barva</span>
							<Colors value={alt.color} onChange={(c) => custom({alt: {...alt, color: c}})} allowNone="stejná" accent={accent} />
						</div>
						<div className="ce-row">
							<span>Velikost {Math.round((alt.scale ?? 1) * 100)} %</span>
							<input type="range" min={0.7} max={1.6} step={0.02} value={alt.scale ?? 1} onChange={(e) => custom({alt: {...alt, scale: Number(e.target.value)}})} />
						</div>
					</>
				) : null}
			</div>
			<div className="ce-group">
				<b>Aktivní slovo (právě vyslovené)</b>
				<div className="ce-row">
					<span>Zvýraznit</span>
					<Seg value={act ? 'on' : 'off'} options={[['on', 'Ano'], ['off', 'Ne']]} onChange={(v) => custom({active: v === 'on' ? {color: accent, ...(act ?? {})} : undefined})} />
				</div>
				{act ? (
					<>
						<div className="ce-row">
							<span>Barva</span>
							<Colors value={act.color} onChange={(c) => custom({active: {...act, color: c}})} allowNone="stejná" accent={accent} />
						</div>
						<div className="ce-row">
							<span>Font</span>
							<FontSelect value={act.font} onChange={(f) => custom({active: {...act, font: f}})} allowDefault="stejný" sample="aktivní" />
						</div>
						<div className="ce-row">
							<span>Kurzíva</span>
							<Seg value={act.italic ? 'on' : 'off'} options={[['on', 'Ano'], ['off', 'Ne']]} onChange={(v) => custom({active: {...act, italic: v === 'on'}})} />
						</div>
						<div className="ce-row">
							<span>Zvětšit {Math.round((act.scale ?? 1) * 100)} %</span>
							<input type="range" min={1} max={1.5} step={0.02} value={act.scale ?? 1} onChange={(e) => custom({active: {...act, scale: Number(e.target.value)}})} />
						</div>
						<div className="ce-row">
							<span>Box pod slovem</span>
							<Colors value={act.box} onChange={(c) => custom({active: {...act, box: c}})} allowNone="bez boxu" accent={accent} />
						</div>
						<div className="ce-row">
							<span>Záře</span>
							<Seg value={act.glow ? 'on' : 'off'} options={[['on', 'Ano'], ['off', 'Ne']]} onChange={(v) => custom({active: {...act, glow: v === 'on'}})} />
						</div>
					</>
				) : null}
			</div>
		</div>
	);
};
