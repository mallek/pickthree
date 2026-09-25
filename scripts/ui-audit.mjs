#!/usr/bin/env node
/**
 * Builds the component gallery, serves it, and audits it in dark and light at 390px. Writes
 * packages/ui/screenshots/gallery-<theme>.png (gitignored) and exits 1 on any finding or console
 * error. Then checks the audit itself on a tiny fixed page (the self-check below) and exits 1 if
 * the audit's own contrast measuring misses a known failure or flags a known pass.
 *
 *   npm run ui:audit
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { build, preview } from 'vite';
import { auditPage, prepareAudit } from './audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = path.join(root, 'packages', 'ui');
const configFile = path.join(uiDir, 'vite.gallery.config.ts');
const outDir = path.join(uiDir, 'screenshots');
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(outDir, { recursive: true });
await build({ configFile, logLevel: 'warn' });
const server = await preview({ configFile });
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:4175/';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : [])],
});
const failures = [];
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('console', (m) => {
      if (m.type() === 'error') {
        failures.push(`[${theme} console.error] ${m.text()}`);
      }
    });
    page.on('pageerror', (e) => failures.push(`[${theme} pageerror] ${e.message}`));
    await prepareAudit(page);
    await page.goto(`${base}?theme=${theme}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(outDir, `gallery-${theme}.png`), fullPage: true });
    for (const f of await auditPage(page)) {
      failures.push(`[${theme}] ${f}`);
    }
    await page.close();
  }

  // Self-check for the audit's own contrast measuring (audit.mjs, measureBelowOpaque): two
  // two-line paragraphs on opaque sheets, each over a page block that ends between its lines, so
  // axe finds different stacks under the two lines and leaves both undecided. The audit must
  // measure both: #fail (#aaaaaa on white, 2.32:1) as a hard finding, #pass (#333333) as clean.
  // Anything else, including either one left "unverified", means that path has regressed.
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await prepareAudit(page);
  await page.setContent(`<!doctype html>
<html lang="en"><head><title>audit self-check</title><style>
  body { margin: 0; font: 16px/24px sans-serif; }
  .behind { position: absolute; left: 0; width: 390px; height: 24px; background: #000000; }
  .sheet { position: fixed; left: 0; width: 390px; height: 120px; background: #ffffff; }
  p { margin: 0; }
</style></head><body>
  <div class="behind" style="top: 0"></div>
  <div class="behind" style="top: 200px"></div>
  <div class="sheet" style="top: 0"><p id="fail" style="color: #aaaaaa">First line of text<br>second line of text</p></div>
  <div class="sheet" style="top: 200px"><p id="pass" style="color: #333333">First line of text<br>second line of text</p></div>
</body></html>`);
  const selfCheck = await auditPage(page);
  const expected =
    selfCheck.length === 1 &&
    selfCheck[0]?.startsWith('contrast: #fail ') === true &&
    selfCheck[0].includes('needs 4.5:1');
  if (!expected) {
    failures.push(
      `[self-check] expected exactly one measured contrast finding on #fail, got: ${JSON.stringify(selfCheck)}`,
    );
  }
  await page.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(`screenshots in ${path.relative(root, outDir)}`);
if (failures.length > 0) {
  console.log('\nAudit findings:');
  for (const f of failures) {
    console.log(`  ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log('gallery audit: clean in dark and light');
}
