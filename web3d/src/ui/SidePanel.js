/**
 * Panel phải: tab kiểu thư mục + 4 khối nội dung.
 * Tab active liền khối với thân panel; tab inactive xám mờ và thấp hơn.
 *
 * Ngoài các tab loại cây còn có tab "Nhật ký" — nó KHÔNG đổi loại cây đang
 * xem, chỉ mở một thân panel riêng chứa toàn bộ lịch sử mô phỏng.
 */

import { UI } from '../config.js';
import { el } from '../utils/dom.js';
import { createMetricCards } from './panels/MetricCards.js';
import { createEtCurve } from './panels/EtCurve.js';
import { createAssignmentPlan } from './panels/AssignmentPlan.js';
import { createYieldStats } from './panels/YieldStats.js';
import { createObservation } from './panels/Observation.js';
import { createHistoryLog } from './panels/HistoryLog.js';
import { createDevicePanel } from './panels/DevicePanel.js';

export function SidePanel(store, actions) {
  const tabs = el('div', { class: 'panel__tabs', role: 'tablist', 'aria-label': 'Chế độ xem dữ liệu' });
  const body = el('div', { class: 'panel__body' });

  // Tab "Nhật ký": thân panel riêng, cao hơn để đọc được nhiều ngày.
  const history = createHistoryLog(store);
  const logBody = el('div', { class: 'panel__body panel__body--log is-hidden' }, [history.node]);

  // Mục "Điều khiển thiết bị" dùng chung khung panel, không có dải tab loại cây.
  const device = createDevicePanel(store);
  const deviceBody = el('div', { class: 'panel__body is-hidden' }, [device.node]);

  const node = el('aside', { class: 'panel' }, [tabs, body, logBody, deviceBody]);

  const sections = [
    createMetricCards(),
    createEtCurve(),
    createAssignmentPlan(store),
    createYieldStats(),
    createObservation(),
  ];
  for (const section of sections) body.append(section.node);

  let tabButtons = [];

  function buildTabs(meta, activeTab) {
    const entries = [
      { key: 'overview', label: 'Tổng quan' },
      ...meta.crops.map((crop) => ({ key: crop.key, label: crop.label })),
      { key: 'log', label: 'Nhật ký' },
    ];
    if (tabButtons.length === entries.length) {
      entries.forEach((entry, index) => {
        const button = tabButtons[index];
        button.classList.toggle('is-active', entry.key === activeTab);
        button.setAttribute('aria-selected', String(entry.key === activeTab));
      });
      return;
    }

    tabs.replaceChildren();
    tabButtons = entries.map((entry) => {
      const button = el('button', {
        class: 'panel__tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(entry.key === activeTab),
      }, entry.label);
      button.addEventListener('click', () => select(entry.key));
      tabs.append(button);
      return button;
    });
    entries.forEach((entry, index) => {
      tabButtons[index].classList.toggle('is-active', entry.key === activeTab);
    });
  }

  function fade(target) {
    target.classList.add('is-fading');
    window.setTimeout(() => target.classList.remove('is-fading'), UI.timing.fadeMs * 0.55);
  }

  function select(key) {
    const state = store.getState();
    if (state.activeTab === key) return;

    // Tab nhật ký chỉ đổi phần đang xem; loại cây và dữ liệu giữ nguyên.
    if (key === 'log') {
      fade(store.getState().activeTab === 'log' ? logBody : body);
      store.setState({ activeTab: 'log' });
      return;
    }

    fade(logBody.classList.contains('is-hidden') ? body : logBody);
    if (key === 'overview') {
      store.setState({ activeTab: 'overview', crop: 0, previewAction: null });
      actions.regenerate({ crop: 0 }, { keepDay: true });
      return;
    }
    const crop = state.meta.crops.find((item) => item.key === key);
    const code = crop ? crop.code : 0;
    store.setState({ activeTab: key, crop: code, previewAction: null });
    actions.regenerate({ crop: code }, { keepDay: true });
  }

  function update(state) {
    const isDevice = state.view === 'device';
    const isLog = state.activeTab === 'log';
    tabs.classList.toggle('is-hidden', isDevice);
    body.classList.toggle('is-hidden', isDevice || isLog);
    logBody.classList.toggle('is-hidden', isDevice || !isLog);
    deviceBody.classList.toggle('is-hidden', !isDevice);

    buildTabs(state.meta, state.activeTab);
    for (const section of sections) section.update(state);
    history.update(state);
    device.update(state);
  }

  const unsubscribe = store.subscribe(update);
  return { node, destroy: unsubscribe };
}
