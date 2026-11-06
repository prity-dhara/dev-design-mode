// A Webflow text block may be authored as a <div> rather than <p>/<h*>.
// Detect a true text-only container, not a section/card/layout with
// descendants that happen to contain copy. Preserve authored inline markup.
const INLINE_TEXT = new Set([
  'SPAN', 'A', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SMALL',
  'MARK', 'SUB', 'SUP', 'BR', 'WBR', 'CODE', 'ABBR', 'CITE',
  'Q', 'TIME', 'BDI', 'BDO',
]);

export function isEditableTextHost(el: HTMLElement): boolean {
  if (el.tagName !== 'DIV') return false;
  if (!el.textContent?.trim()) return false;
  // A single text node or a mixture of authored inline spans/links is a
  // logical text block. Never treat block children (divs, headings,
  // paragraphs, images, lists, buttons) as one text field.
  const descendants = Array.from(el.querySelectorAll<HTMLElement>('*'));
  if (descendants.every(child => INLINE_TEXT.has(child.tagName))) return true;
  // A text-only Webflow div may contain a decorative SVG/icon as a sibling
  // to its literal text node. That icon should not hide Text Content.
  // Rich-text saving preserves these non-editable nodes as placeholders.
  const ownText = Array.from(el.childNodes || []).some(node =>
    node.nodeType === 3 && !!node.textContent?.trim());
  return ownText && descendants.every(child =>
    INLINE_TEXT.has(child.tagName) || !(child.textContent || '').trim());
}


// Text targets within a selected layout wrapper. This deliberately includes
// leaf <span> nodes: Webflow's p-tagline containers commonly mix decoration
// (e.g. an SVG or a flex div) with a span that owns the actual copy.
// Group GSAP words under their logical host and avoid editing each span.
import { isLogicalSplitWrapper, isSplitTextRoot, splitTextRoot } from './split-text';

const TEXT_TARGET_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BLOCKQUOTE', 'LI',
  'FIGCAPTION', 'DIV', 'SPAN', 'LABEL', 'STRONG', 'EM', 'SMALL', 'A'
]);
const SEMANTIC_HOST_TAGS = new Set([
  'H1','H2','H3','H4','H5','H6','P','BLOCKQUOTE','LI','FIGCAPTION'
]);
const NON_CONTENT_ANCESTORS = 'button,svg,script,style,noscript,[aria-hidden="true"],[contenteditable="false"]';

export function findEditableTextDescendants(root: HTMLElement): HTMLElement[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>(
    'h1,h2,h3,h4,h5,h6,p,blockquote,li,figcaption,div,span,label,strong,em,small,a'
  ));
  if (els.length > 300) return []; // Never turn a whole page into an edit target list.
  const candidates: HTMLElement[] = [];
  for (const el of els) {
    if (!TEXT_TARGET_TAGS.has(el.tagName) || !el.textContent?.trim() ||
        el.matches?.(NON_CONTENT_ANCESTORS) || el.closest?.(NON_CONTENT_ANCESTORS)) continue;
    if (isLogicalSplitWrapper(el)) continue;
    const owningSplit = splitTextRoot(el);
    if (owningSplit && owningSplit !== el) continue;
    const split = isSplitTextRoot(el);
    const plainLeaf = el.children.length === 0;
    const semantic = SEMANTIC_HOST_TAGS.has(el.tagName);
    if (!split && !plainLeaf && !isEditableTextHost(el) && !semantic) continue;
    // An authored heading, paragraph or SplitText host is already a complete
    // logical text block. Never expose its nested bold/word spans separately.
    const authorHost = candidates.find(parent =>
      parent.contains(el) && (isSplitTextRoot(parent) || SEMANTIC_HOST_TAGS.has(parent.tagName)));
    if (authorHost) continue;
    if (split || semantic) {
      // Prefer the source-level host over any previously discovered leaf.
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (el.contains(candidates[i])) candidates.splice(i, 1);
      }
    }
    candidates.push(el);
  }
  // For a formatting-only div/span chain, prefer the innermost text element,
  // unless the parent is the original GSAP/semantic text host.
  return candidates.filter(el => !candidates.some(other =>
    other !== el && el.contains(other) &&
    !SEMANTIC_HOST_TAGS.has(el.tagName) && !isSplitTextRoot(el)));
}
