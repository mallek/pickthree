/**
 * The automated half of the page audit (docs/superpowers/specs/2026-09-24-design-foundation-design.md,
 * section 5): sideways overflow, text cut off inside an element, touch targets under 44px, text
 * contrast (axe-core, including the nodes axe could not decide), em dashes and an unaccented
 * "Pokemon". Drives a puppeteer page that is already on the screen to check.
 * axe-core is injected into the page for the check only; it never ships in either app.
 */
/* global document, window, getComputedStyle, HTMLElement, SVGElement, DOMRect, NodeFilter */
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

/**
 * `report`, when given, takes what the audit could not measure because it was not on screen:
 * `report.unmeasured` gets { selector, key, text } for text scrolled wholly out of its scroll
 * container, and `report.measured` gets the key of every element whose contrast was decided, so a
 * caller can say whether hidden text was measured in another capture of the same page. The key
 * names the element, not just its words: its DOM path (tag and child position at each step) up to
 * the nearest ancestor with a stable id, or to body, plus its text. Two elements never share a
 * key, and the same element keeps its key across captures of one page as long as the tree above it
 * holds still; when that tree changes, the key changes and the text counts as unmeasured, which
 * fails closed. Without a report, hidden text stays a failing "contrast unverified" finding, as it
 * always was.
 */
