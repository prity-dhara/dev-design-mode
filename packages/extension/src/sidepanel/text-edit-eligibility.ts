// Only expose the rich-text editor on divs that contain inline text,
// not layout or component subtrees that would be flattened when saved.
const BLOCK_OR_WIDGET = /<\s*(?:div|section|article|main|aside|header|footer|nav|h[1-6]|p|ul|ol|li|table|form|button|input|select|textarea|img|svg|video|audio|iframe|canvas|figure|blockquote)\b/i;

export function isEditableTextOnlyDiv(html: string, text: string | null | undefined): boolean {
  return !!text?.trim() && !BLOCK_OR_WIDGET.test(html);
}
