// Unwrap runtime GSAP SplitText markup in the Design Mode *preview*.
// The original HTML host and its Webflow classes stay intact. This does not
// modify the site's source code or remove the GSAP library.
// Only explicit GSAP-generated classes are hidden from the Layers panel.
// Generic .line/.word classes can be authored layout components.
const generatedClass = /^gsap[_-]split[_-][\w-]+$/i;
const genericPartClass = /^(?:line|lines|word|words|char|chars)$/i;
const wordClass = /^(?:word|words|gsap[_-]split[_-]word)$/i;
const generatedAttribute = ['data-split-line', 'data-split-word', 'data-split-char'];
const rememberedRoots = new WeakSet<HTMLElement>();

export function isGeneratedSplitWrapper(el: HTMLElement): boolean {
  return Array.from(el.classList || []).some(name => generatedClass.test(name)) ||
    generatedAttribute.some(name => el.hasAttribute(name));
}

function isSplitPart(el: HTMLElement): boolean {
  return isGeneratedSplitWrapper(el) ||
    Array.from(el.classList || []).some(name => genericPartClass.test(name));
}
function isWord(el: HTMLElement): boolean {
  return Array.from(el.classList || []).some(name => wordClass.test(name)) ||
    el.hasAttribute('data-split-word');
}
function descendants(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('*'));
}
function generatedChildren(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(c => isSplitPart(c as HTMLElement)) as HTMLElement[];
}
function splitEvidence(el: HTMLElement): boolean {
  const direct = generatedChildren(el);
  if (!direct.length) return false;
  const all = direct.flatMap(c => [c, ...descendants(c)]);
  const namedGsap = all.some(c => Array.from(c.classList || []).some(cls => /^gsap[_-]split[_-]/i.test(cls)));
  const nested = all.filter(c => isSplitPart(c)).length >= 2;
  const repeated = direct.length >= 2;
  return namedGsap || nested || repeated;
}

export function isSplitTextRoot(el: HTMLElement): boolean {
  if (isSplitPart(el)) return false;
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
  if (/\s/.test(source)) return source.replace(/\s+/g, ' ').trim();
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
  const hasAuthoredChild = Array.from(el.children).some(c => !isSplitPart(c as HTMLElement));
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


/**
 * Restore the server-authored HTML for split headings where possible.
 *
 * A live published page is already running custom scripts when the extension
 * opens. Rather than guessing where GSAP added spaces or losing author-styled
 * spans, fetch the *same page's HTML source* and use the matching untouched
 * heading markup as the Design Mode preview. This does NOT block JavaScript.
 *
 * Only exact structural/text matches are applied. Dynamic/unmatched pages
 * retain the conservative runtime unwrapping fallback.
 */
let sourceRequest: AbortController | null = null;

function structuralPath(el: HTMLElement): string | null {
  const segments: string[] = [];
  let current: HTMLElement | null = el;
  for (let depth = 0; current && current !== document.body && depth < 40; depth++) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) return null;
    const siblings = Array.from(parent.children).filter(
      child => child.tagName === current!.tagName,
    );
    const index = siblings.indexOf(current) + 1;
    if (index < 1) return null;
    segments.unshift(current.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
    current = parent;
  }
  return current === document.body && segments.length
    ? 'body > ' + segments.join(' > ')
    : null;
}

function sameAuthorText(a: string, b: string): boolean {
  // SplitText sometimes removes literal spaces while retaining word masks.
  // Compare the actual characters rather than the generated whitespace.
  const normalize = (value: string) => value.replace(/\s+/g, '').normalize('NFC');
  return !!a && !!b && normalize(a) === normalize(b);
}

export async function restoreWebflowSourceText(signal?: AbortSignal): Promise<number> {
  if (!/^https?:$/.test(location.protocol) || !document.body) return 0;
  if (snapshots.size === 0) return 0;
  const response = await fetch(location.href, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) return 0;
  const html = await response.text();
  if (signal?.aborted) return 0;
  const originalPage = new DOMParser().parseFromString(html, 'text/html');
  let restored = 0;

  for (const [live, snapshot] of snapshots) {
    if (signal?.aborted) break;
    if (!live.isConnected || !snapshot.originalText) continue;
    // Once a user changes the text, do not overwrite their edit.
    if (!sameAuthorText(live.textContent || '', snapshot.originalText)) continue;
    const path = structuralPath(live);
    if (!path) continue;
    const source = originalPage.querySelector<HTMLElement>(path);
    if (!source || source.tagName !== live.tagName) continue;
    if (!sameAuthorText(source.textContent || '', snapshot.originalText)) continue;
    // Never inject executable/embedded page content into an editable heading.
    if (source.querySelector('script,iframe,object,embed')) continue;
    const nodes = Array.from(source.childNodes).map(node => document.importNode(node, true));
    if (!nodes.length) continue;
    live.replaceChildren(...nodes);
    const label = source.getAttribute('aria-label');
    if (label !== null) live.setAttribute('aria-label', label);
    else live.removeAttribute('aria-label');
    snapshot.previewNode = null;
    restored++;
  }
  return restored;
}

let observer: MutationObserver | null = null;
let scheduled: ReturnType<typeof setTimeout> | null = null;
export function startSplitTextCleanup(): void {
  stopSplitTextCleanup(false);
  flattenAnimatedText();
  // Prefer exact original markup over approximating lines/words after GSAP.
  sourceRequest = new AbortController();
  void restoreWebflowSourceText(sourceRequest.signal).catch(() => {});

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
  sourceRequest?.abort();
  sourceRequest = null;
  observer?.disconnect(); observer = null;
  if (scheduled !== null) clearTimeout(scheduled);
  scheduled = null;
  if (restore) restoreAnimatedText();
}

export function restoreAnimatedText(): void {
  for (const [el, snapshot] of snapshots) {
    if (!el.isConnected) continue;
    // Do not undo user text edits: they are tracked separately.
    if ((el.textContent || '').replace(/\s+/g, ' ').trim() !== snapshot.originalText.replace(/\s+/g, ' ').trim()) continue;
    el.replaceChildren(...snapshot.nodes);
    if (snapshot.ariaLabel !== null) el.setAttribute('aria-label', snapshot.ariaLabel);
    rememberedRoots.delete(el);
  }
  snapshots.clear();
}
