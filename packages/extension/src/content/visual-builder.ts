// Visual Builder: safe, explicit element presets. No arbitrary HTML is accepted.
import { canEditRoute } from './route-edit-guard';
import { getElementById, getOrAssignId, generateSelector } from './helpers';
import { recordDomChange } from './change-tracker';

export const BUILDER_KINDS = ['section', 'container', 'div', 'heading', 'paragraph', 'button', 'image', 'card', 'grid'] as const;
export type BuilderKind = typeof BUILDER_KINDS[number];

export function addBuilderElement(kind: BuilderKind, targetId?: string, className?: string): string | null {
  if (!canEditRoute() || !BUILDER_KINDS.includes(kind)) return null;
  // The class is always a single safe CSS class, never HTML or a selector.
  if (className && !/^[a-zA-Z_][\w-]{0,79}$/.test(className)) return null;
  const tag = ({ section: 'section', container: 'div', div: 'div', heading: 'h2',
    paragraph: 'p', button: 'button', image: 'img', card: 'article', grid: 'div' } as const)[kind];
  const el = document.createElement(tag);
  const defaults: Record<BuilderKind, string> = {
    section: 'new-section', container: 'container', div: 'new-div',
    heading: 'new-heading', paragraph: 'new-paragraph', button: 'new-button',
    image: 'new-image', card: 'new-card', grid: 'new-grid',
  };
  el.classList.add(className || defaults[kind]);
  if (kind === 'heading') el.textContent = 'Your heading';
  if (kind === 'paragraph') el.textContent = 'Add your description here.';
  if (kind === 'button') { el.textContent = 'Button'; (el as HTMLButtonElement).type = 'button'; }
  if (kind === 'image') { (el as HTMLImageElement).alt = 'Placeholder image'; }
  if (kind === 'card') {
    const h = document.createElement('h3'); h.textContent = 'Card title';
    const p = document.createElement('p'); p.textContent = 'Card description';
    el.append(h, p);
  }
  if (kind === 'grid') el.style.display = 'grid';
  if (kind === 'section') el.style.padding = '48px 24px';
  const target = targetId ? getElementById(targetId) : null;
  if (target?.closest('[data-design-mode-root]')) return null;
  const canContain = target && !['IMG', 'INPUT', 'BR', 'HR', 'BUTTON', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(target.tagName);
  if (kind === 'section' && target && target !== document.body && target.parentElement) {
    target.parentElement.insertBefore(el, target.nextSibling);
  } else if (canContain) {
    target!.appendChild(el);
  } else if (target?.parentElement) {
    target.parentElement.insertBefore(el, target.nextSibling);
  } else {
    document.body.appendChild(el);
  }
  const id = getOrAssignId(el);
  const parent = el.parentElement!;
  recordDomChange(id, generateSelector(el), 'insert', tag, el.outerHTML, {
    parentSelector: generateSelector(parent),
    index: Array.from(parent.children).indexOf(el),
    parentId: parent === document.body || parent === document.documentElement ? undefined : getOrAssignId(parent),
  });
  return id;
}
