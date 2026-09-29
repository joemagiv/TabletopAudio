/**
 * Tab bar renderer.
 * @param {object} opts
 * @param {HTMLElement} opts.tabsEl
 * @param {(tabId:string)=>void} opts.onSelect
 */
export function createTabs({ tabsEl, onSelect }) {
  function render(tabs, activeId) {
    tabsEl.innerHTML = '';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.type = 'button';
      b.dataset.id = t.id;
      b.setAttribute('aria-selected', String(t.id === activeId));
      b.textContent = `${t.icon ? t.icon + ' ' : ''}${t.label}`;
      b.addEventListener('click', () => onSelect(t.id));
      tabsEl.appendChild(b);
    }
  }
  return { render };
}
