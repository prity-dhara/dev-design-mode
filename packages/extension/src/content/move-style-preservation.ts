/**
 * Reparenting retains a live element and its classes, but CSS selectors scoped
 * to its old section (and inherited typography) no longer match afterwards.
 * Carry over only the visual text properties that actually changed. Let the new
 * parent control dimensions, margins and layout.
 */
export const MOVE_TEXT_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-stretch',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-style',
  'text-align',
  'text-indent',
  'color',
  'white-space',
  'text-shadow',
] as const;

export type TextStyleSnapshot = Record<string, string>;

export function captureMoveTextStyle(element: Element): TextStyleSnapshot {
  const computed = window.getComputedStyle(element);
  return Object.fromEntries(
    MOVE_TEXT_PROPERTIES.map(property => [property, computed.getPropertyValue(property).trim()]),
  );
}

/**
 * Capture the new cascade *before* installing any override; changes are
 * applied through the existing tracked stylesheet so Changes / export sees
 * them and we never write arbitrary inline styles to the page.
 */
export function preserveMovedTextStyle(
  element: Element,
  before: TextStyleSnapshot,
  apply: (property: string, value: string) => void,
): string[] {
  const after = captureMoveTextStyle(element);
  const changed: string[] = [];
  for (const property of MOVE_TEXT_PROPERTIES) {
    const value = before[property];
    if (!value || value === after[property]) continue;
    apply(property, value);
    changed.push(property);
  }
  return changed;
}
