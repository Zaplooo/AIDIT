import puppeteer from 'puppeteer-core';
const [out] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new'});
const page = await browser.newPage();
await page.setViewport({width: 1680, height: 1000});
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
for (const [n, h] of [['home', ''], ['new', '#new/_'], ['product', '#new/_?type=product'], ['ref', '#new/_?ref=https%3A%2F%2Fwww.youtube.com%2Fshorts%2FC-yZlQXN3rQ'], ['proc', '#p/2026-10-31-yxbhz']]) {
	await page.goto('http://localhost:5175/' + h, {waitUntil: 'networkidle2'});
	await wait(1500);
	if (n === 'product') {
		const b = await page.$$('.more-opts, button.ghost');
		for (const x of b) if ((await x.evaluate((e) => e.textContent)).includes('Více možností')) await x.click();
		await wait(400);
	}
	await page.screenshot({path: `${out}/n8_${n}.png`});
}
console.log(errors.length ? 'CHYBY:\n' + [...new Set(errors)].join('\n') : 'bez chyb v konzoli');
await browser.close();
