#!/usr/bin/env node
/**
 * Builds the component gallery, serves it, and audits it in dark and light at 390px. Writes
 * packages/ui/screenshots/gallery-<theme>.png (gitignored) and exits 1 on any finding or console
 * error.
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
