// Test timeline v7: zvuky, titulek, hudba, hook, vlastní grafika: node scripts/tltest2.mjs <složka> <projekt>
import puppeteer from 'puppeteer-core';
const [out, id] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 600000});
const page = await browser.newPage();
await page.setViewport({width: 1680, height: 1000});
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({path: `${out}/t7_${n}.png`});
const clickText = async (sel, text) => {
	for (const el of await page.$$(sel)) if ((await el.evaluate((n) => n.textContent)).includes(text)) return el.click();
	throw new Error('nenalezeno: ' + text);
};
const proj = async () => page.evaluate(async (i) => (await (await fetch('/api/projects/' + i)).json()).project, id);

await page.goto(`http://localhost:5175/#p/${id}`, {waitUntil: 'networkidle2'});
await page.waitForSelector('.editor');
await wait(2500);
await clickText('.transport button', 'Timeline');
await wait(1500);
console.log('zvukových bloků', (await page.$$('.tl-sfx')).length);
// klik na zvuk
const s1 = await page.$('.tl-sfx');
await s1.click();
await wait(800);
await shot('01_sfx_insp');
// vypnout tenhle zvuk
await clickText('.insp button', 'Vypnout');
await wait(1500);
console.log('po vypnutí', (await page.$$('.tl-sfx')).length);
// nový zvuk
await clickText('.tl-head button', 'Zvuk');
await wait(1200);
const row = await page.$('.insp .sfx-row');
await row.click();
await wait(1200);
await shot('02_new_sfx');
// titulek
const cap = await page.$$('.tl-cap');
await cap[3].click();
await wait(800);
await shot('03_cap');
// hudba
await page.click('.tl-music');
await wait(1000);
await shot('04_music');
// hook
const hook = await page.$('.tl-block.k-hook');
if (hook) {
	await hook.click();
	await wait(800);
	await shot('05_hook');
}
// vlastní grafika přes AI
await page.select('.tl-add', 'custom');
await page.waitForFunction(() => document.body.innerText.includes('vyplněno') || document.body.innerText.includes('nepomohla'), {timeout: 200000});
await wait(2500);
await shot('06_custom');
await wait(1500);
const p = await proj();
const c = p.plan.beats.find((b) => b.gfx?.type === 'custom');
console.log('vlastní grafika', JSON.stringify(c?.gfx).slice(0, 400), 'dur', c?.dur);
console.log('vlastní zvuky', JSON.stringify(p.plan.sounds), 'úpravy', JSON.stringify(p.plan.sfxEdit));
console.log(errors.length ? 'CHYBY:\n' + [...new Set(errors)].join('\n') : 'bez chyb v konzoli');
await browser.close();
