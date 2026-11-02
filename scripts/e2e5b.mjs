// Pokračování testu v5 na už nahraném projektu: Vyber za mě -> hooky -> souhrn -> Stříhej -> pokyn v editoru
// node scripts/e2e5b.mjs <složka na snímky> <projekt>
import puppeteer from 'puppeteer-core';
const [out, id] = process.argv.slice(2);
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

await page.goto(`http://localhost:5175/#p/${id}`, {waitUntil: 'networkidle2'});
await page.waitForSelector('.builder');
await wait(1500);
const before = (await api(`/api/projects/${id}`, null, 'GET')).meta.answers.chat?.length ?? 1;
await clickText('.b-steps button', 'Zoomy');
await wait(600);
await clickText('.b-head button', 'Vyber za mě');
await page.waitForFunction((n) => !document.querySelector('.bubble.typing') && document.querySelectorAll('.msg').length > 0, {timeout: 300000}, before);
for (let i = 0; i < 60; i++) {
	const a = (await api(`/api/projects/${id}`, null, 'GET')).meta.answers;
	if ((a.chat?.length ?? 0) >= before + 2) break;
	await wait(3000);
}
await wait(1500);
await shot('06_zoom_pick');
log('zoom po Vyber za mě:', (await api(`/api/projects/${id}`, null, 'GET')).meta.answers.setup.zoom);
for (;;) {
	const r = await api(`/api/projects/${id}`, null, 'GET');
	if (r.meta.status === 'ready') break;
	if (r.meta.status === 'error') throw new Error(r.meta.error);
	await wait(10000);
}
log('zpracováno');
await page.reload({waitUntil: 'networkidle2'});
await page.waitForSelector('.builder');
await wait(2000);
await clickText('.b-steps button', 'Hook');
await wait(600);
await clickText('.hook-text button', 'Navrhni hooky');
await page.waitForSelector('.hook-idea', {timeout: 300000});
await (await page.$('.hook-idea')).click();
await wait(800);
await shot('07_hook_ideas');
await clickText('.b-steps button', 'Souhrn');
await wait(1500);
await shot('08_summary');
await clickText('button', 'Stříhej');
log('stříhám');
await page.waitForSelector('.editor', {timeout: 1800000});
await wait(5000);
await shot('09_editor');
log('editor');
await page.type('.cmd-bar textarea', 'Udělej titulky o něco menší a hudbu klidnější.');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.cmd-bar .msg.ai').length >= 1 && !document.querySelector('.stage-busy'), {timeout: 600000});
await wait(3000);
await shot('10_editor_cmd');
const p = await api(`/api/projects/${id}`, null, 'GET');
log('titulky', p.project.captions.size, p.project.captions.font, '| hudba', p.project.look.music?.name, '| hook', JSON.stringify(p.project.look.hook), '| zoom', p.project.look.zoomStyle);
log('beaty', p.project.plan.beats.map((b) => b.gfx?.type ?? b.kind).join(','));
log('klipy', p.project.clips.filter((c) => c.enabled).length, 'délka', p.project.clips.filter((c) => c.enabled).reduce((s, c) => s + c.out - c.in, 0).toFixed(1));
console.log(errors.length ? 'CHYBY:\n' + [...new Set(errors)].join('\n') : 'bez chyb v konzoli');
await browser.close();
