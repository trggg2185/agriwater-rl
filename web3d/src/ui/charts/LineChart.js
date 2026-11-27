import { formatNumber } from '../../utils/math.js';
import { chartCanvas } from './ChartCanvas.js';

export function createLineChart() {
  let points = [];
  let ideal = [0, 1];
  const bands = {
    id: 'moistureBands',
    beforeDraw({ ctx, chartArea, scales }) {
      if (!chartArea || !points.length) return;
      const { left, top, right, bottom, width, height } = chartArea;
      const band = width / points.length;
      const high = scales.y.getPixelForValue(ideal[1] * 100);
      const low = scales.y.getPixelForValue(ideal[0] * 100);

      ctx.save();
      ctx.fillStyle = '#a8b9c460';
      for (let index = 0; index < points.length; index += 2) {
        ctx.fillRect(left + index * band, top, band, height);
      }
      ctx.fillStyle = '#97aebd60';
      ctx.fillRect(left, high, width, low - high);
      ctx.strokeStyle = '#8298a8';
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(left, high);
      ctx.lineTo(right, high);
      ctx.moveTo(left, low);
      ctx.lineTo(right, low);
      ctx.stroke();

      points.forEach((point, index) => {
        const center = left + (index + .5) * band;
        if (point.action > 0) {
          ctx.fillStyle = '#5b6d826e';
          ctx.beginPath();
          ctx.moveTo(center - 3.5, bottom);
          ctx.lineTo(center, bottom - 8);
          ctx.lineTo(center + 3.5, bottom);
          ctx.fill();
        }
        if (point.rain > 0) {
          ctx.fillStyle = '#476582';
          ctx.fillRect(center - 1, bottom - 12, 2, 4);
        }
      });
      ctx.restore();
    },
  };
  const chart = chartCanvas('line', 'Đường độ ẩm đất theo từng ngày mô phỏng', { plugins: [bands] });

  return {
    node: chart.node,
    destroy: chart.destroy,
    update(nextPoints, nextIdeal) {
      points = nextPoints;
      ideal = nextIdeal;
      chart.update(points.map(({ day }) => day), [{
        data: points.map(({ value }) => value * 100),
        stepped: 'before',
        fill: true,
        backgroundColor: '#47658216',
        borderColor: '#51687b',
        borderWidth: 1.8,
        pointRadius: 2.15,
        pointHoverRadius: 4,
        pointBorderWidth: 1.4,
        pointBorderColor: '#51687b',
        pointBackgroundColor: '#fff',
      }], { min: 0, max: 100 }, {
        callbacks: {
          title: ([item]) => `Ngày ${item.label}`,
          label: ({ raw }) => `Độ ẩm ${formatNumber(raw, 1)}%`,
          afterLabel: ({ dataIndex }) => {
            const { water, rain } = points[dataIndex];
            return `Tưới ${formatNumber(water, 0)} L · Mưa ${formatNumber(rain, 1)} mm`;
          },
        },
      });
    },
  };
}
