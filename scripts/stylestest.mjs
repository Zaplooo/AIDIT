// přepne styly v editoru a vyfotí náhled: node scripts/stylestest.mjs <projekt> <složka>
import puppeteer from 'puppeteer-core';
const [id, out] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new'});
const page = await browser.newPage();
await page.setViewport({width: 1600, height: 960});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:5175/#p/${id}`, {waitUntil: 'networkidle2'});
await page.waitForSelector('.editor', {timeout: 60000});
for (const name of ['Filmový minimal', 'Split screen', 'Mix fontů', 'Goat základ', 'Dynamický creator']) {
	for (const el of await page.$$('.style-item')) if ((await el.evaluate((n) => n.textContent)).includes(name)) { await el.click(); break; }
	await wait(1500);
	await page.waitForFunction(() => !document.querySelector('.stage-busy'), {timeout: 300000});
	await wait(1500);
	// skok na první kartu a na běžné místo
	await page.evaluate(() => document.querySelectorAll('.tabs button')[2].click());
	await wait(400);
	const c = await page.$('.card-item .ghost.small');
	const shots = [];
	if (c) { await c.click(); await wait(1500); shots.push('card'); await page.screenshot({path: `${out}/st_${name.split(' ')[0]}_card.png`, clip: {x: 330, y: 56, width: 910, height: 790}}); }
	await page.evaluate(() => document.querySelectorAll('.tabs button')[0].click());
	await page.click('.mini-tl', {offset: {x: 200, y: 8}});
	await wait(1500);
	await page.screenshot({path: `${out}/st_${name.split(' ')[0]}.png`, clip: {x: 330, y: 56, width: 910, height: 790}});
	console.log(name, 'ok', shots.join(','));
}
console.log(errors.join('\n') || 'bez chyb');
await browser.close();
