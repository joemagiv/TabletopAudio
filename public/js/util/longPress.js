/**
 * Attach tap + long-press handling to an element using Pointer Events.
 *
 * - `onTap` fires on pointerup if the pointer didn't move much and a long-press
 *   didn't already fire.
 * - `onLongPress` fires after `delay` ms of holding still. The subsequent tap is
 *   suppressed.
 * - Keyboard activation (Enter/Space) generates a click with detail === 0, which
 *   also triggers `onTap`.
 *
 * Scrolling is allowed: movement beyond the threshold cancels both tap and
 * long-press.
 *
 * @param {HTMLElement} el
 * @param {{onTap?:Function, onLongPress?:Function, delay?:number}} handlers
 * @returns {() => void} cleanup
 */
export function attachLongPress(el, { onTap, onLongPress, delay = 500 } = {}) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let longFired = false;
  let moved = false;
  let pointerActive = false;
  let lastPointerTap = 0;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const onDown = (e) => {
    // Only primary button / touch.
    if (e.button !== undefined && e.button !== 0) return;
    pointerActive = true;
    longFired = false;
    moved = false;
    const pt = e;
    startX = pt.clientX;
    startY = pt.clientY;
    clear();
    timer = setTimeout(() => {
      longFired = true;
      if (onLongPress) onLongPress(e);
    }, delay);
  };

  const onMove = (e) => {
    if (!pointerActive) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > 10) {
      moved = true;
      clear();
    }
  };

  const onUp = () => {
    if (!pointerActive) return;
    pointerActive = false;
    clear();
    if (longFired || moved) return;
    lastPointerTap = performance.now();
    if (onTap) onTap();
  };

  const onCancel = () => {
    pointerActive = false;
    clear();
  };

  const onClick = (e) => {
    // Keyboard activation produces a click with detail === 0. Touch also
    // synthesizes a click with detail === 0 right after pointerup, so ignore
    // those to avoid a double tap.
    if (e.detail !== 0) return;
    if (performance.now() - lastPointerTap < 600) return;
    if (onTap) onTap();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onCancel);
  el.addEventListener('click', onClick);

  return () => {
    clear();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('pointerleave', onCancel);
    el.removeEventListener('click', onClick);
  };
}
