import { el, icon } from '../../utils/dom.js';

const ICON_SIZES = [17, 23, 29, 35];

export function createGrowthStrip() {
  const stages = el('div', { class: 'strip__stages', 'aria-label': 'Giai đoạn sinh trưởng' });
  const track = el('div', { class: 'strip__track', 'aria-hidden': 'true' });
  const progress = el('div', { class: 'strip__progress', 'aria-hidden': 'true' });
  const node = el('div', { class: 'strip' }, [stages, track, progress]);
  let items = [];
  let builtIcon;

  function update({ stages: names, current, iconName = 'crop-maize' }) {
    if (items.length !== names.length || iconName !== builtIcon) {
      builtIcon = iconName;
      items = names.map((name, index) => {
        const size = ICON_SIZES[Math.min(index, ICON_SIZES.length - 1)];
        const symbol = icon(iconName, 'strip__icon');
        symbol.style.width = symbol.style.height = `${size}px`;
        const label = el('span', { class: 'strip__label' }, name);
        const stage = el('div', { class: 'strip__stage' }, [
          el('div', { class: 'strip__icon-frame' }, symbol),
          label,
        ]);
        return { stage, label };
      });
      stages.replaceChildren(...items.map(({ stage }) => stage));
      stages.style.setProperty('--stage-count', Math.max(1, names.length));
    }

    const active = Math.max(0, Math.min(names.length - 1, current));
    items.forEach(({ stage, label }, index) => {
      label.textContent = names[index];
      stage.classList.toggle('is-future', index > active);
      stage.classList.toggle('is-current', index === active);
      if (index === active) stage.setAttribute('aria-current', 'step');
      else stage.removeAttribute('aria-current');
    });
    progress.style.width = names.length ? `${(active + 1) / names.length * 100}%` : '0%';
  }

  return { node, update };
}
