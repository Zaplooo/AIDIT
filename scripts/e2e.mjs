// Celý průchod aplikací jako uživatel: node scripts/e2e.mjs <video> <složka na snímky>
import puppeteer from 'puppeteer-core';
const [video, out] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 1200000});
const page = await browser.newPage();
await page.setViewport({width: 1600, height: 960});
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({path: `${out}/e2e_${n}.png`});
const click = async (sel, text) => {
	for (const el of await page.$$(sel)) if ((await el.evaluate((n) => n.textContent)).includes(text)) return el.click();
	throw new Error('nenalezeno: ' + text);
};
const log = (...a) => console.log(new Date().toLocaleTimeString('cs-CZ'), ...a);

if (video.startsWith('p:')) {
	// navázat na už nahraný projekt
	await page.goto(`http://localhost:5175/#p/${video.slice(2)}`, {waitUntil: 'networkidle2'});
} else {
	await page.goto('http://localhost:5175/', {waitUntil: 'networkidle2'});
	await shot('01_format');
	await click('.fmt-card', 'Krátké video');
	await wait(400);
	await shot('02_drop');
	const input = await page.$('input[type=file]');
	await input.uploadFile(video);
	log('nahrávám');
}
await page.waitForSelector('.wizard', {timeout: 600000});
log('průvodce');
await wait(1500);
await shot('03_chat');
await page.type('.chat-input textarea', 'Je to video o spánku pro mladé lidi, kteří jsou odpoledne unavení. Chci aby to bylo dynamické, profesionální, s B-rollem a grafikou, ale ne přeplácané. Hudba energická.');
await click('.chat-input button', 'Poslat');
await page.waitForFunction(() => document.querySelectorAll('.msg.ai').length >= 2 && !document.querySelector('.bubble.typing'), {timeout: 180000});
await shot('04_chat_reply');
log('AI odpověděla:', await page.$$eval('.msg.ai .bubble', (b) => b[b.length - 1].textContent));
await click('button', 'Hotovo, pokračovat');
await page.waitForSelector('.ref-step', {timeout: 180000});
await shot('05_reference');
await click('button', 'Nemám, přeskočit');
await wait(800);
await shot('06_style');
await click('.choice', 'Storytelling');
await wait(800);
await shot('07_tempo');
await click('.choice', 'Svižné');
await wait(800);
await shot('08_sound');
await click('button.primary', 'Další');
await wait(600);
await shot('09_length');
await click('.choice', 'Nech to na AI');
await wait(800);
await shot('10_ai_wait');
log('čekám na zpracování');
await page.waitForSelector('.ai-qs', {timeout: 1800000});
await wait(1000);
await shot('11_ai_questions');
const opts = await page.$$('.ai-q');
for (const q of opts) {
	const c = await q.$('.choice');
	if (c) await c.click();
}
await shot('12_answered');
await click('button', 'Ukázat sestříhané video');
await page.waitForSelector('.editor', {timeout: 1800000});
await page.waitForFunction(() => !document.querySelector('.stage-busy'), {timeout: 1800000});
await wait(3000);
await shot('13_editor');
log('hotovo');
await page.keyboard.press('Space');
await wait(5000);
const q = await page.evaluate(() => {
	const v = document.querySelector('.player-wrap video');
	const pq = v?.getVideoPlaybackQuality();
	return {dropped: pq?.droppedVideoFrames, total: pq?.totalVideoFrames};
});
log('přehrávání', JSON.stringify(q));
const tabs = await page.$$('.tabs button');
await tabs[2].click();
await wait(600);
await shot('14_grafika');
await tabs[3].click();
await wait(600);
await shot('15_zvuk');
console.log(errors.join('\n') || 'bez chyb v konzoli');
console.log('projekt', page.url());
await browser.close();
