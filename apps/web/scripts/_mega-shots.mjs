import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
for (const theme of ['dark', 'light']) {
  const p = await b.newPage();
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto('http://localhost:4173/#/mock', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => document.body.innerText.includes('Gyarados'), { timeout: 60000 }).catch(() => console.log('names timeout'));
  await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate(() => { for (const x of document.querySelectorAll('button')) { if (x.textContent.trim() === 'Not now') { x.click(); } } });
  await new Promise((r) => setTimeout(r, 500));
  const h = await p.evaluate(() => Math.max(844, ...[...document.querySelectorAll('.scroll, .screen, body')].map((e) => e.scrollHeight)));
  await p.setViewport({ width: 390, height: h + 80, deviceScaleFactor: 2 });
  await new Promise((r) => setTimeout(r, 500));
  await p.screenshot({ path: `${out}/mega-glyph-${theme}.png` });
  console.log('shot', theme);
  await p.close();
}
await b.close();
