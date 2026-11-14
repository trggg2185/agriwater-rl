/**
 * Khối "Kế hoạch tưới": câu mô tả suy từ growth_stage_days, dải sinh trưởng,
 * và popover AI Advice với 6 mức nước lấy từ action_liters.
 */

import { el, icon } from '../../utils/dom.js';
import { formatNumber } from '../../utils/math.js';
import { createGrowthStrip } from '../charts/GrowthStrip.js';

function describe(meta, stage) {
  const milestones = meta.growthStageDays;
  const names = meta.stages;
  const startDay = stage === 0 ? 1 : milestones[stage - 1];
  if (stage >= names.length - 1) {
    return `Đã đạt giai đoạn ${names[stage]} (từ ngày ${startDay}).`;
  }
  return `${names[stage]} từ ngày ${startDay}; ${names[stage + 1].toLowerCase()} dự kiến từ ngày ${milestones[stage]}.`;
}

function adviceReason(record, previous) {
  if (!record) return 'Chưa có dữ liệu ngày này.';
  if (record.rainProbability >= 0.7 && record.rainForecastMm >= 15) {
    return 'Dự báo mưa lớn — nên hoãn tưới để tránh bị phạt R_rain.';
  }
  if (previous && previous.waterLiters >= 12.5) {
    return 'Vừa tưới từ 12,5 L trở lên — tưới tiếp sẽ bị phạt R_delay.';
  }
  if (record.moisture >= 0.6) {
    return 'Đất còn ẩm — tưới thêm sẽ bị phạt lãng phí R_waste.';
  }
  if (record.moisture < 0.38) {
    return 'Độ ẩm dưới vùng lý tưởng — nên tưới để tránh R_stress.';
  }
  return 'Độ ẩm trong vùng lý tưởng — chưa cần tưới.';
}

export function createAssignmentPlan(store) {
  const desc = el('p', { class: 'plan__desc' }, '—');
  const strip = createGrowthStrip();

  const levels = el('div', { class: 'advice__levels' });
  const reason = el('p', { class: 'advice__reason' }, '');
  const pop = el('div', { class: 'advice__pop', hidden: true }, [
    el('div', { class: 'advice__title' }, 'Mức tưới (lít)'),
    levels,
    reason,
  ]);

  const link = el(
    'button',
    { class: 'advice__link', type: 'button', 'aria-expanded': 'false' },
    [icon('spark'), 'AI Advice'],
  );

  link.addEventListener('click', () => {
    const open = pop.hidden;
    pop.hidden = !open;
    link.setAttribute('aria-expanded', String(open));
  });

  let levelButtons = [];

  function buildLevels(actionLiters) {
    levels.replaceChildren();
    levelButtons = actionLiters.map((liters) => {
      const button = el('button', { class: 'advice__level', type: 'button' }, String(liters));
      button.addEventListener('click', () => store.setState({ previewAction: liters }));
      levels.append(button);
      return button;
    });
  }

  const head = el('div', { class: 'section__head' }, [
    el('h3', { class: 'section__title' }, 'Kế hoạch tưới'),
    el('div', { class: 'advice' }, [link, pop]),
  ]);

  const node = el('section', { class: 'section' }, [head, desc, strip.node]);

  function update(state) {
    const { meta, series, day } = state;
    const visible = series.slice(0, Math.max(1, day));
    const record = visible[visible.length - 1];
    const previous = visible[visible.length - 2];
    if (!record) return;

    desc.textContent = `${describe(meta, record.stage)} Độ ẩm ${formatNumber(record.moisture * 100, 0)} %.`;
    strip.update({ stages: meta.stages, current: record.stage, iconName: 'crop-maize' });

    if (levelButtons.length !== meta.actionLiters.length) buildLevels(meta.actionLiters);
    const selected = state.previewAction ?? record.waterLiters;
    levelButtons.forEach((button, index) => {
      button.classList.toggle('is-active', meta.actionLiters[index] === selected);
    });
    const manual = state.previewAction != null;
    reason.textContent = `${adviceReason(record, previous)}${
      manual
        ? ' Đang xem trước mức bạn chọn — dữ liệu mô phỏng không đổi.'
        : ' Mức này lấy từ hành động của agent trong dữ liệu.'
    }`;
  }

  return { node, update };
}
