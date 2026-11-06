// Non-destructive static text preview for GSAP SplitText source edits.
// The original word/line DOM nodes and GSAP timeline stay intact. This
// extension-owned CSS temporarily hides ONLY generated direct children and
// shows the edited source copy as an inheriting ::before pseudo-element.
// Disabling Design Mode removes the attribute and stylesheet immediately.
import { isSplitTextRoot, isGeneratedSplitWrapper } from './split-text';

const ATTR = 'data-dm-splittext-preview';
const STYLE_ID = 'dm-splittext-preview-styles';
const ACTIVE = new Set<HTMLElement>();
const GENERIC = /^(?:line|lines|word|words|char|chars)$/;

function isGeneratedPart(el: HTMLElement): boolean {
  return isGeneratedSplitWrapper(el) ||
    Array.from(el.classList).some(c => GENERIC.test(c));
}

export function canPreviewSplitText(el: HTMLElement): boolean {
  if (!isSplitTextRoot(el) || !el.children.length) return false;
  // Do not hide authored inline HTML or embedded media. If the element is
  // mixed content, retain its animation and only record a source edit.
  if (!Array.from(el.children).every(child => isGeneratedPart(child as HTMLElement))) return false;
  return Array.from(el.childNodes).every(node =>
    node.nodeType === Node.ELEMENT_NODE ||
    (node.nodeType === Node.TEXT_NODE && !(node.textContent || '').trim()));
}

function ensureCss(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    `[${ATTR}] > * { display: none !important; }` +
    `[${ATTR}]::before {
      content: attr(${ATTR});
      display: inline;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      font: inherit;
      color: inherit;
      letter-spacing: inherit;
      line-height: inherit;
      text-transform: inherit;
    }`;
  (document.head || document.documentElement).appendChild(style);
}

export function setSplitTextStaticPreview(el: HTMLElement, text: string): boolean {
  if (!canPreviewSplitText(el)) return false;
  ensureCss();
  el.setAttribute(ATTR, text);
  ACTIVE.add(el);
  return true;
}

export function clearSplitTextStaticPreview(el: HTMLElement): void {
  el.removeAttribute(ATTR);
  ACTIVE.delete(el);
  if (ACTIVE.size === 0) document.getElementById(STYLE_ID)?.remove();
}

export function clearAllSplitTextStaticPreviews(): void {
  for (const el of ACTIVE) el.removeAttribute(ATTR);
  ACTIVE.clear();
  document.getElementById(STYLE_ID)?.remove();
}
