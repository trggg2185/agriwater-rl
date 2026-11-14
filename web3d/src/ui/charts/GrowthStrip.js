/**
 * Dải sinh trưởng: icon cây tăng dần theo giai đoạn, phần chưa tới mờ xám,
 * thanh nền xanh lá tô đến vị trí hiện tại.
 *
 * Số giai đoạn lấy từ meta (hệ thống hiện có 4, khớp growth_stage 0–3).
 */

import { el, icon } from '../../utils/dom.js';

const ICON_SIZES = [17, 23, 29, 35];

export function createGrowthStrip() {
  const cursor = el('div', { class: 'strip__cursor' });
  const stages = el('div', { class: 'strip__stages' });
  const labels = el('div', { class: 'strip__labels' });
  const track = el('div', { class: 'strip__track' });
  const progress = el('div', { class: 'strip__progress' });
  const node = el('div', { class: 'strip' }, [cursor, stages, labels, track, progress]);

  let stageNodes = [];
  let labelNodes = [];
  let currentIndex = 0;

  function placeCursor() {
    const target = stageNodes[currentIndex];
    if (!target) return;
    const index = stageNodes.indexOf(target);
    cursor.style.width = `${target.offsetWidth}px`;
    cursor.style.transform = `translateX(${target.offsetLeft}px)`;
    void index;
  }

  function update({ stages: names, current, iconName = 'crop-maize' }) {
    currentIndex = Math.max(0, Math.min(names.length - 1, current));

    if (stageNodes.length !== names.length) {
      stages.replaceChildren();
      labels.replaceChildren();
      stageNodes = names.map((_, index) => {
        const size = ICON_SIZES[Math.min(index, ICON_SIZES.length - 1)];
        const iconNode = icon(iconName, 'strip__icon');
        iconNode.style.width = `${size}px`;
        iconNode.style.height = `${size}px`;
        const item = el('div', { class: 'strip__stage' }, [iconNode]);
        stages.append(item);
        return item;
      });
      labelNodes = names.map((name) => {
        const span = el('span', {}, name);
        labels.append(span);
        return span;
      });
    }

    stageNodes.forEach((stageNode, index) => {
      stageNode.classList.toggle('is-future', index > currentIndex);
      stageNode.classList.toggle('is-current', index === currentIndex);
    });
    labelNodes.forEach((labelNode, index) => {
      labelNode.classList.toggle('is-current', index === currentIndex);
    });

    progress.style.width = `${((currentIndex + 1) / names.length) * 100}%`;
    requestAnimationFrame(placeCursor);
  }

  window.addEventListener('resize', placeCursor);

  return { node, update };
}
