import {continueRender, delayRender, staticFile} from 'remotion';

// Statické fonty (variabilní fonty dělaly v renderu třes písma)
export const FONTS: {family: string; file: string; weight: string; style?: string; label: string}[] = [
	{family: 'Poppins', file: 'Poppins-ExtraBold.ttf', weight: '800', label: 'Poppins ExtraBold'},
	{family: 'Archivo Black', file: 'ArchivoBlack-Regular.ttf', weight: '400', label: 'Archivo Black (creator)'},
	{family: 'Anton', file: 'Anton-Regular.ttf', weight: '400', label: 'Anton (úzké tučné)'},
	{family: 'Bebas Neue', file: 'BebasNeue-Regular.ttf', weight: '400', label: 'Bebas Neue'},
	{family: 'Montserrat', file: 'Montserrat-ExtraBold.ttf', weight: '800', label: 'Montserrat ExtraBold'},
	{family: 'Montserrat', file: 'Montserrat-SemiBold.ttf', weight: '600', label: 'Montserrat SemiBold'},
	{family: 'Inter', file: 'Inter-SemiBold.ttf', weight: '600', label: 'Inter SemiBold'},
	{family: 'Inter', file: 'Inter-Medium.ttf', weight: '500', label: 'Inter Medium'},
	{family: 'Inter Tight', file: 'InterTight-ExtraBold.ttf', weight: '800', label: 'Inter Tight ExtraBold'},
	{family: 'Inter Tight', file: 'InterTight-Medium.ttf', weight: '500', label: 'Inter Tight Medium'},
	{family: 'DM Serif Display', file: 'DMSerifDisplay-Regular.ttf', weight: '400', label: 'DM Serif Display'},
	{family: 'DM Serif Display', file: 'DMSerifDisplay-Italic.ttf', weight: '400', style: 'italic', label: 'DM Serif Display kurzíva'},
	{family: 'Instrument Serif', file: 'InstrumentSerif-Italic.ttf', weight: '400', style: 'italic', label: 'Instrument Serif kurzíva'},
	{family: 'IBM Plex Mono', file: 'IBMPlexMono-Medium.ttf', weight: '500', label: 'IBM Plex Mono'},
	{family: 'Kalam', file: 'Kalam-Bold.ttf', weight: '700', label: 'Kalam (ručně psané fixem)'},
	{family: 'Patrick Hand', file: 'PatrickHand-Regular.ttf', weight: '400', label: 'Patrick Hand (ručně psané)'},
	{family: 'Bangers', file: 'Bangers-Regular.ttf', weight: '400', label: 'Bangers (komiks)'},
	{family: 'Abril Fatface', file: 'AbrilFatface-Regular.ttf', weight: '400', label: 'Abril Fatface (módní patkové)'},
	{family: 'Pacifico', file: 'Pacifico-Regular.ttf', weight: '400', label: 'Pacifico (štětec)'},
	{family: 'Righteous', file: 'Righteous-Regular.ttf', weight: '400', label: 'Righteous (retro)'},
	{family: 'Lobster', file: 'Lobster-Regular.ttf', weight: '400', label: 'Lobster (písmo)'},
	{family: 'Shrikhand', file: 'Shrikhand-Regular.ttf', weight: '400', label: 'Shrikhand (tučná kurzíva)'},
	{family: 'Black Ops One', file: 'BlackOpsOne-Regular.ttf', weight: '400', label: 'Black Ops One (šablona)'},
	{family: 'Great Vibes', file: 'GreatVibes-Regular.ttf', weight: '400', label: 'Great Vibes (ručně psané)'},
];

let loaded = false;
export const loadFonts = () => {
	if (loaded || typeof document === 'undefined') return;
	loaded = true;
	const handle = delayRender('fonty');
	Promise.all(
		FONTS.map((f) => {
			const face = new FontFace(f.family, `url(${staticFile('fonts/' + f.file)})`, {weight: f.weight, style: f.style ?? 'normal'});
			return face.load().then((x) => document.fonts.add(x));
		}),
	)
		.then(() => document.fonts.ready)
		.finally(() => continueRender(handle));
};
