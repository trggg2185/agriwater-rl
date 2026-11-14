import { el } from '../utils/dom.js';

/** Thương hiệu 2 dòng ở góc trái trên. */
export function TopBrand() {
  const node = el('div', { class: 'brand' }, [
    el('div', { class: 'brand__name' }, 'Hệ thống tưới thông minh'),
    el('div', { class: 'brand__sub' }, 'Nền tảng nông nghiệp AgriWater-RL'),
  ]);

  return { node };
}
