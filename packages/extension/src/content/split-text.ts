// Unwrap runtime GSAP SplitText markup in the Design Mode *preview*.
// The original HTML host and its Webflow classes stay intact. This does not
// modify the site's source code or remove the GSAP library.
const generatedClass = /^(?:gsap[_-]split[_-][\\w-]+|(?:line|lines|word|words|char|chars))$/i;
const wordClass = /^(?:word|words|gsap[_-]split[_-]word)$/i;
const generatedAttribute = ['data-split-line', 'data-split-word', 'data-split-char'];
const rememberedRoots = new WeakSet<HTMLElement>();

export function isGeneratedSplitWrapper(el: HTMLElement): boolean {
  return Array.from(el.classList || []).some(name => generatedClass.test(name)) ||
    generatedAttribute.some(name => el.hasAttribute(name));
}

function isWord(el: HTMLElement): boolean {
  return Array.from(el.classList || []).some(name => wordClass.test(name)) ||
    el.hasAttribute('data-split-word');
}
function descendants(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('*'));
}
function generatedChildren(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(c => isGeneratedSplitWrapper(c as HTMLElement)) as HTMLElement[];
}
function splitEvidence(el: HTMLElement): boolean {
  const direct = generatedChildren(el);
  if (!direct.length) return false;
  const all = direct.flatMap(c => [c, ...descendants(c)]);
  const namedGsap = all.some(c => Array.from(c.classList || []).some(cls => /^gsap[_-]split[_-]/i.test(cls)));
  const nested = all.filter(c => isGeneratedSplitWrapper(c)).length >= 2;
  const repeated = direct.length >= 2;
  return namedGsap || nested || repeated;
}

export function isSplitTextRoot(el: HTMLElement): boolean {
  if (isGeneratedSplitWrapper(el)) return false;
  if (rememberedRoots.has(el)) return true;
  if (splitEvidence(el)) {
    rememberedRoots.add(el);
    return true;
  }
  return false;
}

export function splitTextRoot(target: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target;
  for (let depth = 0; el && depth < 16; el = el.parentElement, depth++) {
    if (isSplitTextRoot(el)) return el;
    if (['SECTION', 'ARTICLE', 'MAIN', 'BODY', 'HTML'].includes(el.tagName)) break;
  }
  return null;
}

export function splitTextValue(el: HTMLElement): string {
  const label = el.getAttribute('aria-label');
  if (label && el.querySelector('[aria-hidden="true"]')) return label;

  const source = el.textContent || '';
  // Generated word spans often rely on CSS margins instead of spaces.
  // If the DOM already has whitespace, retain it without guessing.
  if (/\\s/.test(source)) return source.replace(/\\s+/g, ' ').trim();
  const words = descendants(el).filter(isWord);
  if (words.length >= 2) return words.map(w => w.textContent?.trim() || '').join(' ').trim();
  return source;
}

type SplitSnapshot = {
  nodes: Node[];
  originalText: string;
  previewNode: Text | null;
  ariaLabel: string | null;
};
const snapshots = new Map<HTMLElement, SplitSnapshot>();

function unwrapHost(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const wrappers = generatedChildren(el);
  if (!wrappers.length || !splitEvidence(el)) return false;

  const previous = snapshots.get(el);
  const originalText = splitTextValue(el);
  if (!originalText.trim()) return false;

  // Replace only generated children if a Webflow element also contains
  // authored inline markup (strong/em/a/spans). Never delete those nodes.
  const hasAuthoredChild = Array.from(el.children).some(c => !isGeneratedSplitWrapper(c as HTMLElement));
  const originalNodes = Array.from(el.childNodes);
  const ariaLabel = el.getAttribute('aria-label');
  let previewNode: Text | null = null;
  if (!hasAuthoredChild) {
    previewNode = document.createTextNode(originalText);
    el.replaceChildren(previewNode);
  } else {
    // Keep existing semantic/styled elements and replace only GSAP wrappers.
    // Words in a sequence of masks need separating spaces after unwrapping.
    for (const wrapper of wrappers) {
      const text = wrapper.textContent || '';
      const word = isWord(wrapper) || descendants(wrapper).some(isWord);
      wrapper.replaceWith(document.createTextNode(word ? text.trim() + ' ' : text));
    }
    el.normalize();
  }

  if (ariaLabel !== null) el.removeAttribute('aria-label');
  if (previous) {
    previous.previewNode = previewNode;
  } else {
    snapshots.set(el, { nodes: originalNodes, originalText, previewNode, ariaLabel });
  }
  rememberedRoots.add(el);
  return true;
}

export function flattenAnimatedText(root: ParentNode = document): number {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(
    'h1,h2,h3,h4,h5,h6,p,span,a,blockquote,label,div'
  )).reverse();
  let changed = 0;
  for (const el of candidates) {
    if (unwrapHost(el)) changed++;
  }
  return changed;
}

let observer: MutationObserver | null = null;
let scheduled: ReturnType<typeof setTimeout> | null = null;
export function startSplitTextCleanup(): void {
  stopSplitTextCleanup(false);
  flattenAnimatedText();
  // GSAP may split headings after initial page load, on a resize, or when
  // ScrollTrigger refreshes. Unwrap newly generated markup while enabled.
  observer = new MutationObserver(records => {
    const addedSplit = records.some(record => Array.from(record.addedNodes).some(node =>
      node.nodeType === Node.ELEMENT_NODE &&
      (isGeneratedSplitWrapper(node as HTMLElement) ||
        !!(node as HTMLElement).querySelector?.('[class*="gsap_split_"],[class*="gsap-split-"],[data-split-word],[data-split-line]'))
    ));
    if (!addedSplit || scheduled !== null) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      flattenAnimatedText();
    }, 40);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
}

export function stopSplitTextCleanup(restore = true): void {
  observer?.disconnect(); observer = null;
  if (scheduled !== null) clearTimeout(scheduled);
  scheduled = null;
  if (restore) restoreAnimatedText();
}

export function restoreAnimatedText(): void {
  for (const [el, snapshot] of snapshots) {
    if (!el.isConnected) continue;
    // Do not undo user text edits: they are tracked separately.
    if ((el.textContent || '').replace(/\\s+/g, ' ').trim() !== snapshot.originalText.replace(/\\s+/g, ' ').trim()) continue;
    el.replaceChildren(...snapshot.nodes);
    if (snapshot.ariaLabel !== null) el.setAttribute('aria-label', snapshot.ariaLabel);
    rememberedRoots.delete(el);
  }
  snapshots.clear();
}
