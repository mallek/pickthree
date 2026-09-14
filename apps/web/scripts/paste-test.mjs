/* global document, location, HTMLTextAreaElement */
/**
 * Proves the adaptive importer end to end in Chrome: a hand-made, tab separated sheet with forms
 * and shadows folded into the names goes through the paste box and lands on the report screen,
 * and a sheet with no CP column is refused with a message that names CP.
 *
 *   node apps/web/scripts/paste-test.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';

const base = process.argv[2] ?? 'http://localhost:4173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : [])],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const sheet = [
  'Name\tCP\tAtk\tDef\tSta',
  'Azumarill\t1498\t0\t15\t14',
  'Shadow Swampert\t1497\t0\t14\t15',
  'Galarian Stunfisk\t1496\t2\t15\t15',
  'Medicham\t1500\t4\t15\t15',
  'Ninetales (Alolan)\t1493\t12\t13\t10',
  'Lickitung\t1499\t2\t15\t15',
].join('\n');

async function importText(text) {
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /Paste CSV text/.test(x.textContent ?? ''),
    );
    b?.click();
  });
  await page.waitForSelector('textarea.paste');
  await page.evaluate((t) => {
    const ta = document.querySelector('textarea.paste');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, t);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /Import pasted text/.test(x.textContent ?? ''),
    );
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  return page.evaluate(() => ({
    hash: location.hash,
    h2: document.querySelector('h2')?.textContent ?? '',
    notes: [...document.querySelectorAll('p.meta, p.small.muted')].map((p) =>
      p.textContent?.trim(),
    ),
    error: document.querySelector('.error')?.textContent ?? '',
  }));
}

const failures = [];
const ok = await importText(sheet);
console.log('sheet ->', ok.hash, '|', ok.h2);
if (ok.hash !== '#/report' || !/^6 Pokémon/.test(ok.h2)) {
  failures.push(`sheet import: expected 6 Pokémon on the report, got "${ok.h2}" at ${ok.hash}`);
}
if (!ok.notes.some((n) => /Read as a sheet: 5 columns, 5 used/.test(n ?? ''))) {
  failures.push('sheet import: missing the "Read as a sheet" line');
}
if (!ok.notes.some((n) => /Level was worked out/.test(n ?? ''))) {
  failures.push('sheet import: missing the derived-level note');
}

const bad = await importText('Name\tAtk\tDef\tSta\nAzumarill\t0\t15\t14');
console.log('no CP  ->', bad.hash, '|', bad.error);
if (bad.hash === '#/report' || !/CP/.test(bad.error) || /Poke Genie/.test(bad.error)) {
  failures.push(`no-CP sheet: expected a refusal naming CP, got "${bad.error}" at ${bad.hash}`);
}

if (errors.length > 0) {
  failures.push(`page errors: ${errors.join(' | ')}`);
}
await browser.close();
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('paste-test ok');
