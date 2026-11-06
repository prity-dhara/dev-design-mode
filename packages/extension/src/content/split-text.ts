// Treat animation-generated SplitText spans as one editable source element.
// Do not use class names alone: .line/.word are common layout classes.
const splitClasses = /^(?:line|lines|word|words|char|chars)$/;
const rememberedRoots = new WeakSet<HTMLElement>();
function splitPart(el: HTMLElement): boolean {
  return Array.from(el.classList).some(name => splitClasses.test(name)) ||
    el.hasAttribute('data-split-line') || el.hasAttribute('data-split-word') ||
    el.hasAttribute('data-split-char');
}
export function isSplitTextRoot(el: HTMLElement): boolean {
  if (rememberedRoots.has(el)) return true;
  const parts = Array.from(el.querySelectorAll<HTMLElement>('*')).filter(splitPart);
  if (!parts.length) return false;
  const hasWordsOrChars = parts.filter(p => Array.from(p.classList).some(c => /^(?:word|words|char|chars)$/.test(c))).length >= 2;
  const lines = parts.filter(p => Array.from(p.classList).some(c => /^(?:line|lines)$/.test(c)) || p.hasAttribute('data-split-line'));
  const likelyGsap = !!el.getAttribute('aria-label') && parts.some(p => p.getAttribute('aria-hidden') === 'true');
  const recognized = hasWordsOrChars || lines.length >= 2 || likelyGsap;
  if (recognized) rememberedRoots.add(el);
  return recognized;
}
export function splitTextRoot(target: HTMLElement): HTMLElement | null {
  // Climb from the generated inner word/line/character to the original text host.
  let current: HTMLElement | null = target;
  while (current && splitPart(current)) current = current.parentElement;
  if (!current) return null;
  // Nested line > word > char can leave a non-split wrapper. Prefer the
  // nearest qualifying heading/text host; never jump to a whole section.
  const allowed = new Set(['H1','H2','H3','H4','H5','H6','P','SPAN','A','BLOCKQUOTE','LABEL','DIV']);
  for (let el: HTMLElement | null = current, depth = 0; el && depth < 4; el = el.parentElement, depth++) {
    if (allowed.has(el.tagName) && isSplitTextRoot(el)) return el;
    if (['SECTION','ARTICLE','MAIN','BODY'].includes(el.tagName)) break;
  }
  return null;
}
export function splitTextValue(el: HTMLElement): string {
  // GSAP SplitText uses aria-label to retain the unsplit accessible string.
  const label = el.getAttribute('aria-label');
  if (label && el.querySelector('[aria-hidden="true"]')) return label;
  const lines = Array.from(el.children).filter(child => child instanceof HTMLElement && splitPart(child as HTMLElement));
  if (lines.length > 1 && lines.every(line => Array.from((line as HTMLElement).classList).some(c => /^(?:line|lines)$/.test(c))))
    return lines.map(line => (line.textContent || '').trim()).join(' ');
  return el.textContent || '';
}
