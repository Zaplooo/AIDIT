// měření plynulosti náhledu v editoru: node scripts/perf.mjs <projekt> <od s> <délka s>
import puppeteer from 'puppeteer-core';
const [id, from = '18', len = '12'] = process.argv.slice(2);
const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage();
await page.setViewport({width: 1600, height: 960});
await page.goto(`http://localhost:5175/#p/${id}`, {waitUntil: 'networkidle2'});
await page.waitForSelector('.editor');
await page.waitForFunction(() => !document.querySelector('.stage-busy'), {timeout: 600000});
await new Promise((r) => setTimeout(r, 2500));
// skok na úsek a přehrání; měří se snímky vykreslené stránkou (requestAnimationFrame) a zpoždění přehrávače
const r = await page.evaluate(async (from, len) => {
	const bar = document.querySelector('.mini-tl') || document.querySelector('.tl-ruler');
	const total = parseFloat(document.querySelector('.tc').textContent.split('/')[1].split(':').reduce((a, b) => a * 60 + +b, 0));
	const rect = bar.getBoundingClientRect();
	bar.dispatchEvent(new MouseEvent('mousedown', {clientX: rect.left + (rect.width * from) / total, clientY: rect.top + 6, bubbles: true}));
	window.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	await new Promise((r) => setTimeout(r, 1500));
	document.querySelector('.transport .play').click();
	const trace = [];
	const iv = setInterval(() => trace.push(document.querySelector('.tc').textContent.split(' /')[0]), 500);
	const gaps = [];
	let last = performance.now();
	const t0 = last;
	await new Promise((res) => {
		const loop = (now) => {
			gaps.push(now - last);
			last = now;
			if (now - t0 < len * 1000) requestAnimationFrame(loop);
			else res();
		};
		requestAnimationFrame(loop);
	});
	clearInterval(iv);
	document.querySelector('.transport .play').click();
	const tc = document.querySelector('.tc').textContent + ' | ' + trace.join(' ') + ' | buffering:' + document.querySelectorAll('[data-remotion-buffering]').length;
	gaps.sort((a, b) => a - b);
	return {frames: gaps.length, fps: (gaps.length / len).toFixed(1), p95ms: gaps[Math.floor(gaps.length * 0.95)].toFixed(1), maxms: gaps[gaps.length - 1].toFixed(1), over50ms: gaps.filter((g) => g > 50).length, tc};
}, +from, +len);
console.log(JSON.stringify(r));
await browser.close();
