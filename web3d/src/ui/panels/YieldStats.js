import { el } from '../../utils/dom.js';
import { createBarChart } from '../charts/BarChart.js';

export function createYieldStats() {
  const chart = createBarChart();
  const node = el('section', { class: 'section' }, [
    el('h3', { class: 'section__title' }, 'Nước tưới theo ngày (L)'),
    chart.node,
  ]);

  function update({ series, day }) {
    const visible = series.slice(0, day);
    chart.update({
      labels: visible.map((record) => record.day),
      series: [{ name: 'Nước (L)', values: visible.map((record) => record.waterLiters) }],
    });
  }

  return { node, update, destroy: chart.destroy };
}
