// Discover reusable classes from the current page, without modifying its CSS.
// DOM class attributes are sampled; cross-origin stylesheets are not inspected.
import type { BuilderKind } from './visual-builder';

export interface SiteClass {
  name: string;
  count: number;
  kind: BuilderKind | 'other' | 'image';
}
const SAFE_CLASS = /^[a-zA-Z_][\w-]{0,79}$/;
export function isSafeClassName(name: string): boolean {
  return SAFE_CLASS.test(name) && !name.startsWith('dm-');
}
export function classifySiteElement(el: Element): BuilderKind | 'other' | 'image' {
  const tag = el.tagName.toLowerCase();
  if (tag === 'section') return 'section';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'p') return 'paragraph';
  if (tag === 'button' || (tag === 'a' && (el.getAttribute('role') === 'button' || /(^|[-_])(btn|button|cta)([-_]|$)/i.test(Array.from(el.classList).join(' '))))) return 'button';
  if (tag === 'img') return 'image';
  if (tag === 'article') return 'card';
  if (tag === 'main') return 'container';
  if (tag === 'div') {
    const name = Array.from(el.classList).join(' ').toLowerCase();
    if (/\b(grid|columns)(-|\b)/.test(name)) return 'grid';
    if (/\b(container|wrapper)(-|\b)/.test(name)) return 'container';
    if (/\b(card|tile)(-|\b)/.test(name)) return 'card';
    return 'div';
  }
  return 'other';
}
export function discoverSiteClasses(root: ParentNode = document, limit = 160): SiteClass[] {
  const counts = new Map<string, { count: number; kinds: Map<SiteClass['kind'], number> }>();
  // Cap traversal to avoid slowing down very large websites.
  let checked = 0;
  for (const el of root.querySelectorAll('[class]')) {
    if (++checked > 6000) break;
    const kind = classifySiteElement(el);
    for (const name of el.classList) {
      if (!isSafeClassName(name)) continue;
      let value = counts.get(name);
      if (!value) { value = { count: 0, kinds: new Map() }; counts.set(name, value); }
      value.count++;
      value.kinds.set(kind, (value.kinds.get(kind) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, value]) => ({
    name, count: value.count,
    kind: [...value.kinds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'other',
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}
