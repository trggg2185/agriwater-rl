/**
 * Bảng dữ liệu của thửa đang xem và các tab chọn cây hoặc nhật ký.
 *
 * Ngoài các tab loại cây còn có tab "Nhật ký" — nó KHÔNG đổi loại cây đang
 * xem, chỉ mở một thân panel riêng chứa toàn bộ lịch sử mô phỏng.
 */

import { el } from '../utils/dom.js';
import { createMetricCards } from './panels/MetricCards.js';
import { createEtCurve } from './panels/EtCurve.js';
import { createAssignmentPlan } from './panels/AssignmentPlan.js';
import { createYieldStats } from './panels/YieldStats.js';
import { createObservation } from './panels/Observation.js';
import { createHistoryLog } from './panels/HistoryLog.js';

export function SidePanel(store) {
  const tabs = el('div', { class: 'panel__tabs', role: 'tablist', 'aria-label': 'Chế độ xem dữ liệu' });
  const body = el('div', { id: 'field-metrics', class: 'panel__body', role: 'tabpanel' });

  // Tab "Nhật ký": thân panel riêng, cao hơn để đọc được nhiều ngày.
  const history = createHistoryLog(store);
  const logBody = el('div', {
    id: 'field-history',
    class: 'panel__body panel__body--log is-hidden',
    role: 'tabpanel',
    'aria-labelledby': 'field-tab-log',
  }, [history.node]);

  const node = el('aside', { class: 'panel' }, [tabs, body, logBody]);

  const sections = [
    createMetricCards(),
    createEtCurve(),
    createAssignmentPlan(),
    createYieldStats(),
    createObservation(),
  ];
  for (const section of sections) body.append(section.node);

  let tabButtons = [];

  function buildTabs(activeTab) {
    const entries = [
      { key: 'overview', label: 'Theo dõi' },
      { key: 'log', label: 'Nhật ký' },
    ];
    if (tabButtons.length === entries.length) {
      entries.forEach((entry, index) => {
        const button = tabButtons[index];
        button.classList.toggle('is-active', entry.key === activeTab);
        button.setAttribute('aria-selected', String(entry.key === activeTab));
        button.tabIndex = entry.key === activeTab ? 0 : -1;
      });
      return;
    }

    tabs.replaceChildren();
    tabButtons = entries.map((entry) => {
      const button = el('button', {
        class: 'panel__tab',
        id: `field-tab-${entry.key}`,
        type: 'button',
        role: 'tab',
        'aria-selected': String(entry.key === activeTab),
        'aria-controls': entry.key === 'log' ? 'field-history' : 'field-metrics',
        tabindex: entry.key === activeTab ? 0 : -1,
      }, entry.label);
      button.addEventListener('click', () => select(entry.key));
      tabs.append(button);
      return button;
    });
    entries.forEach((entry, index) => {
      tabButtons[index].classList.toggle('is-active', entry.key === activeTab);
    });
  }

  function select(key) {
    const state = store.getState();
    if (state.activeTab === key) return;

    store.setState({ activeTab: key });
  }

  tabs.addEventListener('keydown', (event) => {
    const current = tabButtons.indexOf(event.target);
    if (current < 0) return;
    const size = tabButtons.length;
    const next = {
      ArrowLeft: (current + size - 1) % size,
      ArrowRight: (current + 1) % size,
      Home: 0,
      End: size - 1,
    }[event.key];
    if (next == null) return;
    event.preventDefault();
    tabButtons[next].focus();
    tabButtons[next].click();
  });

  function update(state) {
    const isLog = state.activeTab === 'log';
    body.classList.toggle('is-hidden', isLog);
    if (!isLog) body.setAttribute('aria-labelledby', `field-tab-${state.activeTab}`);
    logBody.classList.toggle('is-hidden', !isLog);

    buildTabs(state.activeTab);
    for (const section of sections) section.update(state);
    history.update(state);
  }

  const unsubscribe = store.subscribe(update);
  return {
    node,
    destroy() {
      unsubscribe();
      for (const section of sections) section.destroy?.();
    },
  };
}
