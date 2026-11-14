/**
 * Bong bóng nhãn bám theo điểm neo 3D thật của thửa chính.
 *
 * Toạ độ điểm neo do SceneManager chiếu (Vector3.project) mỗi frame và phát qua
 * `scene.onAnchor(...)`, nên khi xoay/zoom camera bong bóng đi theo. Không dùng
 * toạ độ cố định trên màn hình; chỉ fallback khi chưa có scene.
 */

import { el, icon, svgEl } from '../utils/dom.js';

/** Bong bóng nằm chếch lên-trái so với điểm neo (tính bằng px). */
const BUBBLE_OFFSET = { x: 1.35, y: 1.75 };
const ANCHOR_FALLBACK = { x: 0.352, y: 0.556 };

export function createLabels3D(store, scene) {
  const node = el('div', { class: 'labels3d' });

  const svg = svgEl('svg', { class: 'labels3d__svg', 'aria-hidden': 'true' });
  const line = svgEl('line', { class: 'labels3d__line' });
  const halo = svgEl('circle', { class: 'labels3d__halo', r: 16 });
  const ring = svgEl('circle', { class: 'labels3d__ring', r: 7.5 });
  const dot = svgEl('circle', { class: 'labels3d__dot', r: 2.4 });
  svg.append(line, halo, ring, dot);

  const stageLabel = el('strong', { class: 'bubble__stage' }, 'Chín');
  const noteLabel = el('span', { class: 'bubble__note' }, 'Kế hoạch tưới');
  const caption = el('div', { class: 'bubble__caption' }, [stageLabel, noteLabel]);

  const bubbleIcon = icon('crop-maize', 'bubble__icon');
  const bubble = el('div', { class: 'bubble' }, [bubbleIcon]);
  const wrap = el(
    'button',
    { class: 'bubble-wrap', type: 'button', 'aria-label': 'Xem thửa chính' },
    [caption, bubble],
  );

  wrap.addEventListener('click', () => {
    wrap.classList.remove('is-pulsing');
    void wrap.offsetWidth;
    wrap.classList.add('is-pulsing');
    store.setState({ focusPlotAt: Date.now() });
  });

  node.append(svg, wrap);

  let anchor = ANCHOR_FALLBACK;

  function layout() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const radius = (bubble.getBoundingClientRect().width || 96) / 2;
    const ax = anchor.x * width;
    const ay = anchor.y * height;

    // Bong bóng suy ra TỪ điểm neo 3D (không ghim toạ độ màn hình), nên khi
    // xoay/kéo camera nó vẫn bám đúng thửa.
    const cx = Math.min(
      Math.max(ax - radius * BUBBLE_OFFSET.x, radius + 12),
      width - radius - 12,
    );
    const cy = Math.min(
      Math.max(ay - radius * BUBBLE_OFFSET.y, radius + 34),
      height - radius - 12,
    );
    wrap.style.left = `${cx}px`;
    wrap.style.top = `${cy}px`;
    const dx = ax - cx;
    const dy = ay - cy;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;

    line.setAttribute('x1', String(cx + ux * (radius + 3)));
    line.setAttribute('y1', String(cy + uy * (radius + 3)));
    line.setAttribute('x2', String(ax - ux * 11));
    line.setAttribute('y2', String(ay - uy * 11));

    halo.setAttribute('cx', String(ax));
    halo.setAttribute('cy', String(ay));
    ring.setAttribute('cx', String(ax));
    ring.setAttribute('cy', String(ay));
    dot.setAttribute('cx', String(ax));
    dot.setAttribute('cy', String(ay));
  }

  let raf = 0;
  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  }

  const unsubscribe = store.subscribe((state) => {
    const meta = state.meta;
    const record = state.series[Math.min(state.day, state.series.length) - 1];
    const stageIndex = record ? record.stage : 0;
    const crop = meta.crops.find((item) => item.code === state.crop) ?? meta.crops[0];

    stageLabel.textContent = meta.stages[stageIndex] ?? '';
    bubbleIcon.className = `icon icon--${crop.icon} bubble__icon`;
    schedule();
  });

  const detachAnchor = scene?.onAnchor
    ? scene.onAnchor((next) => {
        anchor = next;
        schedule();
      })
    : () => {};

  const onResize = () => schedule();
  window.addEventListener('resize', onResize);

  return {
    node,
    destroy() {
      unsubscribe();
      detachAnchor();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    },
  };
}
