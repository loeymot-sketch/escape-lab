import type { Page } from '@playwright/test';

export type Audit = { smallControls: string[]; smallText: string[] };

/**
 * DOM audit of the page as rendered right now.
 * - Controls: every visible interactive control must be at least `minControl` px in both dimensions. A checkbox or radio is measured
 *   through its label (that is what a finger hits); inline links inside a paragraph (class `inline`) are exempt.
 * - Text: no visible text may render below `minText` px.
 */
export async function auditPage(page: Page, { minControl = 40, minText = 11 }: { minControl?: number; minText?: number } = {}): Promise<Audit> {
  return page.evaluate(({ minControl, minText }) => {
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${(el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32)}"`;
    const smallControls: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
      if (!visible(el) || el.closest('.sr-only') || el.classList.contains('inline') || el.classList.contains('sr-only')) continue;
      let target: Element = el;
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) target = el.closest('label') ?? el;
      const r = target.getBoundingClientRect();
      if (r.width < minControl - 0.5 || r.height < minControl - 0.5) smallControls.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const smallText: string[] = [];
    const seenParents = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest('script, style, noscript, svg, .sr-only')) continue;
      if (!visible(parent) || seenParents.has(parent)) continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      if (size < minText - 0.01) { seenParents.add(parent); smallText.push(`${text.slice(0, 30)} (${size}px in ${describe(parent)})`); }
    }
    return { smallControls: [...new Set(smallControls)], smallText: [...new Set(smallText)] };
  }, { minControl, minText });
}
