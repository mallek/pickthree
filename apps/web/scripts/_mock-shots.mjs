import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
for (let i = 0; i < 30; i++) {
  try { await p.goto('http://localhost:4173/#/mock/meta', { waitUntil: 'networkidle2' }); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
for (const v of ['meta', 'metalog']) {
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(`http://localhost:4173/#/mock/${v}`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => !/stunfisk_galarian|cramorant|azumarill/.test(document.body.innerText), { timeout: 60000 }).catch(() => console.log('names timeout'));
  await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate(() => { for (const b of document.querySelectorAll('button')) { if (b.textContent.trim() === 'Not now') { b.click(); } } });
  await new Promise((r) => setTimeout(r, 600));
  const h = await p.evaluate(() => Math.max(844, ...[...document.querySelectorAll('.scroll, .screen, body')].map((e) => e.scrollHeight)));
  await p.setViewport({ width: 390, height: h + 80, deviceScaleFactor: 2 });
  await new Promise((r) => setTimeout(r, 500));
  await p.screenshot({ path: `${out}/mock-${v.replace('/', '-')}.png`, fullPage: false });
  console.log('shot', v);
}
console.log(errs.slice(0, 5).join('\n'));
await b.close();
