import React from 'react';
import {api, Client, Meta, Style} from '../api';
import {RefBox, TypeGrid} from './NewVideo';
import {label} from '../setup';
import {LibraryLeft, LibraryRight} from './Library';
import {TopNav} from './TopNav';
import {Icon} from './Mocks';

const fmtDur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

// Hlavní stránka – jen to podstatné: odkaz, typ videa, poslední videa, klienti. Knihovna a „Můj styl“ jsou v horním menu.
export const Home: React.FC = () => {
	const [clients, setClients] = React.useState<Client[]>([]);
	const [projects, setProjects] = React.useState<Meta[]>([]);
	const [creating, setCreating] = React.useState(false);
	const [learned, setLearned] = React.useState<Style[]>([]);
	React.useEffect(() => {
		api.clients().then(setClients).catch(() => {});
		api.projects().then(setProjects).catch(() => {});
		api.styles().then((l) => setLearned(l.filter((x) => x.id.startsWith('ref-')))).catch(() => {});
	}, []);
	const loose = projects.filter((p) => !p.clientId);
	return (
		<div className="home-v8">
			<TopNav />
			<main className="home-main">
				<header className="hero-v8">
					<h1>Co dnes stříháme?</h1>
					<span className="muted">Nahraj video, vyber typ nebo vlož odkaz – AIDIT ho sestříhá. Všechno pak upravíš v timeline.</span>
				</header>

				<RefBox />

				<section>
					<div className="sec-head">
						<h3>Co chceš stříhat?</h3>
						<span className="muted small">vyber typ, nahraj video a klikni na Sestříhat – nic dalšího není potřeba</span>
					</div>
					<TypeGrid />
				</section>

				{projects.length ? (
					<section>
						<div className="sec-head">
							<h3>Poslední videa</h3>
						</div>
						<div className="recent-grid">
							{projects.slice(0, 8).map((p) => (
								<VideoCard key={p.id} p={p} />
							))}
						</div>
					</section>
				) : null}

				{learned.length ? (
					<section>
						<div className="sec-head">
							<h3>Naučené styly</h3>
							<span className="muted small">z odkazů, které jsi vložil – klikni a stříhej stejně</span>
						</div>
						<div className="learned-row">
							{learned.map((st) => (
								<button key={st.id} className="learned" onClick={() => (location.hash = `#new/_?style=${st.id}`)}>
									<b>{st.name}</b>
									<span className="muted small">{(st.summary ?? st.description ?? '').slice(0, 110)}</span>
								</button>
							))}
						</div>
					</section>
				) : null}

				<section>
					<div className="sec-head">
						<h3>Klienti</h3>
						<span className="muted small">každý má svůj uložený styl</span>
						<div style={{flex: 1}} />
						<button className="small" onClick={() => setCreating(true)}>
							<Icon name="plus" /> Nový klient
						</button>
					</div>
					{clients.length ? (
						<div className="client-grid">
							{clients.map((c) => (
								<div key={c.id} className="client-card" onClick={() => (location.hash = `#c/${c.id}`)}>
									<div className="cc-top" style={{background: `linear-gradient(135deg, ${c.setup.color}, ${c.setup.color}55)`}}>
										<span className="cc-initial">{c.name.slice(0, 1).toUpperCase()}</span>
									</div>
									<b>{c.name}</b>
									<span className="muted small">
										{c.videos ?? 0} videí · {c.platform === 'youtube' ? 'YouTube' : 'Reels'} · {label.caption(c.setup.caption)}
									</span>
								</div>
							))}
						</div>
					) : (
						<div className="empty" onClick={() => setCreating(true)}>
							Zatím žádný klient. <b>Založ prvního</b> – jednou mu nastavíš styl a pak už jen nahráváš videa.
						</div>
					)}
				</section>

				{loose.length > 8 ? (
					<section>
						<div className="sec-head">
							<h3>Všechna videa bez klienta</h3>
						</div>
						<div className="proj-list">
							{loose.map((p) => (
								<ProjectRow key={p.id} p={p} />
							))}
						</div>
					</section>
				) : null}
			</main>
			{creating ? <NewClient onClose={() => setCreating(false)} /> : null}
		</div>
	);
};

export const ProjectRow: React.FC<{p: Meta}> = ({p}) => (
	<div className="proj-row" onClick={() => (location.hash = `#p/${p.id}`)}>
		<div className="pr-thumb">{p.status === 'ready' ? <video src={`/media/${p.id}/base_preview.mp4#t=1`} muted preload="metadata" /> : <Icon name="film" />}</div>
		<div className="pr-meta">
			<b>{p.name}</b>
			<span className="muted small">
				{new Date(p.createdAt).toLocaleDateString('cs-CZ')}
				{p.duration ? ` · zdroj ${fmtDur(p.duration)}` : ''}
				{p.sources && p.sources.length > 1 ? ` · ${p.sources.length} klipy` : ''}
			</span>
		</div>
		<span className={'status ' + p.status}>{p.status === 'ready' ? (p.answers?.done ? 'hotovo' : 'čeká na tebe') : p.status === 'error' ? 'chyba' : 'zpracovává se'}</span>
	</div>
);

const NewClient: React.FC<{onClose: () => void}> = ({onClose}) => {
	const [name, setName] = React.useState('');
	const [platform, setPlatform] = React.useState<'reels' | 'youtube'>('reels');
	const create = async () => {
		const c = await api.newClient({name, platform, format: platform === 'youtube' ? '16:9' : '9:16'});
		location.hash = `#c/${c.id}/styl`;
	};
	return (
		<div className="modal-bg" onClick={onClose}>
			<div className="modal" onClick={(e) => e.stopPropagation()}>
				<h2>Nový klient</h2>
				<label className="field">
					<span>Jméno klienta / značky</span>
					<input autoFocus value={name} placeholder="Např. Fitness Jana" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
				</label>
				<div className="field">
					<span>Co pro něj hlavně stříháš?</span>
					<div className="seg">
						<button className={platform === 'reels' ? 'on' : ''} onClick={() => setPlatform('reels')}>
							Reels / TikTok / Shorts
						</button>
						<button className={platform === 'youtube' ? 'on' : ''} onClick={() => setPlatform('youtube')}>
							YouTube 16:9
						</button>
					</div>
				</div>
				<div className="row" style={{gap: 8, justifyContent: 'flex-end'}}>
					<button className="ghost" onClick={onClose}>
						Zrušit
					</button>
					<button className="primary" disabled={!name.trim()} onClick={create}>
						Založit a nastavit styl
					</button>
				</div>
			</div>
		</div>
	);
};

// karta videa s náhledem (poslední videa)
const VideoCard: React.FC<{p: Meta}> = ({p}) => (
	<div className="video-card" onClick={() => (location.hash = `#p/${p.id}`)}>
		<div className="vc-thumb">
			{p.status === 'ready' ? <video src={`/media/${p.id}/base_preview.mp4#t=1`} muted preload="metadata" /> : <span className="muted small">{p.status === 'error' ? 'chyba' : 'zpracovává se…'}</span>}
		</div>
		<b>{p.name}</b>
		<span className="muted small">
			{new Date(p.createdAt).toLocaleDateString('cs-CZ')}
			{p.answers?.videoType ? ` · ${p.answers.videoType}` : ''}
		</span>
	</div>
);

// Knihovna jako samostatná stránka (grafika, fonty, hudba, efekty, hooky, zoomy, můj styl)
export const LibraryPage: React.FC = () => (
	<div className="home-v8">
		<TopNav />
		<div className="library-page">
			<LibraryLeft />
			<LibraryRight />
		</div>
	</div>
);
