// Native browser cursor for Dev Agent. The extension's orange code icon
// belongs in the browser toolbar, not under the user's mouse pointer.
// Retain the public helpers so inspector interaction remains compatible.

let active = false;
let inspectProbe: () => boolean = () => false;

export function baseCursor(): string {
  return 'default';
}

function repaint(): void {
  // The inspect state still controls when the extension owns the cursor.
  // A normal arrow is used rather than an image or crosshair.
  document.documentElement.style.cursor = inspectProbe() ? 'default' : '';
}

export function initCustomCursor(isInspectActive: () => boolean): void {
  inspectProbe = isInspectActive;
}

export function applyBaseCursor(): void {
  active = true;
  repaint();
}

export function restoreBaseCursor(): void {
  if (active) repaint();
  else document.documentElement.style.cursor = '';
}

export function clearBaseCursor(): void {
  active = false;
  const current = document.documentElement.style.cursor;
  if (current === 'default' || current === 'crosshair' ||
      current === 'move' || current.includes('image-set(')) {
    document.documentElement.style.cursor = '';
  }
}
