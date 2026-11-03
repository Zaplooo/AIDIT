import type {Project} from './model';
import type {CutMode, Setup} from './setup';

export type Meta = {id: string; name: string; createdAt: string; status: string; duration?: number; error?: string; answers?: Answers; jobId?: string; clientId?: string | null; sources?: {file: string; name: string}[]; segments?: {start: number; end: number; name: string}[]; planSetup?: string};
export type Client = {id: string; name: string; note?: string; platform: 'reels' | 'youtube'; format: '9:16' | '16:9' | '1:1'; setup: Setup; createdAt: string; updatedAt?: string; videos?: number};
export type Preview = {kind: 'gfx' | 'zoom' | 'hook' | 'caption' | 'color' | 'music' | 'font' | 'bg'; id: string};
export type LogLine = {t: number; line: string};
export type Job = {id: string; kind: string; status: 'running' | 'done' | 'error' | 'unknown'; progress: number; step: string; error: string | null; result: {file?: string; styleId?: string; name?: string; summary?: string; whyGreat?: string[]} | null; log: LogLine[]};
export type Style = {id: string; name: string; description: string; platform?: 'reels' | 'youtube'; learnedFrom?: string[]; summary?: string; look: Record<string, string>; captions: Record<string, unknown>; cards?: {kind: string; every: number}; theme?: {bg: string; font: string; serif: string}; recipe?: Record<string, unknown>};
export type Prefs = {notes: string; likes: string[]; dislikes: string[]; removed: Record<string, number>; added: Record<string, number>};
export type ChatMsg = {role: 'user' | 'ai'; text: string; previews?: Preview[]};
export type MusicTrack = {id: string; file: string; cat: string; name: string; duration: number};
export type Version = {id: string; label: string; createdAt: string};
export type Answers = {preset?: string; tempo?: 'calm' | 'normal' | 'fast'; jump?: 'hard' | 'punch'; sfx?: 'off' | 'soft' | 'bold'; maxLength?: number | null; format?: '9:16' | '16:9' | '1:1'; platform?: 'reels' | 'youtube'; captions?: boolean; done?: boolean; brief?: string; music?: string; zoom?: boolean; chat?: ChatMsg[]; setup?: Setup; cutMode?: CutMode; script?: string; order?: number[]; videoType?: string; refUrl?: string; autoRun?: boolean};

const j = async <T,>(r: Response): Promise<T> => {
	if (!r.ok) throw new Error((await r.text()) || r.statusText);
	return r.json();
};
const send = (method: string, body: unknown) => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

const xhrUpload = <T,>(url: string, fields: Record<string, string>, fileField: string, file: File, onProgress: (p: number) => void) =>
	new Promise<T>((resolve, reject) => {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.append(k, v);
		fd.append(fileField, file);
		const x = new XMLHttpRequest();
		x.open('POST', url);
		x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
		x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(x.responseText)));
		x.onerror = () => reject(new Error('Nahrání selhalo'));
		x.send(fd);
	});

const xhrUploadMany = <T,>(url: string, fields: Record<string, string>, fileField: string, files: File[], onProgress: (p: number) => void) =>
	new Promise<T>((resolve, reject) => {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.append(k, v);
		for (const f of files) fd.append(fileField, f);
		const x = new XMLHttpRequest();
		x.open('POST', url);
		x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
		x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(x.responseText || x.statusText)));
		x.onerror = () => reject(new Error('Nahrávání selhalo'));
		x.send(fd);
	});

