import { el } from '../../utils/dom.js';
import { growthWindow } from '../../utils/growth.js';
import { createGrowthStrip } from '../charts/GrowthStrip.js';

export function createAssignmentPlan() {
  const desc = el('p', { class: 'plan__desc' });
  const strip = createGrowthStrip();
  const node = el('section', { class: 'section' }, [
    el('h3', { class: 'section__title' }, 'Giai đoạn sinh trưởng'),
    desc,
    strip.node,
  ]);

  function update(state) {
    const { meta, series, day } = state;
    const record = series[day - 1];
    if (!record) return;
    const { stage } = record;
    const { first, next } = growthWindow(state, record);
    const names = meta.stages;
    desc.textContent = next && names[stage + 1]
      ? `${names[stage]} từ ngày ${first}. ${names[stage + 1]} dự kiến từ ngày ${next}.`
      : `${names[stage]} từ ngày ${first}.`;
    const crop = meta.crops.find((item) => item.code === state.crop);
    strip.update({ stages: names, current: stage, iconName: crop?.icon });
  }

  return { node, update };
}
