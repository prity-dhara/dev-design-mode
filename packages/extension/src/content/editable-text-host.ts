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
  return Array.from(el.querySelectorAll<HTMLElement>('*')).every(child =>
    INLINE_TEXT.has(child.tagName));
}
