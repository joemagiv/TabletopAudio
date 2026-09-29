/**
 * Sticky master bar: Music / SFX / Master volume sliders + Stop All.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.el
 * @param {object} opts.engine
 * @param {{master:number,music:number,sfx:number}} opts.volumes
 * @param {number} opts.buttonScale
 * @param {(key:string, value:number)=>void} opts.onVolumeChange
 * @param {(value:number)=>void} opts.onButtonScale
 * @param {()=>void} opts.onStopAll
 */
export function createMasterBar({ el, engine, volumes, buttonScale, onVolumeChange, onButtonScale, onStopAll }) {
  el.innerHTML = '';
  const defs = [
    ['music', '🔊 Music'],
    ['sfx', '🔊 SFX'],
    ['master', '🔊 Master'],
  ];
  const inputs = {};

  for (const [key, label] of defs) {
    const wrap = document.createElement('div');
    wrap.className = 'vol';
    const lab = document.createElement('label');
    lab.textContent = label;
    lab.htmlFor = `vol-${key}`;
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `vol-${key}`;
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = String(volumes[key] ?? 1);
    input.setAttribute('aria-label', `${label} volume`);
    input.addEventListener('input', () => onVolumeChange(key, parseFloat(input.value)));
    wrap.append(lab, input);
    el.appendChild(wrap);
    inputs[key] = input;
  }

  const stop = document.createElement('button');
  stop.className = 'stop-all';
  stop.type = 'button';
  stop.textContent = '■ Stop All';
  stop.setAttribute('aria-label', 'Stop all audio');
  stop.addEventListener('click', onStopAll);

  // Button size slider.
  const sizeWrap = document.createElement('div');
  sizeWrap.className = 'vol';
  const sizeLab = document.createElement('label');
  sizeLab.textContent = '🔲 Buttons';
  sizeLab.htmlFor = 'vol-scale';
  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.id = 'vol-scale';
  sizeInput.min = '0.6';
  sizeInput.max = '1.6';
  sizeInput.step = '0.05';
  sizeInput.value = String(buttonScale ?? 1);
  sizeInput.setAttribute('aria-label', 'Button size');
  sizeInput.addEventListener('input', () => onButtonScale(parseFloat(sizeInput.value)));
  sizeWrap.append(sizeLab, sizeInput);
  el.append(sizeWrap, stop);

  function setVolume(key, value) {
    if (inputs[key]) inputs[key].value = String(value);
  }

  function setButtonScale(value) {
    sizeInput.value = String(value);
  }

  return { setVolume, setButtonScale };
}
