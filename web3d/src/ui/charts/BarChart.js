/**
 * Biểu đồ cột SVG thuần, hỗ trợ 1 hoặc 2 dãy (so sánh).
 * Cột cuối của dãy chính có thể tô xám = giá trị đang chạy / dự kiến.
 */

import { UI } from '../../config.js';
import { el, svgEl } from '../../utils/dom.js';
import { clamp, formatNumber, niceMax } from '../../utils/math.js';

const { width: W, barHeight: H, barPad: pad } = UI.chart;
const PLOT_W = W - pad.left - pad.right;
const PLOT_H = H - pad.top - pad.bottom;
const BOTTOM = pad.top + PLOT_H;

function barPath(x, top, width, height, radius = 3) {
  const r = Math.min(radius, width / 2, Math.max(height, 0.1));
  return `M ${x} ${BOTTOM} V ${top + r} Q ${x} ${top} ${x + r} ${top} H ${x + width - r} Q ${x + width} ${top} ${x + width} ${top + r} V ${BOTTOM} Z`;
}

export function createBarChart() {
  const content = svgEl('g');
  const svg = svgEl(
    'svg',
    {
      class: 'chart__svg',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Biểu đồ cột lượng nước theo ngày',
    },
    [content],
  );
  const tip = el('div', { class: 'chart__tip', hidden: true });
  const node = el('div', { class: 'chart chart--bar' }, [svg, tip]);

  let labels = [];
  let series = [];
  let top = 10;

  function build(next) {
    labels = next.labels;
    series = next.series;
    const all = series.flatMap((item) => item.values);
    top = niceMax(all, 10);

    content.replaceChildren();
    const count = labels.length;
    if (!count) return;
    const band = PLOT_W / count;

    // Lưới ngang + nhãn trục Y
    for (let step = 0; step <= 4; step += 1) {
      const value = (top / 4) * step;
      const y = BOTTOM - (PLOT_H * step) / 4;
      content.append(
        svgEl('line', { class: 'grid-line', x1: pad.left, y1: y, x2: pad.left + PLOT_W, y2: y }),
        svgEl(
          'text',
          { x: pad.left - 5, y: y + 2.2, 'text-anchor': 'end' },
          formatNumber(value, 0),
        ),
      );
    }

    const groupWidth = band * 0.62;
    const barWidth = series.length > 1 ? groupWidth / series.length - 1 : groupWidth;

    series.forEach((item, seriesIndex) => {
      item.values.forEach((value, index) => {
        const height = (clamp(value, 0, top) / top) * PLOT_H;
        const groupLeft = pad.left + band * index + (band - groupWidth) / 2;
        const x = groupLeft + seriesIndex * (barWidth + 1);
        const isMuted =
          item.muteLast && index === item.values.length - 1 ? ' bar--muted' : '';
        content.append(
          svgEl('path', {
            class: `${item.className ?? 'bar'}${isMuted}`,
            d: barPath(x, BOTTOM - height, barWidth, height),
          }),
        );
      });
    });

    // Nhãn trục X
    labels.forEach((label, index) => {
      content.append(
        svgEl(
          'text',
          {
            class: 'axis-label',
            x: pad.left + band * index + band / 2,
            y: BOTTOM + 9,
            'text-anchor': 'middle',
          },
          String(label),
        ),
      );
    });
  }

  function indexFromEvent(event) {
    if (!labels.length) return -1;
    const box = svg.getBoundingClientRect();
    if (!box.width) return -1;
    const localX = ((event.clientX - box.left) / box.width) * W;
    return clamp(Math.floor((localX - pad.left) / (PLOT_W / labels.length)), 0, labels.length - 1);
  }

  function showTip(index) {
    if (index < 0) return;
    const box = svg.getBoundingClientRect();
    const band = PLOT_W / labels.length;
    const rows = series
      .map((item) => `${item.name}: ${formatNumber(item.values[index], 1)}`)
      .join(' · ');
    tip.hidden = false;
    tip.style.left = `${((pad.left + band * index + band / 2) / W) * box.width}px`;
    tip.style.top = `${(pad.top / H) * box.height}px`;
    tip.innerHTML = `<b>Ngày ${labels[index]}</b><span class="chart__tips"><br>${rows}</span>`;
  }

  function hideTip() {
    tip.hidden = true;
  }

  svg.addEventListener('pointermove', (event) => showTip(indexFromEvent(event)));
  svg.addEventListener('pointerleave', hideTip);

  return {
    node,
    update(next) {
      build(next);
      hideTip();
    },
  };
}
