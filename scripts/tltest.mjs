// Test timeline a nových panelů: node scripts/tltest.mjs <složka> <projekt>
import puppeteer from 'puppeteer-core';
const [out, id] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 600000});
const page = await browser.newPage();
await page.setViewport({width: 1680, height: 1000});
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({path: `${out}/tl_${n}.png`});
const clickText = async (sel, text) => {
	for (const el of await page.$$(sel)) if ((await el.evaluate((n) => n.textContent)).includes(text)) return el.click();
	throw new Error('nenalezeno: ' + text);
};
const proj = async () => page.evaluate(async (i) => (await (await fetch('/api/projects/' + i)).json()).project, id);

await page.goto(`http://localhost:5175/#p/${id}`, {waitUntil: 'networkidle2'});
await page.waitForSelector('.editor');
await wait(2500);
await clickText('.transport button', 'Timeline');
await wait(1200);
await shot('01_open');
const before = (await proj()).plan.beats.find((b) => b.kind === 'gfx');
const blk = await page.$('.tl-block.k-gfx');
const box = await blk.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, {steps: 8});
await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, {steps: 8});
await page.mouse.up();
await wait(1500);
await shot('02_dragged');
// pravý okraj = délka
const blk2 = await page.$('.tl-block.k-gfx.sel .h.r');
const b2 = await blk2.boundingBox();
await page.mouse.move(b2.x + 3, b2.y + 10);
await page.mouse.down();
await page.mouse.move(b2.x + 60, b2.y + 10, {steps: 10});
await page.mouse.up();
await wait(800);
await clickText('.insp .seg button', 'Pozice a font');
await wait(500);
const spots = await page.$$('.pos-grid button');
await spots[1].click();
await wait(1500);
await shot('03_inspector_pos');
await wait(1200); // autosave
const after = (await proj()).plan.beats.find((b) => b.id === before.id);
console.log('beat', before.id, 'dur', before.dur, '->', after.dur, 'shift', before.shift ?? 0, '->', after.shift, 'pos', JSON.stringify(after.pos));
// zavřít timeline, titulky
await page.click('.tl-head .ghost.icon[title="Zavřít timeline"]');
await wait(500);
await clickText('.tabs button', 'Titulky');
await wait(1200);
await shot('04_captions');
await clickText('.cap-presets .pv-card', 'Komiks');
await wait(1500);
await page.evaluate(() => document.querySelector('.player-wrap')?.scrollIntoView());
await shot('05_comic');
await clickText('.tabs button', 'Zvuk');
await wait(1200);
await shot('06_sound');
console.log('titulky', JSON.stringify((await proj()).captions).slice(0, 300));
console.log(errors.length ? 'CHYBY:\n' + [...new Set(errors)].join('\n') : 'bez chyb v konzoli');
await browser.close();
