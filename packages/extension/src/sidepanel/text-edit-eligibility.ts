// A text-only DIV must be editable just like a paragraph. Reject actual
// layouts/widgets rather than rejecting every nested DIV: GSAP and custom
// text animation libraries may wrap each line/word in DIVs instead of SPANs.
const NON_TEXT_CONTENT = /<\s*(?:section|article|main|aside|header|footer|nav|h[1-6]|p|ul|ol|li|table|form|button|input|select|textarea|img|svg|video|audio|iframe|canvas|figure|blockquote|hr)\b/i;
const GENERATED_TEXT_CLASS = /^(?:gsap[_-]split[_-](?:line|word|char)(?:-mask)?|(?:split|gsap)[-_](?:line|word|char)(?:-mask)?|(?:line|word|char)(?:-mask)?)$/i;

function generatedTextWrapper(attributes: string): boolean {
  const match = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
  if (!match) return false;
  return (match[1] || match[2] || '').split(/\s+/).some(name => GENERATED_TEXT_CLASS.test(name));
}

export function isEditableTextOnlyDiv(html: string, text: string | null | undefined): boolean {
  if (!text?.trim() || NON_TEXT_CONTENT.test(html)) return false;

  // Plain text, formatted inline spans, and GSAP generated line/word/char
  // wrapper DIVs are fine. A nested card, grid or layout DIV is not.
  for (const match of html.matchAll(/<\s*div\b([^>]*)>/gi)) {
    if (!generatedTextWrapper(match[1])) return false;
  }
  return true;
}
