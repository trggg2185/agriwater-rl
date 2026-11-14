/**
 * Biểu đồ đường SVG thuần (không Chart.js).
 * Nhận dữ liệu đã chuẩn hoá 0–1 và tự vẽ trục 0–100 %.
 */

import { UI } from '../../config.js';
import { el, svgEl } from '../../utils/dom.js';
import { clamp, formatNumber } from '../../utils/math.js';

const { width: W, lineHeight: H, pad } = UI.chart;
const PLOT_W = W - pad.left - pad.right;
const PLOT_H = H - pad.top - pad.bottom;
const BOTTOM = pad.top + PLOT_H;

const yFor = (value) => pad.top + PLOT_H * (1 - clamp(value, 0, 1));
const bandOf = (count) => PLOT_W / Math.max(1, count);

export function createLineChart() {
  const content = svgEl('g');
  const cursor = svgEl('line', { class: 'chart__cursor', x1: -20, y1: pad.top, x2: -20, y2: BOTTOM });

  const defs = svgEl('defs', {}, [
    svgEl('linearGradient', { id: 'areaGradient', x1: '0', y1: '0', x2: '0', y2: '1' }, [
      svgEl('stop', { offset: '0%', 'stop-color': UI.colors.chartBlue, 'stop-opacity': '0.26' }),
      svgEl('stop', { offset: '100%', 'stop-color': UI.colors.chartBlue, 'stop-opacity': '0' }),
    ]),
  ]);

  const svg = svgEl(
    'svg',
    {
      class: 'chart__svg',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Đường độ ẩm đất theo từng ngày mô phỏng',
    },
    [defs, content, cursor],
  );

  const tip = el('div', { class: 'chart__tip', hidden: true });
  const node = el('div', { class: 'chart chart--line' }, [svg, tip]);

  let points = [];

  function build(nextPoints, ideal) {
    points = nextPoints;
    content.replaceChildren();
    const count = points.length;
    const band = bandOf(count);

    // Cột nền xanh dương xen kẽ
    for (let index = 0; index < count; index += 1) {
      if (index % 2 === 0) {
        content.append(
          svgEl('rect', {
            class: 'band',
            x: pad.left + band * index,
            y: pad.top,
            width: band,
            height: PLOT_H,
          }),
        );
      }
    }

    // Dải vùng lý tưởng (lấy từ config)
    const top = yFor(ideal[1]);
    const bottom = yFor(ideal[0]);
    content.append(
      svgEl('rect', {
        class: 'ideal-band',
        x: pad.left,
        y: top,
        width: PLOT_W,
        height: Math.max(0, bottom - top),
      }),
      svgEl('line', { class: 'ideal-edge', x1: pad.left, y1: top, x2: pad.left + PLOT_W, y2: top }),
      svgEl('line', {
        class: 'ideal-edge',
        x1: pad.left,
        y1: bottom,
        x2: pad.left + PLOT_W,
        y2: bottom,
      }),
    );

    // Lưới ngang + nhãn trục Y 0–100
    for (let step = 0; step <= 5; step += 1) {
      const value = step / 5;
      const y = yFor(value);
      content.append(
        svgEl('line', { class: 'grid-line', x1: pad.left, y1: y, x2: pad.left + PLOT_W, y2: y }),
        svgEl('text', { x: pad.left - 6, y: y + 2.4, 'text-anchor': 'end' }, String(value * 100)),
      );
    }

    if (!count) return;

    // Đường bậc thang + vùng phủ
    let path = `M ${pad.left} ${yFor(points[0].value)}`;
    for (let index = 1; index < count; index += 1) {
      path += ` H ${pad.left + band * index} V ${yFor(points[index].value)}`;
    }
    path += ` H ${pad.left + PLOT_W}`;

    content.append(
      svgEl('path', {
        class: 'line-area',
        d: `${path} L ${pad.left + PLOT_W} ${BOTTOM} L ${pad.left} ${BOTTOM} Z`,
      }),
      svgEl('path', { class: 'line-path', d: path }),
    );

    // Chấm tại mỗi ngày
    points.forEach((point, index) => {
      content.append(
        svgEl('circle', {
          class: 'line-dot',
          cx: pad.left + band * index + band / 2,
          cy: yFor(point.value),
          r: 1.9,
        }),
      );
    });

    // Vạch đánh dấu tưới / mưa dưới chân biểu đồ
    points.forEach((point, index) => {
      const center = pad.left + band * index + band / 2;
      if (point.rain > 0) {
        content.append(
          svgEl('rect', {
            class: 'marker-rain',
            x: center - 1.4,
            y: BOTTOM - 8.5,
            width: 2.8,
            height: 3.4,
            rx: 1.2,
          }),
        );
      }
      if (point.action > 0) {
        content.append(
          svgEl('rect', {
            class: 'marker-irrigation',
            x: center - 2.6,
            y: BOTTOM - 3.6,
            width: 5.2,
            height: 3,
            rx: 1.2,
          }),
        );
      }
    });

    // Nhãn trục X
    const labelStep = Math.max(1, Math.ceil(count / 7));
    points.forEach((point, index) => {
      if (index % labelStep !== 0 && index !== count - 1) return;
      content.append(
        svgEl(
          'text',
          {
            class: 'axis-label',
            x: pad.left + band * index + band / 2,
            y: BOTTOM + 9,
            'text-anchor': 'middle',
          },
          String(point.day),
        ),
      );
    });

  }

  function indexFromEvent(event) {
    if (!points.length) return -1;
    const box = svg.getBoundingClientRect();
    if (!box.width) return -1;
    const localX = ((event.clientX - box.left) / box.width) * W;
    const index = Math.floor((localX - pad.left) / bandOf(points.length));
    return clamp(index, 0, points.length - 1);
  }

  function showTip(index) {
    const point = points[index];
    if (!point) return;
    const band = bandOf(points.length);
    const box = svg.getBoundingClientRect();

    cursor.setAttribute('x1', String(pad.left + band * index + band / 2));
    cursor.setAttribute('x2', String(pad.left + band * index + band / 2));

    tip.hidden = false;
    tip.style.left = `${((pad.left + band * index + band / 2) / W) * box.width}px`;
    tip.style.top = `${(yFor(point.value) / H) * box.height}px`;
    tip.innerHTML = `<b>Ngày ${point.day}</b> · ${formatNumber(point.value * 100, 1)} %<span class="chart__tips"><br>Tưới ${formatNumber(point.water, 0)} L · Mưa ${formatNumber(point.rain, 1)} mm</span>`;
  }

  function hideTip() {
    tip.hidden = true;
    cursor.setAttribute('x1', '-20');
    cursor.setAttribute('x2', '-20');
  }

  svg.addEventListener('pointermove', (event) => showTip(indexFromEvent(event)));
  svg.addEventListener('pointerleave', hideTip);

  return {
    node,
    update(nextPoints, ideal) {
      build(nextPoints, ideal);
      hideTip();
    },
  };
}
