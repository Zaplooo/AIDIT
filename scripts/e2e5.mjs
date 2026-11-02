// Celá cesta v5 jako uživatel: klient se stylem -> nahrání 2 klipů -> průvodce s AI -> střih -> pokyn v editoru
// node scripts/e2e5.mjs <složka na snímky> <klip1> <klip2>
import puppeteer from 'puppeteer-core';
const [out, ...clips] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('cs-CZ'), ...a);
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 2400000});
const page = await browser.newPage();
await page.setViewport({width: 1680, height: 980});
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({path: `${out}/e5_${n}.png`});
const api = (url, body, method = 'POST') => page.evaluate(async (u, b, m) => (await fetch(u, {method: m, headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined})).json(), url, body, method);
const clickText = async (sel, text) => {
	for (const el of await page.$$(sel)) if ((await el.evaluate((n) => n.textContent)).includes(text)) return el.click();
	throw new Error('nenalezeno: ' + text);
};

await page.goto('http://localhost:5175/', {waitUntil: 'networkidle2'});
const c = await api('/api/clients', {name: 'Test Spánek', platform: 'reels', setup: {color: '#22C55E', bg: 'brand', caption: 'bold', gfx: ['reveal', 'stat', 'list', 'cards', 'versus'], zoom: 'pulse', hook: {visual: 'title', sfx: true, text: ''}, music: {mode: 'mood', mood: 'energetic'}}});
log('klient', c.id);
await page.goto(`http://localhost:5175/#new/${c.id}`, {waitUntil: 'networkidle2'});
await wait(800);
await (await page.$('input[type=file]')).uploadFile(...clips);
await wait(500);
await shot('01_new_clips');
await clickText('button', 'Nahrát a pokračovat');
log('nahrávám');
await page.waitForSelector('.builder', {timeout: 900000});
log('průvodce');
await wait(1500);
await shot('02_builder_chat');
await page.type('.aibar.big textarea', 'Je to video o spánku pro mladé lidi, co jsou odpoledne unavení. Chci hudbu od Travise Scotta a víc čísel – přidej i číslo z částic.');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.aibar.big .msg.ai').length >= 2 && !document.querySelector('.bubble.typing'), {timeout: 300000});
await wait(1500);
await shot('03_chat_reply');
const pid = await page.evaluate(() => location.hash.split('/')[1]);
const setup1 = (await api('/api/projects/' + pid, null, 'GET')).meta.answers;
log('po chatu: hudba', JSON.stringify(setup1.setup?.music), 'grafika', JSON.stringify(setup1.setup?.gfx));
// krok Grafika – AI změny musí být vidět
await clickText('.b-steps button', 'Motion grafika');
await wait(1500);
await shot('04_gfx_after_ai');
await clickText('.b-steps button', 'Hudba');
await wait(800);
await shot('05_sound_after_ai');
// Vyber za mě na zoomech
await clickText('.b-steps button', 'Zoomy');
await wait(600);
await clickText('.b-head button', 'Vyber za mě');
await page.waitForFunction(() => !document.querySelector('.bubble.typing') && document.querySelectorAll('.msg.ai').length >= 3, {timeout: 300000});
await wait(1200);
await shot('06_zoom_pick');
// počkat na zpracování videa
const id = await page.evaluate(() => location.hash.split('/')[1]);
for (;;) {
	const r = await api(`/api/projects/${id}`, null, 'GET');
	if (r.meta.status === 'ready') break;
	if (r.meta.status === 'error') throw new Error(r.meta.error);
	await wait(10000);
}
log('zpracováno');
await page.reload({waitUntil: 'networkidle2'});
await wait(2000);
await clickText('.b-steps button', 'Hook');
await wait(600);
await clickText('.hook-text button', 'Navrhni hooky');
await page.waitForSelector('.hook-idea', {timeout: 300000});
await (await page.$('.hook-idea')).click();
await wait(800);
await shot('07_hook_ideas');
await clickText('.b-steps button', 'Souhrn');
await wait(1000);
await shot('08_summary');
await clickText('button', 'Stříhej');
log('stříhám');
await page.waitForSelector('.editor', {timeout: 1800000});
await wait(4000);
await shot('09_editor');
log('editor');
await page.type('.cmd-bar textarea', 'Udělej titulky o něco menší a hudbu klidnější.');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.cmd-bar .msg.ai').length >= 1 && !document.querySelector('.cmd-bar .bubble.typing') && !document.querySelector('.stage-busy'), {timeout: 600000});
await wait(2500);
await shot('10_editor_cmd');
const p = await api(`/api/projects/${id}`, null, 'GET');
log('titulky', p.project.captions.size, 'hudba', p.project.look.music?.name, 'hook', JSON.stringify(p.project.look.hook), 'beaty', p.project.plan.beats.map((b) => b.gfx?.type ?? b.kind).join(','));
console.log(errors.length ? 'CHYBY:\n' + [...new Set(errors)].join('\n') : 'bez chyb v konzoli');
console.log('PROJEKT', id, 'KLIENT', c.id);
await browser.close();
