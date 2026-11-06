// Detect animation-generated line/word/character wrappers without treating
// ordinary styled spans or unrelated .line components as SplitText.
const TEXT_HOST = /^(H[1-6]|P|BLOCKQUOTE|FIGCAPTION)$/;
const SPLIT_WRAPPER = /(?:^|\\s)(?:line|word|char|chars|split-line|split-word|split-char|gsap-line|gsap-word|gsap-char)(?:\\s|$)/i;
const DATA_MARKER = /^(?:data-split|data-split-type|data-splittext|data-split-text)$/i;

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
  // Avoid hiding/editing links or controls as part of a text animation.
  if (el.querySelector('input, button, textarea, select, svg, canvas')) return false;
  return !!(el.textContent || '').trim();
}

export function getSplitTextHost(target: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target;
  for (let depth = 0; el && depth < 10; depth++, el = el.parentElement) {
    if (isSplitTextHost(el)) return el;
    if (el.tagName === 'BODY') break;
  }
  return null;
}

// Keep original spans, inline transforms and GSAP refs in the live DOM.
// Distribute new content across existing leaf text nodes, preserving each
// node's approximate original share. The agent edits original source text
// and GSAP can perform an exact responsive re-split on the next render.
export function previewSplitText(el: HTMLElement, text: string): boolean {
  if (!isSplitTextHost(el)) return false;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue !== null && node.nodeValue.length) nodes.push(node as Text);
  }
  if (!nodes.length) return false;
  const originalSizes = nodes.map(n => n.nodeValue?.length || 0);
  const total = originalSizes.reduce((a, b) => a + b, 0);
  let position = 0;
  let shareSoFar = 0;
  // Proportionate division, exact length preservation, no DOM replacement.
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