export async function auditPage(page, report) {
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
      // A decoration that hangs over an edge on purpose (a count badge on a button's corner, the
      // Mega pill wider than a small token) is marked data-audit-overhang. Its own box is its parent
      // (the button, the token). Overflow that the mark's hang past its own box explains is not
      // clipping; anything wider than that still is, including an own box that itself overflows.
      const marked = el.querySelectorAll('[data-audit-overhang]');
      if (marked.length > 0) {
        const padRight = el.getBoundingClientRect().right - parseFloat(cs.borderRightWidth);
        let hang = 0;
        for (const d of marked) {
          const right = d.getBoundingClientRect().right;
          const own = d.parentElement ? d.parentElement.getBoundingClientRect().right : right;
          hang = Math.max(hang, Math.min(right - padRight, right - own));
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

  // The overhang mark excuses the hang, never what it lands on: a marked decoration over text
  // outside its own box (the Mega pill on a token's name) hides that text. Text under something
  // else at that spot (a sticky header over both) is left out; off screen there is nothing to ask,
  // so it counts.
  const overhangs = await page.evaluate(() => {
    const out = [];
    const marked = [...document.querySelectorAll('[data-audit-overhang]')].filter((d) => {
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    });
    if (marked.length === 0) {
      return out;
    }
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || n.textContent.trim() === '' || parent.closest('.vh')) {
        continue;
      }
      if (getComputedStyle(parent).visibility === 'hidden') {
        continue;
      }
      texts.push(n);
    }
    for (const d of marked) {
      const box = d.getBoundingClientRect();
      const own = d.parentElement ?? d;
      for (const t of texts) {
        if (own.contains(t)) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(t);
        const hit = [...range.getClientRects()].find((r) => {
          const left = Math.max(r.left, box.left);
          const right = Math.min(r.right, box.right);
          const top = Math.max(r.top, box.top);
          const bottom = Math.min(r.bottom, box.bottom);
          if (right - left <= 0.5 || bottom - top <= 0.5) {
            return false;
          }
          const x = (left + right) / 2;
          const y = (top + bottom) / 2;
          const inView = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
          // The first thing at that spot other than the decoration itself, so a decoration that
          // takes pointer events (a count badge) is checked the same as one that does not.
          const at = inView
            ? (document.elementsFromPoint(x, y).find((e) => e !== d && !d.contains(e)) ?? null)
            : null;
          return (
            !inView ||
            (at !== null && (t.parentElement.contains(at) || at.contains(t.parentElement)))
          );
        });
        if (hit) {
          const mark = (d.textContent ?? '').trim().slice(0, 20) || d.className;
          const text = (t.textContent ?? '').trim().slice(0, 40);
          out.push(`overlap: the marked overhang "${mark}" lies over "${text}"`);
        }
      }
    }
    return out;
  });
  findings.push(...overhangs);

  const small = await page.evaluate(() => {
    const out = [];
    const sel =
      'button, a[href], select, input:not([type="hidden"]), textarea, summary, [role="button"], [role="radio"], [role="tab"], [role="switch"], [role="checkbox"]';
    for (const el of document.querySelectorAll(sel)) {
      if (
        el.closest('[data-inline-control], [data-audit-exempt]') ||
        el.hasAttribute('data-inline-control')
      ) {
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
      if (
        (r.width <= 1 && r.height <= 1) ||
        (cs.clipPath !== 'none' && cs.clipPath !== '') ||
        cs.clip.startsWith('rect')
      ) {
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
        const name = (el.getAttribute('aria-label') || el.textContent || el.tagName)
          .trim()
          .slice(0, 40);
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
    // What of an element's text is on screen.
    const onScreen = (el) => {
      // axe clips text to overflow: hidden ancestors only, so a line cut by a scroll container (the
      // last lines of a sheet page that scrolls, running past the sheet's bottom edge) keeps its
      // whole box, and no opaque layer inside the container "covers" it. Only the part inside
      // every scrolling ancestor is on screen, so that part is what gets compared, and a line
      // scrolled wholly out of sight is left out. Each axis clips only where that axis overflows
      // (.app clips x alone), and the walk stops at a fixed element: its containing block is the
      // viewport, so nothing above it clips it. Body and the root are not clips (a long page's own
      // scroll is what full-page shots capture). Text scrolled wholly out of its container is not
      // on screen, so it is handed back as hidden: unmeasured, never silently passed.
      // An element that is itself fixed is placed against the viewport, so no ancestor clips it.
      // Not handled: an absolutely positioned descendant whose containing block sits above an
      // overflow ancestor escapes that ancestor's clip, but is still clipped by it here. That errs
      // toward measuring less of it (or listing it as not on screen), never toward measuring text
      // that is off screen. The same walk is asked of every node axe passes (below), since axe's
      // clip to overflow: hidden alone passes text scrolled out of an overflow: auto box.
      const clips = [];
      const selfFixed = getComputedStyle(el).position === 'fixed';
      for (
        let a = selfFixed ? null : el.parentElement;
        a && a !== document.body;
        a = a.parentElement
      ) {
        const acs = getComputedStyle(a);
        const x = acs.overflowX !== 'visible';
        const y = acs.overflowY !== 'visible';
        if (x || y) {
          const b = a.getBoundingClientRect();
          clips.push({
            left: x ? b.left : -Infinity,
            right: x ? b.right : Infinity,
            top: y ? b.top : -Infinity,
            bottom: y ? b.bottom : Infinity,
          });
        }
        if (acs.position === 'fixed') {
          break;
        }
      }
      const wholeRects = D.getVisibleChildTextRects(el);
      const shownRects = wholeRects.flatMap((r) => {
        let { left, top, right, bottom } = r;
        for (const c of clips) {
          left = Math.max(left, c.left);
          top = Math.max(top, c.top);
          right = Math.min(right, c.right);
          bottom = Math.min(bottom, c.bottom);
        }
        return right - left >= 1 && bottom - top >= 1
          ? [new DOMRect(left, top, right - left, bottom - top)]
          : [];
      });
      const hidden = clips.length > 0 && wholeRects.length > 0 && shownRects.length === 0;
      return { clips, wholeRects, shownRects, hidden };
    };
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
      const { clips, wholeRects, shownRects, hidden } = onScreen(el);
      if (hidden) {
        return { hidden: true };
      }
      const textRects = clips.length > 0 ? shownRects : wholeRects;
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
      // The layers that paint behind one line: every element with a background, down to the first
      // opaque one. Transparent elements paint nothing, so they are left out of the comparison: a
      // line past the bottom of body's 100%-high box has body and a 100%-high wrapper missing
      // from its stack, while the canvas body paints is still what sits behind it. A stack that
      // runs out with no opaque layer gets that canvas.
      const bodyBg = C.getOwnBackgroundColor(getComputedStyle(document.body));
      const GRAPHIC = new Set(['IMG', 'CANVAS', 'VIDEO', 'OBJECT', 'IFRAME', 'EMBED', 'PICTURE']);
      const cutAtOpaque = (stack) => {
        const out = [];
        for (const e of stack) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage !== 'none') {
            return null;
          }
          // A graphic paints with no background color, so the skip below would lose it; text
          // over an image, an svg or a canvas stays unverified.
          if (e instanceof SVGElement || GRAPHIC.has(e.tagName)) {
            return null;
          }
          const bg = C.getOwnBackgroundColor(cs);
          if (bg.alpha === 0) {
            continue;
          }
          if (!(e === document.body && bodyPaintsCanvas)) {
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
        if (bodyPaintsCanvas && bodyBg.alpha === 1 && !out.includes(document.body)) {
          out.push(document.body);
          return out;
        }
        return null;
      };
      if (stacks.some((s) => s[0] !== el)) {
        return null;
      }
      const layers = stacks.map(cutAtOpaque);
      const first = layers[0];
      if (
        !first ||
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

    const textOf = (e) => (e ? (e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) : '');
    // React's useId ids (":r1:", or the same between guillemets) change on a remount, so they are
    // not anchors.
    const anchorId = (e) => (e.id && !/[:\u00ab\u00bb]/.test(e.id) ? e.id : null);
    const keyOf = (e) => {
      if (!e) {
        return '';
      }
      const steps = [];
      let n = e;
      for (; n && n !== document.body; n = n.parentElement) {
        const id = anchorId(n);
        if (id) {
          steps.unshift(`#${id}`);
          break;
        }
        const i = n.parentElement
          ? Array.prototype.indexOf.call(n.parentElement.children, n) + 1
          : 0;
        steps.unshift(`${n.tagName.toLowerCase()}:nth-child(${i})`);
      }
      if (n === document.body) {
        steps.unshift('body');
      }
      return `${steps.join(' > ')}\n${textOf(e)}`;
    };
    const measuredKeys = [];
    const hidden = [];
    const unverified = [];
    const incomplete = res.incomplete.flatMap((v) => v.nodes);
    window.axe.setup(document);
    try {
      // axe clips text to overflow: hidden only, so it passes text scrolled wholly out of an
      // overflow: auto box against the box's background. Such a pass is not on screen: it is
      // handed back as hidden, like an undecided node out of sight, never counted as measured.
      for (const n of res.passes.flatMap((v) => v.nodes)) {
        const el = document.querySelector(n.target.join(' '));
        if (el && el.closest('[data-audit-contrast="static"]')) {
          continue;
        }
        if (el && onScreen(el).hidden) {
          hidden.push({ selector: n.target.join(' '), key: keyOf(el), text: textOf(el) });
          continue;
        }
        measuredKeys.push(keyOf(el));
      }
      // A violation stays a failing finding wherever it is; it counts as measured only on screen.
      for (const n of res.violations.flatMap((v) => v.nodes)) {
        const el = document.querySelector(n.target.join(' '));
        if (!(el && onScreen(el).hidden)) {
          measuredKeys.push(keyOf(el));
        }
      }
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
        if (measured?.hidden) {
          hidden.push({ selector: n.target.join(' '), key: keyOf(el), text: textOf(el) });
          continue;
        }
        if (measured) {
          measuredKeys.push(keyOf(el));
        }
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
    return { findings: [...failed, ...unverified], hidden, measured: measuredKeys };
  });
  findings.push(...contrast.findings);
  if (report) {
    report.unmeasured.push(...contrast.hidden);
    report.measured.push(...contrast.measured);
  } else {
    findings.push(
      ...contrast.hidden.map(
        (h) => `contrast unverified: ${h.selector} is scrolled out of its container, not on screen`,
      ),
    );
  }

  return findings;
}
