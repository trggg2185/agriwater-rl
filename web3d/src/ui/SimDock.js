/**
 * Dòng thời gian và điều khiển của thửa canh tác.
 */

import { SCENE, UI } from '../config.js';
import { irrigationBlock } from '../utils/irrigationZones.js';
import { seek } from '../data/playback.js';
import { el, icon } from '../utils/dom.js';

export function SimDock(store, actions) {
  const day = el('span', { class: 'dock__day' });
  const slider = el('input', {
    class: 'dock__range', type: 'range', min: '1', step: '1', 'aria-label': 'Ngày mô phỏng',
  });
  const previous = el('button', {
    class: 'dock__btn', type: 'button', 'aria-label': 'Ngày trước',
  }, icon('chevron', 'dock__arrow--prev'));
  const nextLabel = el('span', {}, 'Ngày tiếp');
  const next = el('button', {
    class: 'dock__btn is-primary dock__next', type: 'button', 'aria-label': 'Ngày tiếp',
  }, [nextLabel, icon('chevron', 'dock__arrow--next')]);
  function goToDay(value) {
    if (store.getState().simulationBusy) return;
    store.setState({ playing: false, previewAction: null });
    seek(store, value);
  }
  slider.addEventListener('input', () => goToDay(Number(slider.value)));
  previous.addEventListener('click', () => goToDay(store.getState().day - 1));
  next.addEventListener('click', () => {
    const state = store.getState();
    if (state.day < state.series.length) {
      goToDay(state.day + 1);
    } else if (state.dataSource === 'api') {
      const last = state.series.at(-1);
      if (last?.terminated || last?.truncated) void actions.regenerate();
      else actions.stepDay();
    }
  });
  const timeline = el('div', { class: 'dock__timeline' }, [
    el('div', { class: 'dock__timeline-head' }, [
      day, el('div', { class: 'dock__days' }, [previous, next]),
    ]),
    slider,
  ]);

  const playButton = el(
    'button',
    { class: 'dock__btn is-primary', type: 'button', 'aria-label': 'Phát hoặc tạm dừng mô phỏng' },
    [icon('play')],
  );
  playButton.addEventListener('click', () => {
    store.setState((state) => ({ playing: !state.playing }));
  });

  const speedGroup = el('div', { class: 'dock__speeds', role: 'group', 'aria-label': 'Tốc độ phát' });
  const speedButtons = UI.speeds.map((speed) => {
    const button = el(
      'button',
      { class: 'dock__speed', type: 'button', 'aria-label': `Tốc độ x${speed}` },
      `x${speed}`,
    );
    button.addEventListener('click', () => store.setState({ speed }));
    speedGroup.append(button);
    return { button, speed };
  });

  const moreButton = el(
    'button',
    { class: 'dock__more', type: 'button', 'aria-label': 'Mở rộng điều khiển mô phỏng', 'aria-expanded': 'false' },
    [icon('chevron')],
  );

  // Mức nước thủ công: luôn thấy trong pill thu gọn để có ngay lựa chọn
  // "Không tưới" (mức 0) có thể được chọn cho ngày kế tiếp.
  const waterSelect = el('select', {
    class: 'dock__select dock__select--water',
    'aria-label': 'Mức nước tưới (0 = không tưới)',
  });
  let waterBuilt = false;

  function buildWaterOptions(actionLiters) {
    waterSelect.replaceChildren();
    waterSelect.append(el('option', { value: 'auto' }, 'Tưới: theo dữ liệu'));
    for (const liters of actionLiters) {
      waterSelect.append(
        el(
          'option',
          { value: String(liters) },
          liters === 0 ? 'Không tưới (0 L)' : `Tưới ${liters} L`,
        ),
      );
    }
    waterBuilt = true;
  }

  waterSelect.addEventListener('change', () => {
    const value = waterSelect.value;
    actions.selectIrrigation(value === 'auto' ? null : Number(value));
  });

  const policySelect = el('select', {
    class: 'dock__select dock__select--policy',
    'aria-label': 'Chính sách tưới tự động',
  }, [
    el('option', { value: 'baseline' }, 'Policy: Baseline'),
    el('option', { value: 'q_learning' }, 'Policy: Q-Learning (ε=0)'),
  ]);
  policySelect.addEventListener('change', () => {
    void actions.selectPolicy?.(policySelect.value);
  });

  const pill = el('div', { class: 'dock__pill' }, [playButton, speedGroup, waterSelect, policySelect, moreButton]);

  const resetButton = el(
    'button',
    { class: 'dock__btn', type: 'button', 'aria-label': 'Đặt lại về ngày 1' },
    [icon('refresh')],
  );
  resetButton.addEventListener('click', () => goToDay(1));

  const modeSelect = el('select', { class: 'dock__select', 'aria-label': 'Chế độ dữ liệu' }, [
    el('option', { value: 'replay' }, 'Phát lại'),
    el('option', { value: 'live' }, 'Live (backend)'),
  ]);
  modeSelect.addEventListener('change', async () => {
    const offline = modeSelect.value === 'replay';
    await actions.regenerate({}, { keepDay: true, offline });
    if (!offline && store.getState().dataSource !== 'api') {
      actions.notify('Chưa kết nối FastAPI. Đang phát lại dữ liệu có sẵn.');
    }
  });

  const panel = el('div', { class: 'dock__panel' }, [resetButton, modeSelect]);

  const status = el('p', { class: 'dock__status', role: 'status', hidden: true });
  const node = el('div', { class: 'dock' }, [timeline, pill, status, panel]);

  moreButton.addEventListener('click', () => {
    const open = node.classList.toggle('is-open');
    moreButton.setAttribute('aria-expanded', String(open));
  });

  function update(state) {
    const recorded = Math.max(1, state.series.length);
    const total = state.meta.maxDays ?? recorded;
    const finalRecord = state.series.at(-1);
    const live = state.dataSource === 'api';
    const historical = live && state.day < recorded;
    const finished = live && Boolean(finalRecord?.terminated || finalRecord?.truncated);
    const planned = live && !historical ? state.previewAction : null;
    const block = irrigationBlock(state, planned ?? 0, SCENE.sprinklers.headCount);
    const hardwareBlock = live && !historical && !finished && !state.simulationBusy
      ? irrigationBlock(state, 1, SCENE.sprinklers.headCount) : '';
    day.textContent = `Ngày ${String(state.day).padStart(2, '0')} / ${live ? total : recorded}`;
    slider.max = String(live ? total : recorded);
    slider.value = String(state.day);
    slider.style.setProperty('--timeline-progress', `${(state.day - 1) / Math.max(1, Number(slider.max) - 1) * 100}%`);
    slider.disabled = recorded <= 1 || state.simulationBusy;
    slider.setAttribute('aria-valuetext', day.textContent);
    slider.title = live ? `Đã mô phỏng đến ngày ${recorded}` : '';
    previous.disabled = state.day <= 1 || state.simulationBusy;
    const label = state.simulationBusy ? 'Đang cập nhật…'
      : finished && !historical ? 'Vụ mới'
        : planned != null ? (planned > 0 ? `Tưới ${planned} L` : 'Qua ngày, không tưới') : 'Ngày tiếp';
    nextLabel.textContent = label;
    next.setAttribute('aria-label', label);
    next.disabled = state.simulationBusy || (!live && state.day >= recorded)
      || (planned != null && Boolean(block));
    playButton.disabled = !state.playing
      && (state.simulationBusy || (finished && !historical) || (planned != null && Boolean(block)));
    resetButton.disabled = state.simulationBusy;

    const message = block || (planned != null ? `Áp dụng cho ngày ${recorded + 1}.` : '');
    status.hidden = !message;
    status.textContent = message;
    playButton.replaceChildren(icon(state.playing ? 'pause' : 'play'));
    playButton.setAttribute('aria-label', state.playing ? 'Tạm dừng mô phỏng' : 'Phát mô phỏng');
    for (const item of speedButtons) {
      item.button.classList.toggle('is-active', item.speed === state.speed);
    }
    const actionLiters = state.meta?.actionLiters ?? [];
    if (!waterBuilt || waterSelect.options.length !== actionLiters.length + 1) {
      buildWaterOptions(actionLiters);
    }
    waterSelect.options[0].textContent = live
      ? (hardwareBlock ? 'Tưới: tạm khóa' : state.autoIrrigation ? 'Tưới: tự động' : 'Tưới: không tưới')
      : 'Tưới: theo dữ liệu';
    waterSelect.disabled = state.simulationBusy || historical || finished;
    for (const option of waterSelect.options) {
      option.disabled = option.value !== 'auto'
        && Boolean(irrigationBlock(state, Number(option.value), SCENE.sprinklers.headCount));
    }
    waterSelect.value = state.previewAction == null ? 'auto' : String(state.previewAction);

    policySelect.value = state.policy ?? 'baseline';
    policySelect.disabled = state.simulationBusy || !live;

    modeSelect.value = state.mode;
  }

  const unsubscribe = store.subscribe(update);
  return { node, destroy: unsubscribe };
}
