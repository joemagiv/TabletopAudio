/**
 * Bottom sheet for editing a single item (label, volume, loop, reset).
 *
 * @param {object} opts
 * @param {HTMLElement} opts.sheetEl
 * @param {HTMLElement} opts.backdropEl
 * @param {(patch:object)=>void} opts.onSave   called with {loop?|volume?|label?}
 * @param {()=>void} opts.onReset              clears server overrides for item
 * @param {()=>void} [opts.onClose]
 */
export function createSettingsSheet({ sheetEl, backdropEl, onSave, onReset, onClose }) {
  let currentItem = null;

  function field(labelText) {
    const f = document.createElement('div');
    f.className = 'field';
    const l = document.createElement('label');
    l.textContent = labelText;
    f.appendChild(l);
    return f;
  }

  function open(item) {
    currentItem = item;
    sheetEl.innerHTML = '';
    sheetEl.hidden = false;
    backdropEl.hidden = false;

    const h = document.createElement('h2');
    h.textContent = `Edit: ${item.label}`;

    // Name
    const f1 = field('Name');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = item.label;
    nameInput.maxLength = 100;
    nameInput.setAttribute('aria-label', 'Sound name');
    let nameTimer = null;
    nameInput.addEventListener('input', () => {
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => onSave({ label: nameInput.value }), 250);
    });
    f1.appendChild(nameInput);

    // Loop
    const f2 = field('Loop');
    const toggle = document.createElement('label');
    toggle.className = 'toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.loop;
    cb.setAttribute('aria-label', 'Loop');
    const span = document.createElement('span');
    span.textContent = item.loop ? 'Loops' : 'Plays once';
    cb.addEventListener('change', () => {
      span.textContent = cb.checked ? 'Loops' : 'Plays once';
      onSave({ loop: cb.checked });
    });
    toggle.append(cb, span);
    f2.appendChild(toggle);

    // Volume
    const f3 = field('Volume');
    const volRow = document.createElement('div');
    volRow.className = 'row';
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '1';
    vol.step = '0.01';
    vol.value = String(item.volume);
    vol.setAttribute('aria-label', 'Volume');
    const vlabel = document.createElement('span');
    vlabel.textContent = `${Math.round(item.volume * 100)}%`;
    vol.addEventListener('input', () => {
      const v = parseFloat(vol.value);
      vlabel.textContent = `${Math.round(v * 100)}%`;
      onSave({ volume: v });
    });
    volRow.append(vol, vlabel);
    f3.appendChild(volRow);

    // Buttons
    const row = document.createElement('div');
    row.className = 'row';
    row.style.justifyContent = 'space-between';
    const reset = document.createElement('button');
    reset.className = 'action danger';
    reset.type = 'button';
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => {
      onReset();
      close();
    });
    const done = document.createElement('button');
    done.className = 'action primary';
    done.type = 'button';
    done.textContent = 'Done';
    done.addEventListener('click', close);
    row.append(reset, done);

    sheetEl.append(h, f1, f2, f3, row);
  }

  function close() {
    sheetEl.hidden = true;
    backdropEl.hidden = true;
    currentItem = null;
    if (onClose) onClose();
  }

  backdropEl.addEventListener('click', close);

  return { open, close, isOpen: () => !!currentItem };
}
