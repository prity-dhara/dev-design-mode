// Visual Builder: safe, explicit element presets. No arbitrary HTML is accepted.
import { canEditRoute } from './route-edit-guard';
import { getElementById, getOrAssignId, generateSelector } from './helpers';
import { recordDomChange } from './change-tracker';
import { isSafeClassName } from './site-class-discovery';

export const BUILDER_KINDS = ['section', 'container', 'div', 'heading', 'paragraph', 'button', 'card', 'grid'] as const;
export type BuilderKind = typeof BUILDER_KINDS[number];
export type InsertPosition = 'before' | 'inside' | 'after';
const INVALID_PARENTS = new Set(['IMG','INPUT','BR','HR','BUTTON','P','H1','H2','H3','H4','H5','H6','A','SPAN','LABEL','TEXTAREA','SELECT','OPTION']);
function getDestination(targetId?: string, position: InsertPosition = 'after'): { target: Element; position: InsertPosition } | null {
  const target = targetId ? getElementById(targetId) : document.body;
  if (!target || target.closest('[data-dm-builder-overlay]')) return null;
  if (target === document.body) return { target, position: 'inside' };
  // Text and void elements cannot contain children. Insert the new element
  // as a sibling instead, preserving the surrounding div/section.
  if (position === 'inside' && INVALID_PARENTS.has(target.tagName)) {
    return target.parentElement ? { target, position: 'after' } : null;
  }
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
    // Inside appends at the END of the container, not somewhere in its
    // middle. Show the end of its last child's flow as the insertion guide.
    const parent = destination.target;
    const last = parent.lastElementChild;
    const flow = window.getComputedStyle(parent);
    const horizontal = flow.display.includes('flex') &&
      flow.flexDirection.startsWith('row');
    const lastRect = last?.getBoundingClientRect();
    if (horizontal && lastRect) {
      overlay.style.left = Math.max(0,Math.min(innerWidth - 4,lastRect.right)) + 'px';
      overlay.style.width = '4px';
      overlay.style.top = Math.max(0,lastRect.top) + 'px';
      overlay.style.height = Math.max(32,Math.min(lastRect.height || 40,innerHeight-Math.max(0,lastRect.top))) + 'px';
      overlay.style.background = '#2563eb';
    } else {
      const insertionY = lastRect ? lastRect.bottom : rect.top;
      overlay.style.top = Math.max(0,Math.min(innerHeight - 4,insertionY)) + 'px';
      overlay.style.height = '4px';
      overlay.style.background = '#2563eb';
    }
  } else {
    overlay.style.top = Math.max(0,Math.min(innerHeight-4,destination.position === 'before'?rect.top:rect.bottom)) + 'px';
    overlay.style.height = '4px';
    overlay.style.background = '#2563eb';
  }
  const label = document.createElement('span');
  label.textContent = 'Insert ' + destination.position + ' ' + destination.target.tagName.toLowerCase();
  label.style.cssText = 'position:absolute;left:0;bottom:100%;padding:3px 7px;border-radius:4px 4px 0 0;background:#2563eb;color:white;white-space:nowrap;';
  overlay.appendChild(label);
  document.documentElement.appendChild(overlay);
  preview = overlay;
  return true;
}


// Editor-only dotted guide for newly inserted empty structural elements.
// It is drawn above the page and never modifies the website element's CSS,
// dimensions, HTML, or the exported source. The marker is intentionally small.
let emptyMarker: HTMLElement | null = null;
let stopEmptyMarker: (() => void) | null = null;

export function clearEmptyBuilderMarker(): void {
  stopEmptyMarker?.();
  stopEmptyMarker = null;
  emptyMarker?.remove();
  emptyMarker = null;
}
export function highlightInsertedBuilderElement(elementId: string, kind: BuilderKind): void {
  clearBuilderPreview();
  clearEmptyBuilderMarker();
  if (!['section', 'container', 'div', 'grid'].includes(kind)) return;
  const target = getElementById(elementId);
  if (!target || target.children.length || target.textContent?.trim()) return;

  const marker = document.createElement('div');
  marker.setAttribute('data-dm-builder-overlay', '');
  marker.setAttribute('aria-hidden', 'true');
  marker.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;' +
    'border:2px dashed #329cf5;border-radius:6px;background:rgba(50,156,245,.10);' +
    'display:flex;align-items:center;justify-content:center;color:#329cf5;' +
    'font:500 12px system-ui,sans-serif;line-height:1;';
  marker.textContent = 'Empty ' + kind;
  document.documentElement.appendChild(marker);
  emptyMarker = marker;
  const update = () => {
    if (emptyMarker !== marker) return;
    if (!target.isConnected || target.children.length || target.textContent?.trim()) {
      clearEmptyBuilderMarker();
      return;
    }
    const rect = target.getBoundingClientRect();
    // The marker is a visual indicator, not a real min-height on the page.
    marker.style.left = Math.max(0, rect.left) + 'px';
    marker.style.top = Math.max(0, Math.min(window.innerHeight - 32, rect.top)) + 'px';
    marker.style.width = Math.max(100, Math.min(window.innerWidth - Math.max(0,rect.left), rect.width || 180)) + 'px';
    marker.style.height = '32px';
    marker.style.display = rect.bottom < 0 || rect.top > window.innerHeight ? 'none' : 'flex';
  };
  const observer = new MutationObserver(update);
  observer.observe(target, { childList: true, characterData: true, subtree: true });
  window.addEventListener('scroll', update, true);
  window.addEventListener('resize', update);
  stopEmptyMarker = () => {
    observer.disconnect();
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', update);
  };
  update();
}
export function addBuilderElement(kind: BuilderKind, targetId?: string, className?: string, position: InsertPosition = 'after'): string | null {
  if (!canEditRoute() || !BUILDER_KINDS.includes(kind)) return null;
  // The class is always a single safe CSS class, never HTML or a selector.
  if (className && !isSafeClassName(className)) return null;
  const tag = ({ section: 'section', container: 'div', div: 'div', heading: 'h2',
    paragraph: 'p', button: 'button', card: 'article', grid: 'div' } as const)[kind];
  const el = document.createElement(tag);
  // Reuse the site's real class if one is chosen; don't invent another class on top.
  // Without a choice, use semantic HTML and existing global element styles.
  if (className) el.classList.add(className);
  if (kind === 'heading') el.textContent = 'Your heading';
  if (kind === 'paragraph') el.textContent = 'Add your description here.';
  if (kind === 'button') { el.textContent = 'Button'; (el as HTMLButtonElement).type = 'button'; }
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
