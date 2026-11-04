// Keep the Add Element panel visible when opened from a scrolled Layers tree.
// This is intentionally presentation-only; the editor keeps its existing
// builder, insertion, selection and history logic.
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('[data-dm-action="toggle-builder"]');
  if (!button) return;
  const wasOpen = !!document.querySelector('section[aria-label="Add elements"]');
  if (wasOpen) return;
  // The existing click handler switches to Layers and renders synchronously.
  // Restore the top after that render so the insertion target is immediately
  // visible, even when the Layers tree had been scrolled far down.
  requestAnimationFrame(() => {
    const body = document.getElementById('dm-tab-body');
    const builder = body?.querySelector('section[aria-label="Add elements"]');
    if (body && builder) {
      body.scrollTop = 0;
      body.scrollLeft = 0;
    }
  });
}, true);
