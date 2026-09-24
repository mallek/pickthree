/**
 * The automated half of the page audit (docs/superpowers/specs/2026-09-24-design-foundation-design.md,
 * section 5): sideways overflow, text cut off inside an element, touch targets under 44px, text
 * contrast (axe-core, including the nodes axe could not decide), em dashes and an unaccented
 * "Pokemon". Drives a puppeteer page that is already on the screen to check.
 * axe-core is injected into the page for the check only; it never ships in either app.
 */
/* global document, window, getComputedStyle, HTMLElement */
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

  // Clipping: the page-level check misses content that runs past its own box inside the page
  // (a league row whose last segment slides under the overflow button). Any visible element whose
  // content is wider than its box, while its box does not scroll, is cutting something off.
  // Elements that ellipsize on purpose, and the visually hidden .vh text, are skipped.
  const clipped = await page.evaluate(() => {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement) || el.closest('.vh')) {
        continue;
      }
      if (el.scrollWidth - el.clientWidth <= 1 || el.clientWidth === 0) {
        continue;
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        continue;
      }
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.textOverflow === 'ellipsis') {
        continue;
      }
      if (el.textContent.trim() === '') {
        continue;
      }
      const name = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
      out.push(`clipped: ${name} content is ${el.scrollWidth}px in a ${el.clientWidth}px box`);
    }
    return out;
  });
  findings.push(...clipped);

  const small = await page.evaluate(() => {
    const out = [];
    const sel =
      'button, a[href], select, input:not([type="hidden"]), textarea, summary, [role="button"], [role="radio"], [role="tab"], [role="switch"], [role="checkbox"]';
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
      // Visually hidden (a .vh input behind a styled label, 1 by 1 or clipped away): the target a
      // finger meets is whatever stands in for it, not this element.
      if ((r.width <= 1 && r.height <= 1) || (cs.clipPath !== 'none' && cs.clipPath !== '') || cs.clip.startsWith('rect')) {
        continue;
      }
      // An input inside a label: tapping anywhere on the label hits it, so the label is the target.
      const label = el.tagName === 'INPUT' ? el.closest('label') : null;
      if (label) {
        const lr = label.getBoundingClientRect();
        if (lr.width >= 44 && lr.height >= 44) {
          continue;
        }
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
  if (text.includes('\u2014')) {
    findings.push('copy: an em dash is on screen');
  }
  if (/\bPokemon\b/.test(text)) {
    findings.push('copy: "Pokemon" without the accent is on screen');
  }

  if (!(await page.evaluate(() => 'axe' in window))) {
    await page.addScriptTag({ path: AXE });
  }
  // axe returns the nodes it could not decide (text over a gradient or an image) as incomplete;
  // those are not passes, so they are findings until something else verifies them. An element
  // marked data-audit-contrast="static" is verified by a unit test instead (the primary button's
  // gradient: packages/ui/test/contrast.test.ts), so it is left out of the incomplete report.
  const contrast = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
    const message = (n) => (n.any[0] && n.any[0].message) || '';
    const failed = res.violations.flatMap((v) =>
      v.nodes.map((n) => `contrast: ${n.target.join(' ')} ${message(n)}`),
    );
    const unverified = res.incomplete.flatMap((v) =>
      v.nodes
        .filter((n) => {
          const el = document.querySelector(n.target.join(' '));
          return !(el && el.closest('[data-audit-contrast="static"]'));
        })
        .map((n) => `contrast unverified: ${n.target.join(' ')} ${message(n)}`),
    );
    return [...failed, ...unverified];
  });
  findings.push(...contrast);

  return findings;
}
