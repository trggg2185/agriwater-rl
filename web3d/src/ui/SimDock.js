/**
 * Dock điều khiển mô phỏng: phần bổ sung ngoài ảnh mẫu, cùng phong cách kính mờ.
 * Thu gọn mặc định chỉ còn Play/Pause + tốc độ; bấm chevron để mở rộng.
 */

import { UI } from '../config.js';
import { el, icon } from '../utils/dom.js';

export function SimDock(store, actions) {
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
  // "Không tưới" (mức 0) — chọn xong cảnh 3D phun/tắt theo đúng mức đó.
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
    store.setState({ previewAction: value === 'auto' ? null : Number(value) });
  });

  const pill = el('div', { class: 'dock__pill' }, [playButton, speedGroup, waterSelect, moreButton]);

  const resetButton = el(
    'button',
    { class: 'dock__btn', type: 'button', 'aria-label': 'Đặt lại về ngày 1' },
    [icon('refresh')],
  );
  resetButton.addEventListener('click', () => store.setState({ day: 1, playing: false }));

  const seedInput = el('input', {
    class: 'dock__input',
    type: 'number',
    min: '0',
    max: '999999',
    step: '1',
    'aria-label': 'Seed',
    value: String(store.getState().seed),
  });
  seedInput.addEventListener('change', () => {
    const seed = Number.parseInt(seedInput.value, 10);
    if (Number.isFinite(seed) && seed >= 0) actions.regenerate({ seed }, { keepDay: false });
  });

  const scenarioSelect = el('select', { class: 'dock__select', 'aria-label': 'Kịch bản thời tiết' });
  for (const scenario of store.getState().meta.scenarios) {
    scenarioSelect.append(el('option', { value: scenario.key }, scenario.label));
  }
  scenarioSelect.addEventListener('change', () => {
    actions.regenerate({ scenario: scenarioSelect.value }, { keepDay: false });
  });

  const modeSelect = el('select', { class: 'dock__select', 'aria-label': 'Chế độ dữ liệu' }, [
    el('option', { value: 'replay' }, 'Replay (CSV)'),
    el('option', { value: 'live' }, 'Live (backend)'),
  ]);
  modeSelect.addEventListener('change', () => {
    store.setState({ mode: modeSelect.value });
    if (modeSelect.value === 'live') {
      actions.notify('Live cần backend FastAPI (giai đoạn 3). Đang dùng dữ liệu mock.');
    }
  });

  function agentSelect(label) {
    const select = el('select', { class: 'dock__select', 'aria-label': label });
    for (const agent of store.getState().meta.agents) {
      const option = el(
        'option',
        { value: agent.key },
        agent.available ? agent.label : `${agent.label} — chưa có`,
      );
      if (!agent.available) option.disabled = true;
      select.append(option);
    }
    return select;
  }

  const agentA = agentSelect('Agent A');
  agentA.addEventListener('change', () => store.setState({ agentA: agentA.value }));
  const agentB = agentSelect('Agent B');
  agentB.addEventListener('change', () => store.setState({ agentB: agentB.value }));

  const heatmapChip = el(
    'button',
    { class: 'dock__chip', type: 'button', 'aria-pressed': 'false' },
    [icon('heatmap'), 'Heatmap độ ẩm'],
  );
  heatmapChip.addEventListener('click', () => {
    store.setState((state) => ({ heatmap: !state.heatmap }));
  });

  const panel = el('div', { class: 'dock__panel' }, [
    resetButton,
    el('label', { class: 'dock__field' }, ['Seed', seedInput]),
    scenarioSelect,
    modeSelect,
    el('label', { class: 'dock__field' }, ['A', agentA]),
    el('label', { class: 'dock__field' }, ['B', agentB]),
    heatmapChip,
  ]);

  const node = el('div', { class: 'dock' }, [panel, pill]);

  moreButton.addEventListener('click', () => {
    const open = node.classList.toggle('is-open');
    moreButton.setAttribute('aria-expanded', String(open));
  });

  function update(state) {
    playButton.replaceChildren(icon(state.playing ? 'pause' : 'play'));
    playButton.setAttribute('aria-label', state.playing ? 'Tạm dừng mô phỏng' : 'Phát mô phỏng');
    for (const item of speedButtons) {
      item.button.classList.toggle('is-active', item.speed === state.speed);
    }
    const actionLiters = state.meta?.actionLiters ?? [];
    if (!waterBuilt || waterSelect.options.length !== actionLiters.length + 1) {
      buildWaterOptions(actionLiters);
    }
    waterSelect.value =
      state.previewAction == null ? 'auto' : String(state.previewAction);

    scenarioSelect.value = state.scenario;
    modeSelect.value = state.mode;
    agentA.value = state.agentA;
    agentB.value = state.agentB;
    heatmapChip.classList.toggle('is-active', Boolean(state.heatmap));
    heatmapChip.setAttribute('aria-pressed', String(Boolean(state.heatmap)));
    if (document.activeElement !== seedInput) seedInput.value = String(state.seed);
  }

  const unsubscribe = store.subscribe(update);
  return { node, destroy: unsubscribe };
}
