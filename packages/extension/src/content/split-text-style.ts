// Scoped text-only preview overrides for GSAP SplitText wrappers.
//
// Styling a Webflow heading at the HTML host normally inherits into the
// generated spans. Some SplitText implementations add explicit per-word
// inline typography, so inheritance alone does not update the visible text.
// Apply ONLY inheritable typography to generated descendants; never override
// GSAP-controlled transform, opacity, position, display, overflow or clip.
const TYPOGRAPHY = new Set([
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'fontVariant', 'lineHeight', 'letterSpacing', 'wordSpacing',
  'textTransform', 'textDecoration', 'textDecorationColor',
  'textDecorationLine', 'textDecorationStyle', 'textIndent',
  'textShadow', 'whiteSpace', 'direction',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'font-variant', 'line-height', 'letter-spacing', 'word-spacing',
  'text-transform', 'text-decoration', 'text-decoration-color',
  'text-decoration-line', 'text-decoration-style',
  'text-indent', 'text-shadow', 'white-space',
]);

export function splitTypographyProps(props: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...props].filter(([name]) => TYPOGRAPHY.has(name)));
}

// Only generated words/lines inside the selected logical text host.
// The host itself remains the only editor target and change-report entry.
const WRAPPERS = ':is(.char, .chars, .word, .words, .line, .lines, ' +
  '[class^="gsap_split_"], [class*=" gsap_split_"], ' +
  '[class^="gsap-split-"], [class*=" gsap-split-"], ' +
  '[data-split-char], [data-split-word], [data-split-line])';

export function splitTypographySelector(hostSelector: string): string {
  return `${hostSelector} ${WRAPPERS}`;
}
