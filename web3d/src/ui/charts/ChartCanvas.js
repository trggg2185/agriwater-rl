import {
  BarController, BarElement, CategoryScale, Chart, Filler, LinearScale,
  LineController, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { el } from '../../utils/dom.js';

Chart.register(
  BarController, BarElement, CategoryScale, Filler, LinearScale,
  LineController, LineElement, PointElement, Tooltip,
);

const font = { family: "'JetBrains Mono', monospace", size: 10 };

export function chartCanvas(type, description, settings) {
  const canvas = el('canvas', { role: 'img', 'aria-label': description });
  const node = el('div', { class: `chart chart--${type}` }, canvas);
  let chart;

  function update(labels, datasets, scales, plugins) {
    if (!chart) {
      chart = new Chart(canvas, {
        type,
        data: { labels, datasets },
        plugins: settings.plugins,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          normalized: true,
          font,
          color: '#475569',
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              offset: true,
              grid: { display: false },
              border: { display: false },
              ticks: {
                autoSkip: false,
                maxRotation: 0,
                callback(value, index, ticks) {
                  const interval = Math.max(1, Math.ceil(ticks.length / 7));
                  return index % interval === 0 || index === ticks.length - 1
                    ? this.getLabelForValue(value)
                    : '';
                },
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: '#33415524', tickLength: 5 },
              border: { display: false },
              ticks: { maxTicksLimit: 6, precision: 0 },
              ...scales,
            },
          },
          plugins: { tooltip: { padding: 8, ...plugins } },
        },
      });
      return;
    }

    chart.data.labels = labels;
    chart.data.datasets = datasets;
    Object.assign(chart.options.scales.y, scales);
    Object.assign(chart.options.plugins.tooltip, plugins);
    chart.update('none');
  }

  return { node, update, destroy: () => chart?.destroy() };
}
