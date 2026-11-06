// Detect animation-generated line/word/character wrappers without treating
// ordinary styled spans or unrelated .line components as SplitText.
const TEXT_HOST = /^(H[1-6]|P|BLOCKQUOTE|FIGCAPTION|DIV|SPAN)$/;
const SPLIT_WRAPPER = /(?:^|\s)(?:line|lines|word|words|char|chars|split-line|split-word|split-char|gsap-line|gsap-word|gsap-char|gsap_split_(?:line|word|char)(?:-mask)?)(?:\s|$)/i;
const DATA_MARKER = /^(?:data-split|data-split-type|data-splittext|data-split-text|data-char|data-word|data-line)$/i;

function looksLikeSplitWrapper(el: Element): boolean {
  return SPLIT_WRAPPER.test(el.getAttribute('class') || '') ||
    Array.from(el.attributes).some(attr => DATA_MARKER.test(attr.name));
}

// Some GSAP and custom splitters generate plain <span> / <div> elements
// without .word/.char/.line classes. Only infer a split when a text-only
// host contains multiple small text fragments and transform/animation hints
// (or a dense set of text fragments), rather than treating any styled span
// as an editable animated heading.
function looksLikeUnmarkedSplit(el: Element, descendants: Element[]): boolean {
  const units = descendants.filter(node =>
    (node.tagName === 'SPAN' || node.tagName === 'DIV') &&
    !node.querySelector('span, div, p, h1, h2, h3, h4, h5, h6, a, button, input')
  );
  if (units.length < 3) return false;
  // A container with normal paragraph content and a badge/tag row is not
  // split text, even when several small spans resemble word fragments.
  if (el.tagName === 'DIV' && el.querySelector('div:not([class*="split"]):not([class*="word"]):not([class*="char"])')) return false;
  const hostText = (el.textContent || '').trim();
  if (!hostText || hostText.length < 8) return false;
  const fragments = units.filter(node => (node.textContent || '').trim()).length;
  if (fragments < 3) return false;
  // Ordinary rich text and content sections with links are not SplitText.
  if (el.querySelector('a, strong, em, b, i, ul, ol, [contenteditable="true"]')) return false;
  const length = units.reduce((sum, node) => sum + (node.textContent || '').trim().length, 0);
  if (length < hostText.replace(/\s/g, '').length * 0.65) return false;
  const animated = units.some(node =>
    /(?:transform|translate|will-change|animation|opacity)/i.test(node.getAttribute('style') || '') ||
    /(?:split|stagger|reveal|animated|animate)/i.test(node.getAttribute('class') || '')
  ) || /(?:split|stagger|reveal)/i.test(el.getAttribute('class') || '');
  const words = hostText.split(/\s+/).filter(Boolean).length;
  // A dense collection of plain spans can also be pills, statistics or
  // labels. Require real animation evidence for div/span hosts; keep the
  // density fallback for actual semantic text elements (P/headings).
  return animated || (/^(H[1-6]|P|BLOCKQUOTE|FIGCAPTION)$/.test(el.tagName) &&
    units.length >= 5 && words >= 4 && units.length >= words - 1);
}

export function isSplitTextHost(el: Element): boolean {
  if (!TEXT_HOST.test(el.tagName)) return false;
  const descendants = Array.from(el.querySelectorAll('*'));
  if (descendants.length < 2 || descendants.length > 600) return false;
  const wrappers = descendants.filter(looksLikeSplitWrapper);
  // Require multiple actual generated units: one incidental '.line' should
  // not make a complete normal heading behave as split text.
  if (wrappers.length < 2 && !looksLikeUnmarkedSplit(el, descendants)) return false;
  // Never promote a compound UI block into an editable SplitText host.
  // Only animation-wrapper divs may nest beneath a div-based text host.
  if (el.tagName === 'DIV' && descendants.some(node =>
    node.tagName === 'DIV' && !looksLikeSplitWrapper(node))) return false;
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

// Ordinary paragraphs often contain inline spans (for emphasis, CMS styling,
// or animation wrappers). In inspect mode a click on one of those spans
// should select the paragraph as a single editable text element. This is
// separate from SplitText: normal paragraphs retain their rich-text editor.
export function getParagraphTextHost(target: HTMLElement): HTMLElement | null {
  const tag = target.tagName;
  if (tag === 'A' || tag === 'BUTTON' || target.closest('a, button, [contenteditable="true"]')) return null;
  let current: HTMLElement | null = target.parentElement;
  while (current && current.tagName !== 'BODY') {
    if (current.tagName === 'P' || current.tagName === 'BLOCKQUOTE' || current.tagName === 'FIGCAPTION') {
      return current.querySelector('button, input, textarea, select, svg, canvas') ? null : current;
    }
    // A text-only Webflow text block can be a DIV rather than <p>.
    // Require a known typography class and no separate block children.
    const classes = typeof current.className === 'string' ? current.className : '';
    if (current.tagName === 'DIV' && /(?:^|\s)(?:text-size-[\w-]+|text-block)(?:\s|$)/.test(classes) &&
      !current.querySelector('h1, h2, h3, h4, h5, h6, p, section, article, ul, ol, a, button, input, textarea, select, svg, canvas')) {
      return current;
    }
    if (/^(SECTION|ARTICLE|MAIN|NAV|HEADER|FOOTER)$/.test(current.tagName)) break;
    current = current.parentElement;
  }
  return null;
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

// Preserve GSAP-generated spans/line masks and their animation references.
// Distribute text at whitespace boundaries rather than splitting in the
// middle of words. This is a staging preview, not a GSAP re-split: the site's
// own animation should rebuild responsive line wrappers after source edits.
export function previewSplitText(el: HTMLElement, text: string): boolean {
  if (!isSplitTextHost(el)) return false;
  const nodes = splitTextNodes(el).filter(node => node.nodeValue !== null);
  if (!nodes.length) return false;
  const sizes = nodes.map(node => (node.nodeValue || '').length);
  const total = sizes.reduce((a, b) => a + b, 0);
  if (!total) return false;

  // Determine safe cut locations after whitespace. If text contains no
  // whitespace, keep it as one fragment instead of breaking its characters.
  const cuts: number[] = [0];
  for (const match of text.matchAll(/\s+/g)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end > cuts[cuts.length - 1]) cuts.push(end);
  }
  if (cuts[cuts.length - 1] !== text.length) cuts.push(text.length);

  let offset = 0;
  let cumulative = 0;
  for (let i = 0; i < nodes.length; i++) {
    cumulative += sizes[i];
    if (i === nodes.length - 1) {
      nodes[i].nodeValue = text.slice(offset);
      break;
    }
    const desired = Math.round(text.length * cumulative / total);
    let end = offset;
    let distance = Infinity;
    for (const cut of cuts) {
      if (cut < offset) continue;
      const diff = Math.abs(cut - desired);
      if (diff < distance) { distance = diff; end = cut; }
      if (cut > desired && diff > distance) break;
    }
    nodes[i].nodeValue = text.slice(offset, end);
    offset = end;
  }
  return true;
}
