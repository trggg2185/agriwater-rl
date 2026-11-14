/**
 * Khối "Đường cong độ ẩm": đường độ ẩm đất + dải lý tưởng + vạch tưới/mưa.
 * (Ảnh mẫu gọi là ET Curve; nội dung đổi sang độ ẩm vì đó là dữ liệu có thật.)
 */

import { el } from '../../utils/dom.js';
import { createLineChart } from '../charts/LineChart.js';

export function createEtCurve() {
  const chart = createLineChart();
  const node = el('section', { class: 'section' }, [
    el('h3', { class: 'section__title' }, 'Đường cong độ ẩm'),
    chart.node,
  ]);

  function update(state) {
    const { meta, series, day } = state;
    const visible = series.slice(0, Math.max(1, day));
    const points = visible.map((record) => ({
      day: record.day,
      value: record.moisture,
      action: record.action,
      water: record.waterLiters,
      rain: record.actualRainMm,
    }));
    const record = visible[visible.length - 1];
    const stage = record ? record.stage : 0;
    const ideal = stage === 2 ? meta.moisture.idealStage2 : meta.moisture.idealDefault;
    chart.update(points, ideal);
  }

  return { node, update };
}
