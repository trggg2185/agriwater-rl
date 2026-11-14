/**
 * Khối "Thống kê": cột nước tưới theo ngày, cột cuối xám = ngày đang chạy.
 * Ở view "Tưới thông minh" chuyển sang cột đôi (tưới so với mưa) để sẵn đường
 * cho so sánh hai agent ở giai đoạn 3.
 */

import { el } from '../../utils/dom.js';
import { createBarChart } from '../charts/BarChart.js';

export function createYieldStats() {
  const chart = createBarChart();
  const legend = el('div', { class: 'legend' });
  const head = el('div', { class: 'section__head' }, [
    el('h3', { class: 'section__title' }, 'Thống kê'),
    legend,
  ]);
  const hint = el('p', { class: 'section__hint' }, 'Lượng nước tưới theo ngày (lít).');
  const node = el('section', { class: 'section' }, [head, hint, chart.node]);

  function legendItem(label, muted = false) {
    return el('span', { class: 'legend' }, [
      el('span', { class: `legend__dot${muted ? ' legend__dot--muted' : ''}` }),
      label,
    ]);
  }

  function update(state) {
    const { meta, series, day, view, activeTab } = state;
    const visible = series.slice(0, Math.max(1, day));
    const window = visible.slice(-7);
    const labels = window.map((record) => record.day);
    const crop = meta.crops.find((item) => item.key === activeTab);

    if (view === 'smart') {
      legend.replaceChildren(legendItem('Tưới (L)'), legendItem('Mưa (mm)', true));
      hint.textContent = 'So sánh nước tưới và nước mưa theo ngày.';
      chart.update({
        labels,
        series: [
          { name: 'Tưới (L)', values: window.map((record) => record.waterLiters), className: 'bar' },
          {
            name: 'Mưa (mm)',
            values: window.map((record) => record.actualRainMm),
            className: 'bar-baseline',
          },
        ],
      });
      return;
    }

    legend.replaceChildren(legendItem(crop ? crop.label : 'Ngô'));
    hint.textContent = 'Cột xám là ngày đang chạy, chưa đủ dữ liệu.';
    chart.update({
      labels,
      series: [
        {
          name: 'Nước (L)',
          values: window.map((record) => record.waterLiters),
          className: 'bar',
          muteLast: true,
        },
      ],
    });
  }

  return { node, update };
}
