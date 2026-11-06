// GSAP SplitText and common custom Webflow SplitText wrapper names.
// A single ".line" or ".word" class is not sufficient evidence of splitting.
const wordClass = /^(?:word|words|gsap[_-]split[_-]word)$/i;
const lineClass = /^(?:line|lines|gsap[_-]split[_-]line)$/i;
const partClass = /^(?:line|lines|word|words|char|chars|gsap[_-]split[_-](?:line|word|char)(?:[_-]mask)?)$/i;
const rememberedRoots = new WeakSet<HTMLElement>();

function splitPart(el: HTMLElement): boolean {
  return Array.from(el.classList).some(name => partClass.test(name)) ||
    el.hasAttribute('data-split-line') || el.hasAttribute('data-split-word') ||
    el.hasAttribute('data-split-char');
}
function matchesClass(el: HTMLElement, pattern: RegExp): boolean {
  return Array.from(el.classList).some(name => pattern.test(name));
}
function hasSplitPart(el: HTMLElement): boolean {
  return splitPart(el) || !!el.querySelector('[data-split-line],[data-split-word],[data-split-char],.line,.lines,.word,.words,.char,.chars,.gsap_split_line,.gsap_split_word,.gsap_split_word-mask,.gsap_split_line-mask,.gsap-split-word,.gsap-split-word-mask');
}
function directGroups(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && hasSplitPart(child));
}
export function isSplitTextRoot(el: HTMLElement): boolean {
  if (splitPart(el)) return false; // The generated wrapper itself is never the editable host.
  if (rememberedRoots.has(el)) return true; // Remember the source after preview is flattened.
  const children = Array.from(el.children) as HTMLElement[];
  if (!children.length) return false;
  const groups = directGroups(el);
  // Only select the *closest text host*. Do not collapse an entire section
  // containing multiple separate animated headings or unrelated content.
  if (groups.length < 1 || groups.length !== children.length) return false;
  const parts = groups.flatMap(group => [group, ...Array.from(group.querySelectorAll<HTMLElement>('*'))]);
  const words = parts.filter(p => matchesClass(p, wordClass) || p.hasAttribute('data-split-word'));
  const lines = parts.filter(p => matchesClass(p, lineClass) || p.hasAttribute('data-split-line'));
  const gsap = parts.filter(p => Array.from(p.classList).some(c => /^gsap[_-]split[_-]/i.test(c)));
  const recognized = words.length >= 2 || lines.length >= 2 ||
    (gsap.length >= 2 && groups.length >= 2) ||
    (!!el.getAttribute('aria-label') && parts.some(p => p.getAttribute('aria-hidden') === 'true'));
  if (recognized) rememberedRoots.add(el);
  return recognized;
}

export function splitTextRoot(target: HTMLElement): HTMLElement | null {
  // Traverse original Webflow/GSAP wrappers (e.g. word-mask > word) to the
  // nearest actual text host, not the encompassing layout container.
  let el: HTMLElement | null = target;
  for (let depth = 0; el && depth < 10; el = el.parentElement, depth++) {
    if (isSplitTextRoot(el)) return el;
    if (['SECTION', 'ARTICLE', 'MAIN', 'BODY', 'HTML'].includes(el.tagName)) break;
  }
  return null;
}

export function splitTextValue(el: HTMLElement): string {
  const label = el.getAttribute('aria-label');
  if (label && el.querySelector('[aria-hidden="true"]')) return label;
  // Some custom Webflow splitters strip the spaces and use margins between
  // generated word spans; textContent would then produce concatenated words.
  const source = el.textContent || '';
  if (/\s/.test(source)) return source;
  const words = Array.from(el.querySelectorAll<HTMLElement>('*'))
    .filter(p => matchesClass(p, wordClass) || p.hasAttribute('data-split-word'));
  if (words.length >= 2) return words.map(word => word.textContent?.trim() || '').join(' ');
  return source;
}

// Temporary visual cleanup while Design Mode is open. Preserve the exact
// original child nodes so closing Design Mode can restore GSAP's references.
// A user-edited heading is intentionally left as plain text; reloading the
// published page lets Webflow/GSAP split the updated source again.
type SplitSnapshot = {
  nodes: Node[];
  originalText: string;
  previewNode: Text;
  ariaLabel: string | null;
};
const splitSnapshots = new Map<HTMLElement, SplitSnapshot>();

export function flattenAnimatedText(root: ParentNode = document): number {
  let count = 0;
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,span,a,blockquote,label,div'));
  for (const el of candidates) {
    // Skip nested split wrappers; only the original editable host is flattened.
    if (!el.isConnected || splitSnapshots.has(el) || !isSplitTextRoot(el)) continue;
    if (splitTextRoot(el) && splitTextRoot(el) !== el) continue;
    const text = splitTextValue(el);
    if (!text.trim() || !el.children.length) continue;
    const nodes = Array.from(el.childNodes);
    const previewNode = document.createTextNode(text);
    const ariaLabel = el.getAttribute('aria-label');
    el.replaceChildren(previewNode);
    // The accessible original label would otherwise remain stale after editing.
    if (ariaLabel !== null) el.removeAttribute('aria-label');
    splitSnapshots.set(el, { nodes, originalText: text, previewNode, ariaLabel });
    count++;
  }
  return count;
}

export function restoreAnimatedText(): void {
  for (const [el, snapshot] of splitSnapshots) {
    if (!el.isConnected) continue;
    // Only restore an untouched preview. Never undo a text edit made by user.
    if (el.childNodes.length !== 1 ||
        el.firstChild !== snapshot.previewNode ||
        snapshot.previewNode.textContent !== snapshot.originalText) continue;
    el.replaceChildren(...snapshot.nodes);
    if (snapshot.ariaLabel !== null) el.setAttribute('aria-label', snapshot.ariaLabel);
  }
  splitSnapshots.clear();
}
