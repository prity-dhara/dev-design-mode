// Logical GSAP SplitText selection. Never mutate a running SplitText DOM
// during inspection: wrapper nodes may be referenced by live GSAP timelines.
// A page-world bridge can opt in to safe instance-aware editing separately.

const generatedClass = /^gsap[_-]split[_-](?:line|word|char|text)(?:[_-](?:mask|wrapper))?$/i;
const genericClass = /^(?:line|lines|word|words|char|chars)$/i;
const wordClass = /^(?:word|words|gsap[_-]split[_-]word)$/i;
const splitAttributes = ['data-split-line', 'data-split-word', 'data-split-char'];
const draftText = new WeakMap<HTMLElement, string>();

function classes(el: HTMLElement): string[] {
  return Array.from(el.classList || []);
}
export function isGeneratedSplitWrapper(el: HTMLElement): boolean {
  return classes(el).some(name => generatedClass.test(name)) ||
    splitAttributes.some(name => el.hasAttribute(name));
}
function isPart(el: HTMLElement): boolean {
  return isGeneratedSplitWrapper(el) || classes(el).some(name => genericClass.test(name));
}
function descendants(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('*'));
}
function parts(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(child => isPart(child as HTMLElement)) as HTMLElement[];
}
function isWord(el: HTMLElement): boolean {
  return classes(el).some(name => wordClass.test(name)) || el.hasAttribute('data-split-word');
}

export function isSplitTextRoot(el: HTMLElement): boolean {
  if (isPart(el)) return false;
  const directParts = parts(el);
  if (!directParts.length) return false;
  // Evidence must occur inside *direct* generated children. A surrounding
  // section/card is not treated as one text element just because it contains
  // a split heading further down the tree.
  const nested = directParts.flatMap(part => [part, ...descendants(part)]);
  const explicit = nested.some(isGeneratedSplitWrapper);
  const accessible = !!el.getAttribute('aria-label') &&
    nested.some(part => part.getAttribute('aria-hidden') === 'true');
  // GSAP's stock SplitText may use plain .char/.word classes. Recognize
  // those only on a text-semantic host with multiple fragment tokens, not
  // on arbitrary div/card/grid containers with generic class names.
  const semanticTextHost = /^(?:H[1-6]|P|BLOCKQUOTE)$/.test(el.tagName);
  const tokenCount = nested.filter(part =>
    classes(part).some(name => /^(?:word|words|char|chars)$/.test(name))).length;
  const stockSplitText = semanticTextHost && tokenCount >= 3 &&
    directParts.length === el.children.length;
  return explicit || (accessible && nested.filter(isPart).length >= 2) || stockSplitText;
}

/** Only generated fragments, never the authored heading or paragraph. */
export function isLogicalSplitWrapper(el: HTMLElement): boolean {
  return isGeneratedSplitWrapper(el) ||
    (classes(el).some(name => genericClass.test(name)) &&
      !!splitTextRoot(el));
}

export function splitTextRoot(target: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = target;
  for (let depth = 0; current && depth < 16; current = current.parentElement, depth++) {
    if (isSplitTextRoot(current)) return current;
    if (['SECTION', 'ARTICLE', 'MAIN', 'BODY', 'HTML'].includes(current.tagName)) break;
  }
  return null;
}

export function splitTextValue(el: HTMLElement): string {
  const draft = draftText.get(el);
  if (draft !== undefined) return draft;
  const label = el.getAttribute('aria-label');
  if (label && isSplitTextRoot(el)) return label;
  const original = el.getAttribute('data-split-original') || el.getAttribute('data-original-text');
  if (original && isSplitTextRoot(el)) return original;
  const text = el.textContent || '';
  if (/\s/.test(text)) return text;
  // Certain Webflow SplitText effects remove spaces between generated words.
  // Use leaf word wrappers; mask+inner word must not be double-counted.
  const words = descendants(el).filter(isWord).filter(word =>
    !descendants(word).some(isWord));
  if (words.length > 1) return words.map(word => word.textContent?.trim() || '').join(' ');
  return text;
}
export function setSplitTextDraft(el: HTMLElement, text: string): void {
  draftText.set(el, text);
}
export function clearSplitTextDraft(el: HTMLElement): void {
  draftText.delete(el);
}

/** Source locator for unsupported pages; never pretend a Webflow CSS
 * selector identifies a local source-file line. */
export function splitTextSourceHint(el: HTMLElement, selector: string): string {
  return `${location.href} | ${selector} (original HTML host; locate authoring code)`;
}

// Backward-compatible activation hooks: inspection no longer replaces nodes.
// The edit bridge only runs when a page explicitly exposes its SplitText
// instance and an animation rebuild callback.
export function startSplitTextCleanup(): void {}
export function stopSplitTextCleanup(): void {}
