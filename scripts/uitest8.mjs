// snímky v8: hlavní stránka, knihovna, editor (titulky Bounce + emoji): node scripts/uitest8.mjs <složka> <projekt>
import puppeteer from 'puppeteer-core';
const [out, id] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 400000});
const page = await browser.newPage();
await page.setViewport({width: 1600, height: 960});
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const clickText = async (sel, text) => {
	for (const el of await page.$$(sel)) if ((await el.evaluate((n) => n.textContent)).includes(text)) return el.click();
	throw new Error('nenalezeno: ' + text);
};
for (const [n, h] of [['home', ''], ['lib', '#knihovna']]) {
	await page.goto('http://localhost:5175/' + h, {waitUntil: 'networkidle2'});
	await wait(1500);
	await page.screenshot({path: `${out}/v8_${n}.png`});
}
await page.goto(`http://localhost:5175/#p/${id}`, {waitUntil: 'networkidle2'});
await page.waitForSelector('.editor');
await wait(2500);
await clickText('.cap-presets .pv-card', 'Bounce');
await wait(1200);
// skok na 20 s
await page.evaluate(() => {
	const r = document.querySelector('.tl-ruler').getBoundingClientRect();
	document.querySelector('.tl-ruler').dispatchEvent(new MouseEvent('mousedown', {clientX: r.left + 20 * (r.width / 52), clientY: r.top + 5, bubbles: true}));
});
await wait(1500);
await page.screenshot({path: `${out}/v8_editor.png`});
await clickText('.cap-presets .pv-card', 'S emoji');
await page.waitForFunction(() => !document.querySelector('.stage-busy'), {timeout: 200000});
await wait(2500);
await page.screenshot({path: `${out}/v8_emoji.png`});
const p = await page.evaluate(async (i) => (await (await fetch('/api/projects/' + i)).json()).project, id);
console.log('emoji', JSON.stringify(p.plan.emojis), 'captions.emoji', p.captions.emoji, p.captions.animation);
console.log(errors.length ? 'CHYBY:\n' + [...new Set(errors)].join('\n') : 'bez chyb v konzoli');
await browser.close();
