import { el, icon } from '../utils/dom.js';

export function TopBrand() {
  const node = el('div', { class: 'brand' }, [
    el('span', { class: 'brand__mark', 'aria-hidden': 'true' }, icon('leaf')),
    el('span', { class: 'brand__name' }, 'AgriWater-RL'),
  ]);

  return { node };
}
