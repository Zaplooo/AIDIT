import React from 'react';
import {api, Job} from '../api';
import type {Project} from '../model';

const PRESETS = [
	{key: 'reels', label: 'Instagram Reels', sub: '1080×1920 · 16 Mb/s', format: '9:16'},
	{key: 'tiktok', label: 'TikTok', sub: '1080×1920 · 16 Mb/s', format: '9:16'},
	{key: 'shorts', label: 'YouTube Shorts', sub: '1080×1920 · 16 Mb/s', format: '9:16'},
	{key: 'youtube', label: 'YouTube 16:9', sub: '1920×1080 · 20 Mb/s', format: '16:9'},
];

export const ExportDialog: React.FC<{project: Project; onClose: () => void}> = ({project, onClose}) => {
	const [preset, setPreset] = React.useState(project.format === '16:9' ? 'youtube' : 'reels');
	const [job, setJob] = React.useState<Job | null>(null);
	const p = PRESETS.find((x) => x.key === preset)!;

	React.useEffect(() => {
		if (!job || job.status !== 'running') return;
		const t = setTimeout(async () => setJob(await api.job(job.id)), 1000);
		return () => clearTimeout(t);
	}, [job]);

	return (
		<div className="modal-bg" onClick={() => job?.status !== 'running' && onClose()}>
			<div className="modal" onClick={(e) => e.stopPropagation()}>
				<h3>Export</h3>
				{!job ? (
					<>
						<div className="presets">
							{PRESETS.map((x) => (
								<button key={x.key} className={preset === x.key ? 'on' : ''} onClick={() => setPreset(x.key)}>
									<b>{x.label}</b>
									<div className="muted small">{x.sub}</div>
								</button>
							))}
						</div>
						{p.format !== project.format ? (
							<p className="muted small">Video je {project.format}, export bude {p.format}. Výřez se automaticky nastaví na obličej.</p>
						) : null}
						<p className="muted small">H.264, zvuk AAC 320 kb/s, hlasitost −14 LUFS. Uloží se do složky export.</p>
						<div className="row" style={{justifyContent: 'flex-end', marginTop: 16}}>
							<button className="ghost" onClick={onClose}>
								Zrušit
							</button>
							<button className="primary" onClick={async () => setJob(await api.exportVideo(project.id, preset))}>
								Exportovat
							</button>
						</div>
					</>
				) : job.status === 'running' ? (
					<>
						<p className="muted">{job.step}…</p>
						<div className="bar">
							<div style={{width: `${job.progress * 100}%`}} />
						</div>
						<p className="muted small">Render běží v jednom okně (kvůli ostrosti a stabilitě grafiky), krátký reel trvá pár minut.</p>
					</>
				) : job.status === 'done' && job.result ? (
					<>
						<p>Hotovo ✔</p>
						<p className="muted small" style={{wordBreak: 'break-all'}}>{job.result.file}</p>
						<div className="row" style={{justifyContent: 'flex-end'}}>
							<button onClick={() => api.reveal(job.result!.file ?? '')}>Otevřít složku</button>
							<button className="primary" onClick={onClose}>
								Zavřít
							</button>
						</div>
					</>
				) : (
					<>
						<p style={{color: 'var(--danger)', whiteSpace: 'pre-wrap'}}>Export selhal: {job.error}</p>
						<button onClick={onClose}>Zavřít</button>
					</>
				)}
			</div>
		</div>
	);
};
