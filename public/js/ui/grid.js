import { createButton } from './button.js';

/**
 * Grid renderer with keyed reconciliation by item id. Because audio lives in the
 * engine (not the DOM), rebuilding/reflowing here never interrupts playback.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.gridEl
 * @param {object} opts.engine
 * @param {object} opts.handlers  { onToggleLoop, onOpenSettings, onTap }
 */
export function createGrid({ gridEl, engine, handlers }) {
  /** @type {Map<string, object>} itemId -> button */
  const buttons = new Map();

  function render(tab, items) {
    // Remove buttons for items no longer present.
    const present = new Set(items.map((i) => i.id));
    for (const [id, btn] of buttons) {
      if (!present.has(id)) {
        btn.el.remove();
        buttons.delete(id);
      }
    }

    // Add/update in order (appendChild moves existing nodes into place).
    if (items.length === 0) {
      gridEl.innerHTML = '<div class="empty">No sounds in this tab yet. Drop audio files into the library folder.</div>';
      return;
    }
    const empty = gridEl.querySelector('.empty');
    if (empty) empty.remove();

    for (const item of items) {
      let btn = buttons.get(item.id);
      if (!btn) {
        btn = createButton({ item, tab, engine, ...handlers });
        buttons.set(item.id, btn);
      } else {
        btn.update(item);
      }
      gridEl.appendChild(btn.el);
    }
  }

  function getButton(id) {
    return buttons.get(id);
  }

  return { render, getButton };
}
