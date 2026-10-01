// THROWAWAY: shots of the species manager mock. Never merged.
import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
const errs = [];
p.on('console', (m) => {
  if (m.type() === 'error') {
    errs.push(m.text());
  }
});
for (const v of ['umbreon', 'from-eevee', 'edit', 'edit-eevee']) {
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(`http://localhost:4173/#/mock/${v}`, { waitUntil: 'networkidle2' });
  await p.reload({ waitUntil: 'networkidle2' });
  await p
    .waitForFunction(() => /Umbreon|Eevee|Glaceon|Swampert/.test(document.body.innerText), {
      timeout: 60000,
    })
    .catch(() => console.log('names timeout'));
  await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate(() => {
    for (const x of document.querySelectorAll('button')) {
      if (x.textContent.trim() === 'Not now') {
        x.click();
      }
    }
  });
  await new Promise((r) => setTimeout(r, 600));
  const h = await p.evaluate(() =>
    Math.max(844, ...[...document.querySelectorAll('.scroll, .screen, body')].map((e) => e.scrollHeight)),
  );
  const sheet = v === 'pin-confirm' || v === 'unpin';
  await p.setViewport({ width: 390, height: sheet ? 844 : h + 80, deviceScaleFactor: 2 });
  await new Promise((r) => setTimeout(r, 500));
  await p.screenshot({ path: `${out}/r4-${v}.png` });
  console.log('shot', v);
}
console.log(errs.slice(0, 5).join('\n'));
await b.close();
