// Projde nové obrazovky a udělá snímky: node scripts/uitest.mjs <složka>
import puppeteer from 'puppeteer-core';
const [out] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 600000});
const page = await browser.newPage();
await page.setViewport({width: 1680, height: 980});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({path: `${out}/ui_${n}.png`});
const go = async (h) => {
	await page.goto('http://localhost:5175/' + h, {waitUntil: 'networkidle2'});
	await wait(1200);
};
await go('');
await shot('01_home');
// najetí na šablonu v knihovně -> přehraje se
const card = await page.$('.lib .pv-card');
await card.hover();
await wait(1800);
await shot('02_home_hover');
await go('#new/_');
await shot('03_new');
// klient přes API
const c = await page.evaluate(async () => (await (await fetch('/api/clients', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: 'Test Klient UI', platform: 'reels'})})).json()));
await go(`#c/${c.id}/styl`);
await shot('04_style_color');
for (const [i, n] of ['type', 'gfx', 'zoom', 'hook', 'sound', 'length'].entries()) {
	const btns = await page.$$('.b-steps button');
	await btns[i + 1].click();
	await wait(900);
	if (n === 'gfx') {
		const cards = await page.$$('.pv-grid.gfx .pv-card');
		await cards[0].click();
		await cards[3].click();
		await cards[5].hover();
		await wait(1600);
	}
	if (n === 'zoom') {
		const cards = await page.$$('.pv-grid .pv-card');
		await cards[3].hover();
		await wait(1500);
	}
	await shot(`05_style_${n}`);
}
await go(`#c/${c.id}`);
await shot('06_client');
await page.evaluate(async (id) => fetch('/api/clients/' + id, {method: 'DELETE'}), c.id);
await go('#p/2026-10-29-58pn6');
await wait(2500);
await shot('07_editor');
console.log(errors.length ? 'CHYBY:\n' + [...new Set(errors)].join('\n') : 'bez chyb v konzoli');
await browser.close();
