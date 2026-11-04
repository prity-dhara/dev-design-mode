// Visual Builder: safe, explicit element presets. No arbitrary HTML is accepted.
import { canEditRoute } from './route-edit-guard';
import { getElementById, getOrAssignId, generateSelector } from './helpers';
import { recordDomChange } from './change-tracker';
import { isSafeClassName } from './site-class-discovery';

export const BUILDER_KINDS = ['section', 'container', 'div', 'heading', 'paragraph', 'button', 'image', 'card', 'grid'] as const;
export type BuilderKind = typeof BUILDER_KINDS[number];
export type InsertPosition = 'before' | 'inside' | 'after';
const INVALID_PARENTS = new Set(['IMG','INPUT','BR','HR','BUTTON','P','H1','H2','H3','H4','H5','H6','A','SPAN','LABEL','TEXTAREA','SELECT','OPTION']);
function getDestination(targetId?: string, position: InsertPosition = 'after'): { target: Element; position: InsertPosition } | null {
  const target = targetId ? getElementById(targetId) : document.body;
  if (!target || target.closest('[data-dm-builder-overlay]')) return null;
  if (target === document.body) return { target, position: 'inside' };
  if (position === 'inside' && INVALID_PARENTS.has(target.tagName)) return null;
  if (position !== 'inside' && !target.parentElement) return null;
  return { target, position };
}
let preview: HTMLElement | null = null;
export function clearBuilderPreview(): void { preview?.remove(); preview = null; }
export function previewBuilderPlacement(targetId: string | undefined, position: InsertPosition): boolean {
  clearBuilderPreview();
  const destination = getDestination(targetId, position);
  if (!destination) return false;
  const rect = destination.target.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.setAttribute('data-dm-builder-overlay','');
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;font:600 12px system-ui,sans-serif;';
  overlay.style.left = Math.max(0,rect.left) + 'px';
  overlay.style.width = Math.max(40,Math.min(innerWidth,rect.right)-Math.max(0,rect.left)) + 'px';
  if (destination.position === 'inside') {
    overlay.style.top = Math.max(0,rect.top) + 'px';
    overlay.style.height = Math.max(32,Math.min(rect.height || 40,innerHeight-Math.max(0,rect.top))) + 'px';
    overlay.style.border = '2px dashed #2563eb';
    overlay.style.background = 'rgba(37,99,235,.06)';
  } else {
    overlay.style.top = Math.max(0,Math.min(innerHeight-4,destination.position === 'before'?rect.top:rect.bottom)) + 'px';
    overlay.style.height = '4px';
    overlay.style.background = '#2563eb';
  }
  const label = document.createElement('span');
  label.textContent = 'Insert ' + destination.position;
  label.style.cssText = 'position:absolute;left:0;bottom:100%;padding:3px 7px;border-radius:4px 4px 0 0;background:#2563eb;color:white;white-space:nowrap;';
  overlay.appendChild(label);
  document.documentElement.appendChild(overlay);
  preview = overlay;
  return true;
}


// Transient editor-only indication for otherwise invisible empty sections.
// The actual page element keeps its original CSS (no forced min-height).
export function highlightInsertedBuilderElement(elementId: string, kind: BuilderKind): void {
  const target = getElementById(elementId);
  if (!target) return;
  clearBuilderPreview();
  const rect = target.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.setAttribute('data-dm-builder-overlay','');
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:2px dashed #2563eb;background:rgba(37,99,235,.06);border-radius:4px;';
  overlay.style.left = Math.max(0,rect.left) + 'px';
  overlay.style.top = Math.max(0,rect.top) + 'px';
  overlay.style.width = Math.max(40,Math.min(innerWidth,rect.right)-Math.max(0,rect.left)) + 'px';
  overlay.style.height = Math.max(48,Math.min(rect.height || 48,innerHeight-Math.max(0,rect.top))) + 'px';
  const label = document.createElement('span');
  label.textContent = 'New ' + kind + (rect.height < 12 ? ' · empty' : '');
  label.style.cssText = 'position:absolute;top:0;left:0;background:#2563eb;color:#fff;padding:3px 7px;border-radius:0 0 4px 0;font:600 12px system-ui,sans-serif;';
  overlay.appendChild(label);
  document.documentElement.appendChild(overlay);
  preview = overlay;
  setTimeout(() => { if (preview === overlay) clearBuilderPreview(); }, 12000);
}
export function addBuilderElement(kind: BuilderKind, targetId?: string, className?: string, position: InsertPosition = 'after'): string | null {
  if (!canEditRoute() || !BUILDER_KINDS.includes(kind)) return null;
  // The class is always a single safe CSS class, never HTML or a selector.
  if (className && !isSafeClassName(className)) return null;
  const tag = ({ section: 'section', container: 'div', div: 'div', heading: 'h2',
    paragraph: 'p', button: 'button', image: 'img', card: 'article', grid: 'div' } as const)[kind];
  const el = document.createElement(tag);
  // Reuse the site's real class if one is chosen; don't invent another class on top.
  // Without a choice, use semantic HTML and existing global element styles.
  if (className) el.classList.add(className);
  if (kind === 'heading') el.textContent = 'Your heading';
  if (kind === 'paragraph') el.textContent = 'Add your description here.';
  if (kind === 'button') { el.textContent = 'Button'; (el as HTMLButtonElement).type = 'button'; }
  if (kind === 'image') { (el as HTMLImageElement).alt = 'Placeholder image'; }
  if (kind === 'card') {
    const h = document.createElement('h3'); h.textContent = 'Card title';
    const p = document.createElement('p'); p.textContent = 'Card description';
    el.append(h, p);
  }
  // Never override the website's stylesheet with hardcoded defaults.
  if (kind === 'grid' && !className) el.style.display = 'grid';
  const destination = getDestination(targetId, position);
  if (!destination) return null;
  clearBuilderPreview();
  const { target, position: place } = destination;
  if (place === 'inside') target.appendChild(el);
  else if (place === 'before') target.parentElement!.insertBefore(el,target);
  else target.parentElement!.insertBefore(el,target.nextSibling);
  const id = getOrAssignId(el);
  const parent = el.parentElement!;
  recordDomChange(id, generateSelector(el), 'insert', tag, el.outerHTML, {
    parentSelector: generateSelector(parent),
    index: Array.from(parent.children).indexOf(el),
    parentId: parent === document.body || parent === document.documentElement ? undefined : getOrAssignId(parent),
  });
  return id;
}
