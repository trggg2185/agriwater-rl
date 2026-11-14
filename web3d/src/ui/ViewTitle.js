import { el } from '../utils/dom.js';

/** Tiêu đề lớn + hàng 4 cặp nhãn/giá trị rất nhỏ. */
export function ViewTitle(store) {
  const title = el('h1', { class: 'viewtitle' }, 'Tổng quan');

  const pairs = [['Kịch bản', ''], ['Seed', ''], ['Ngày mô phỏng', ''], ['Chiến lược', '']];
  const values = pairs.map(() => el('span', { class: 'metarow__value' }, '—'));
  const metaRow = el(
    'div',
    { class: 'metarow' },
    pairs.map(([label], index) =>
      el('span', { class: 'metarow__pair' }, [
        el('span', { class: 'metarow__label' }, `${label}:`),
        values[index],
      ]),
    ),
  );

  const node = el('div', { class: 'viewblock' }, [title, metaRow]);

  function update(state) {
    const tab = state.activeTab;
    if (state.view === 'device') {
      title.textContent = 'Trạm bơm';
    } else if (tab === 'overview') {
      title.textContent = 'Tổng quan';
    } else {
      const crop = state.meta.crops.find((item) => item.key === tab);
      title.textContent = crop ? crop.label : 'Tổng quan';
    }

    const scenario = state.meta.scenarios.find((item) => item.key === state.scenario);
    const agent = state.meta.agents.find((item) => item.key === state.agentA);
    values[0].textContent = scenario ? scenario.label : state.scenario;
    values[1].textContent = String(state.seed);
    values[2].textContent = `${state.day}/${state.series.length}`;
    values[3].textContent = agent ? agent.label : '—';
  }

  const unsubscribe = store.subscribe(update);
  return { node, destroy: unsubscribe };
}
