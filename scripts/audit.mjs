/**
 * The automated half of the page audit (docs/superpowers/specs/2026-09-24-design-foundation-design.md,
 * section 5): sideways overflow, touch targets under 44px, text contrast (axe-core), em dashes
 * and an unaccented "Pokemon". Drives a puppeteer page that is already on the screen to check.
 * axe-core is injected into the page for the check only; it never ships in either app.
 */
/* global document, window, getComputedStyle */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

/** Call once per page, before the first goto: the apps' CSP would block the injected axe. */
export async function prepareAudit(page) {
  await page.setBypassCSP(true);
}

/** Runs `fn` with the page in dark, then light, by setting data-theme in place (no reload, so an
 * open sheet or an expanded row stays as it is), then restores the page's own attribute. */
export async function forEachTheme(page, fn) {
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await new Promise((r) => setTimeout(r, 150));
    await fn(theme);
  }
  await page.evaluate((b) => {
    if (b === null) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', b);
    }
  }, before);
}

export async function auditPage(page) {
  const findings = [];

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) {
    findings.push(`overflow: page is ${overflow}px wider than the viewport`);
  }

  const small = await page.evaluate(() => {
    const out = [];
    const sel =
      'button, a[href], select, input:not([type="hidden"]), textarea, [role="button"], [role="radio"], [role="tab"]';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[data-inline-control], [data-audit-exempt]') || el.hasAttribute('data-inline-control')) {
        continue;
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'inline') {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        continue;
      }
      if (r.width < 44 || r.height < 44) {
        const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);
        out.push(`tap target: "${name}" is ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  findings.push(...small);

  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes('—')) {
    findings.push('copy: an em dash is on screen');
  }
  if (/\bPokemon\b/.test(text)) {
    findings.push('copy: "Pokemon" without the accent is on screen');
  }

  if (!(await page.evaluate(() => 'axe' in window))) {
    await page.addScriptTag({ path: AXE });
  }
  const contrast = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
    return res.violations.flatMap((v) =>
      v.nodes.map((n) => `contrast: ${n.target.join(' ')} ${(n.any[0] && n.any[0].message) || ''}`),
    );
  });
  findings.push(...contrast);

  return findings;
}
