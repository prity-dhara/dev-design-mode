// Detect animation-generated line/word/character wrappers without treating
// ordinary styled spans or unrelated .line components as SplitText.
const TEXT_HOST = /^(H[1-6]|P|BLOCKQUOTE|FIGCAPTION|DIV|SPAN)$/;
const SPLIT_WRAPPER = /(?:^|\s)(?:line|lines|word|words|char|chars|split-line|split-word|split-char|gsap-line|gsap-word|gsap-char)(?:\s|$)/i;
const DATA_MARKER = /^(?:data-split|data-split-type|data-splittext|data-split-text|data-char|data-word|data-line)$/i;

function looksLikeSplitWrapper(el: Element): boolean {
  return SPLIT_WRAPPER.test(el.getAttribute('class') || '') ||
    Array.from(el.attributes).some(attr => DATA_MARKER.test(attr.name));
}

export function isSplitTextHost(el: Element): boolean {
  if (!TEXT_HOST.test(el.tagName)) return false;
  const descendants = Array.from(el.querySelectorAll('*'));
  if (descendants.length < 2 || descendants.length > 600) return false;
  const wrappers = descendants.filter(looksLikeSplitWrapper);
  // Require multiple actual generated units: one incidental '.line' should
  // not make a complete normal heading behave as split text.
  if (wrappers.length < 2) return false;
  // Do not turn a container with independent headings/paragraphs or
  // interactive controls into one editable sentence. GSAP also splits
  // text-only divs and spans, not just semantic headings.
  if (el.querySelector('input, button, textarea, select, svg, canvas')) return false;
  if ((el.tagName === 'DIV' || el.tagName === 'SPAN') &&
    el.querySelector('h1, h2, h3, h4, h5, h6, p, blockquote, figcaption')) return false;
  return !!(el.textContent || '').trim();
}

export function getSplitTextHost(target: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target;
  let candidate: HTMLElement | null = null;
  for (let depth = 0; el && depth < 12; depth++, el = el.parentElement) {
    if (el.tagName === 'BODY') break;
    if (!isSplitTextHost(el)) continue;
    // Nested chars/words can themselves look like hosts. Prefer the actual
    // heading/paragraph; for GSAP applied to a text-only div, use its
    // outermost split container so the whole sentence is editable.
    if (/^(H[1-6]|P|BLOCKQUOTE|FIGCAPTION)$/.test(el.tagName)) return el;
    candidate = el;
  }
  return candidate;
}

// Snapshot/recover text nodes without replacing GSAP-owned DOM elements.
export function splitTextNodes(el: HTMLElement): Text[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  return nodes;
}

export function captureSplitTextSegments(el: HTMLElement): string[] {
  return splitTextNodes(el).map(node => node.nodeValue || '');
}

export function restoreSplitTextSegments(el: HTMLElement, segments: string[]): boolean {
  const nodes = splitTextNodes(el);
  if (nodes.length !== segments.length) return false;
  nodes.forEach((node, index) => { node.nodeValue = segments[index]; });
  return true;
}

// Keep original spans, inline transforms and GSAP refs in the live DOM.
// Redistribute new content across existing leaf text nodes for a best-effort
// on-page preview. Accurate line breaks require the site's own re-split.
export function previewSplitText(el: HTMLElement, text: string): boolean {
  if (!isSplitTextHost(el)) return false;
  const nodes = splitTextNodes(el).filter(node => node.nodeValue !== null);
  if (!nodes.length) return false;
  const originalSizes = nodes.map(node => node.nodeValue?.length || 0);
  const total = originalSizes.reduce((a, b) => a + b, 0);
  if (!total) return false;
  let position = 0;
  let shareSoFar = 0;
  for (let i = 0; i < nodes.length; i++) {
    shareSoFar += originalSizes[i];
    const end = i === nodes.length - 1
      ? text.length
      : Math.max(position, Math.round(text.length * shareSoFar / total));
    nodes[i].nodeValue = text.slice(position, end);
    position = end;
  }
  return true;
}
