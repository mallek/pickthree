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
      // A decoration that hangs over an edge on purpose (a count badge on a button's corner) is
      // marked data-audit-overhang. Overflow that the marked overhang alone explains is not
      // clipping; anything wider than that still is.
      const marked = el.querySelectorAll('[data-audit-overhang]');
      if (marked.length > 0) {
        const padRight = el.getBoundingClientRect().right - parseFloat(cs.borderRightWidth);
        let hang = 0;
        for (const d of marked) {
          hang = Math.max(hang, d.getBoundingClientRect().right - padRight);
        }
        if (hang > 0 && el.scrollWidth - el.clientWidth <= Math.ceil(hang) + 1) {
          continue;
        }
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

    // axe leaves text undecided ("partially overlaps other elements") when the element stacks
    // under its lines differ anywhere, even BEHIND an opaque surface: a sheet's paragraph over a
    // page whose rows end halfway down it, or a paragraph straddling the bottom of body's
    // 100%-high box on a long page. A one-line element straddling that edge comes back as
    // "partially obscured" instead (body's box does not cover the line), and gets the same
    // treatment, body's background counting as the canvas it paints. Only the layers down to the
    // first opaque background paint behind the text, so when those match under every line, hold
    // flat colors only and cover every line, the contrast is computed here with axe's own color
    // math, against the same thresholds. Anything else (an image or gradient, opacity, a blend or
    // filter, a text shadow, stacks that really differ) stays unverified.
    const C = window.axe.commons.color;
    const D = window.axe.commons.dom;
    const contains = (outer, r) =>
      r.left >= outer.left - 0.5 &&
      r.right <= outer.right + 0.5 &&
      r.top >= outer.top - 0.5 &&
      r.bottom <= outer.bottom + 0.5;
    const measureBelowOpaque = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.opacity !== '1' || cs.mixBlendMode !== 'normal' || cs.filter !== 'none') {
          return null;
        }
      }
      const style = getComputedStyle(el);
      if (style.textShadow !== 'none') {
        return null;
      }
      const textRects = D.getVisibleChildTextRects(el);
      const stacks = D.getTextElementStack(el).map((s) => D.reduceToElementsBelowFloating(s, el));
      if (textRects.length === 0 || stacks.length === 0) {
        return null;
      }
      // With no background of its own on the root, body's background paints the whole canvas
      // (CSS 2, "The background"), not just body's box: a 100%-high body on a long page still
      // sits under text far below its own bottom edge.
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyPaintsCanvas =
        C.getOwnBackgroundColor(rootStyle).alpha === 0 && rootStyle.backgroundImage === 'none';
      const cutAtOpaque = (stack) => {
        const out = [];
        for (const e of stack) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage !== 'none') {
            return null;
          }
          const bg = C.getOwnBackgroundColor(cs);
          if (bg.alpha > 0 && !(e === document.body && bodyPaintsCanvas)) {
            const box = e.getBoundingClientRect();
            if (cs.display !== 'inline' && !textRects.every((r) => contains(box, r))) {
              return null;
            }
          }
          out.push(e);
          if (bg.alpha === 1) {
            return out;
          }
        }
        return null;
      };
      const layers = stacks.map(cutAtOpaque);
      const first = layers[0];
      if (
        !first ||
        first[0] !== el ||
        layers.some((l) => !l || l.length !== first.length || l.some((e, i) => e !== first[i]))
      ) {
        return null;
      }
      let bg = C.getOwnBackgroundColor(getComputedStyle(first[first.length - 1]));
      for (let i = first.length - 2; i >= 0; i--) {
        bg = C.flattenColors(C.getOwnBackgroundColor(getComputedStyle(first[i])), bg);
      }
      const fgRaw = new C.Color();
      fgRaw.parseString(style.color);
      const fg = fgRaw.alpha < 1 ? C.flattenColors(fgRaw, bg) : fgRaw;
      const px = parseFloat(style.fontSize);
      const pt = Math.ceil(px * 72) / 96;
      const bold = parseFloat(style.fontWeight) >= 700 || style.fontWeight === 'bold';
      const required = (bold && pt >= 14) || pt >= 18 ? 3 : 4.5;
      return { ratio: C.getContrast(bg, fg), required, fg: fg.toHexString(), bg: bg.toHexString() };
    };

    const unverified = [];
    const incomplete = res.incomplete.flatMap((v) => v.nodes);
    window.axe.setup(document);
    try {
      for (const n of incomplete) {
        const el = document.querySelector(n.target.join(' '));
        if (el && el.closest('[data-audit-contrast="static"]')) {
          continue;
        }
        const key = n.any[0] && n.any[0].data && n.any[0].data.messageKey;
        // Obscuring: the stacks under the lines differ. Obscured: a layer with a background under
        // the text does not cover all of it (body's box, on a long page). Both are re-measured.
        const measured =
          el && (key === 'elmPartiallyObscuring' || key === 'elmPartiallyObscured')
            ? measureBelowOpaque(el)
            : null;
        if (!measured) {
          unverified.push(`contrast unverified: ${n.target.join(' ')} ${message(n)}`);
        } else if (measured.ratio < measured.required) {
          failed.push(
            `contrast: ${n.target.join(' ')} ${measured.ratio.toFixed(2)}:1 (${measured.fg} on ${measured.bg}), needs ${measured.required}:1`,
          );
        }
      }
    } finally {
      window.axe.teardown();
    }
    return [...failed, ...unverified];
  });
  findings.push(...contrast);

  return findings;
}
