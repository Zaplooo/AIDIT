// npm run studio – spustí AIDIT (server + rozhraní na jednom portu) a otevře prohlížeč
import {spawn} from 'node:child_process';
import {createApp} from '../server/index.mjs';

const {app, CONFIG} = await createApp({dev: true});
app.listen(CONFIG.port, '127.0.0.1', () => {
	const url = `http://localhost:${CONFIG.port}`;
	console.log(`\n  AIDIT běží na ${url}\n  (okno terminálu nech otevřené, Ctrl+C = vypnout)\n`);
	if (!process.argv.includes('--no-open')) spawn('cmd', ['/c', 'start', '', url], {detached: true, stdio: 'ignore'});
});
