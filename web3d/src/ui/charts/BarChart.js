import { formatNumber, niceMax } from '../../utils/math.js';
import { chartCanvas } from './ChartCanvas.js';

export function createBarChart() {
  const chart = chartCanvas('bar', 'Biểu đồ cột lượng nước theo ngày', {});
  let paint;

  return {
    node: chart.node,
    destroy: chart.destroy,
    update({ labels, series }) {
      const datasets = series.map((item) => ({
        label: item.name,
        data: item.values,
        borderSkipped: false,
        borderRadius: { topLeft: 5, topRight: 5 },
        backgroundColor({ chart, dataIndex }) {
          if (item.className === 'bar-baseline' || (item.muteLast && dataIndex === item.values.length - 1)) {
            return '#aab9c8';
          }
          const area = chart.chartArea;
          if (!area) return '#476582';
          if (!paint || paint.top !== area.top || paint.bottom !== area.bottom) {
            const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            gradient.addColorStop(0, '#6b86a3');
            gradient.addColorStop(1, '#334f6c');
            paint = { top: area.top, bottom: area.bottom, gradient };
          }
          return paint.gradient;
        },
      }));
      chart.update(labels, datasets, { max: Math.max(20, niceMax(series.flatMap(({ values }) => values), 20)) }, {
        callbacks: {
          title: ([item]) => `Ngày ${item.label}`,
          label: ({ dataset, raw }) => `${dataset.label}: ${formatNumber(raw, 1)}`,
        },
      });
    },
  };
}