export const api = {
	styles: () => fetch('/api/styles').then(j<Style[]>),
	projects: () => fetch('/api/projects').then(j<Meta[]>),
	project: (id: string) => fetch(`/api/projects/${id}`).then(j<{meta: Meta; project: Project | null; job: Job | null}>),
	answers: (id: string, a: Answers) => fetch(`/api/projects/${id}/answers`, send('PUT', a)).then(j<Answers>),
	save: (p: Project) => fetch(`/api/projects/${p.id}/project`, send('PUT', p)).then(j<{ok: boolean; needsBase: boolean}>),
	apply: (id: string, body: {project?: Project; units?: Record<string, boolean>; first?: string | null; preset?: string; replan?: boolean}) => fetch(`/api/projects/${id}/apply`, send('POST', body)).then(j<Job>),
	remove: (id: string) => fetch(`/api/projects/${id}`, {method: 'DELETE'}).then(j),
	versions: (id: string) => fetch(`/api/projects/${id}/versions`).then(j<Version[]>),
	saveVersion: (p: Project, label: string) => fetch(`/api/projects/${p.id}/versions`, send('POST', {project: p, label})).then(j<Version>),
	version: (id: string, v: string) => fetch(`/api/projects/${id}/versions/${v}`).then(j<{project: Project}>),
	exportVideo: (id: string, preset: string) => fetch(`/api/projects/${id}/export`, send('POST', {preset})).then(j<Job>),
	job: (id: string) => fetch(`/api/jobs/${id}`).then(j<Job>),
	reveal: (file: string) => fetch('/api/reveal', send('POST', {file})).then(j),
	chat: (id: string, messages: ChatMsg[]) => fetch(`/api/projects/${id}/chat`, send('POST', {messages})).then(j<{reply: string}>),
	brief: (id: string, messages: ChatMsg[]) => fetch(`/api/projects/${id}/brief`, send('POST', {messages})).then(j<{brief: string; style: string; tempo: string; music: string; maxLength: number}>),
	reference: (url: string, note = '') => fetch('/api/reference', send('POST', {url, note})).then(j<Job>),
	musicLib: () => fetch('/music/library.json').then(j<MusicTrack[]>),
	upload: (files: File[], fields: {answers: Answers; clientId?: string | null; name?: string}, onProgress: (p: number) => void) =>
		xhrUploadMany<{id: string; jobId: string}>('/api/projects', {answers: JSON.stringify(fields.answers), clientId: fields.clientId ?? '', name: fields.name ?? ''}, 'files', files, onProgress),
	music: (id: string, file: File, onProgress: (p: number) => void) => xhrUpload<{music: {file: string; name: string}}>(`/api/projects/${id}/music`, {}, 'music', file, onProgress),
	clients: () => fetch('/api/clients').then(j<Client[]>),
	client: (id: string) => fetch(`/api/clients/${id}`).then(j<Client>),
	newClient: (c: Partial<Client>) => fetch('/api/clients', send('POST', c)).then(j<Client>),
	saveClient: (id: string, c: Partial<Client>) => fetch(`/api/clients/${id}`, send('PUT', c)).then(j<Client>),
	removeClient: (id: string) => fetch(`/api/clients/${id}`, {method: 'DELETE'}).then(j),
	finishSetup: (id: string, answers: Answers) => fetch(`/api/projects/${id}/setup`, send('POST', {answers})).then(j<Job>),
	assist: (id: string | null, body: {messages: ChatMsg[]; setup: Setup; step: string; name?: string}) =>
		fetch(id ? `/api/projects/${id}/assist` : '/api/assist', send('POST', body)).then(j<{reply: string; brief: string; setup: Partial<Setup>; previews: Preview[]; goto: string | null}>),
	hooks: (id: string) => fetch(`/api/projects/${id}/hooks`, send('POST', {})).then(j<{hooks: {text: string; why: string}[]}>),
	gfxFill: (id: string, type: string, time: number, prev?: unknown, idea?: string) => fetch(`/api/projects/${id}/gfxfill`, send('POST', {type, time, prev, idea})).then(j<{gfx: import('./remotion/gfx').Gfx; dur: number | null}>),
	brollSearch: (id: string, query: string) => fetch(`/api/projects/${id}/broll-search`, send('POST', {query})).then(j<{id: string; title: string}[]>),
	brollSet: (id: string, body: {beatId?: string; mixkit: string; title: string; wi?: number; shift?: number; dur?: number; alts?: {id: string; title: string}[]}) => fetch(`/api/projects/${id}/broll-set`, send('POST', body)).then(j<{ok: boolean; beatId: string}>),
	prefs: () => fetch('/api/prefs').then(j<Prefs>),
	savePrefs: (p: Partial<Prefs>) => fetch('/api/prefs', send('PUT', p)).then(j<Prefs>),
	styleSetup: (id: string) => fetch(`/api/styles/${id}/setup`).then(j<Setup>),
	uploadSfx: (file: File, cat: string) => xhrUpload<{id: string; file: string; cat: string; name: string; own: boolean}>('/api/sfx', {cat}, 'sfx', file, () => {}),
	emoji: (id: string) => fetch(`/api/projects/${id}/emoji`, send('POST', {})).then(j<{count: number}>),
	syncBeats: (id: string, beatId?: string) => fetch(`/api/projects/${id}/sync`, send('POST', {beatId})).then(j),
	command: (id: string, text: string, history: ChatMsg[], time: number) => fetch(`/api/projects/${id}/command`, send('POST', {text, history, time})).then(j<{reply: string; seek: number | null; job: Job | null}>),
};

// čekání na job (zpracování, přepočet, export)
export async function waitJob(id: string, onTick: (j: Job) => void): Promise<Job> {
	for (;;) {
		const job = await api.job(id);
		onTick(job);
		if (job.status !== 'running') return job;
		await new Promise((r) => setTimeout(r, 900));
	}
}
