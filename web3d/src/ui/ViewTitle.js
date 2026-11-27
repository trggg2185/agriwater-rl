import { el } from '../utils/dom.js';

/** Nhãn cho nguồn dữ liệu (xem data/replay.js và data/apiClient.js). */
export const POLICY_LABELS = {
  baseline: 'Baseline (Python)',
  q_learning: 'Q-Learning (Python)',
  dqn: 'DQN (Python)',
  random: 'Ngẫu nhiên (Python)',
  fixed: 'Cố định (Python)',
  manual: 'Live (Python)',
};

export function ViewTitle(store) {
  const title = el('h1', { class: 'viewtitle' }, 'Giám sát vườn ngô');

  const pairs = [['Kịch bản', ''], ['Seed', ''], ['Nguồn', '']];
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
    const crop = state.meta.crops.find((item) => item.code === state.crop);
    title.textContent = crop?.key === 'rice' ? 'Giám sát ruộng lúa' : 'Giám sát vườn ngô';

    const scenario = state.meta.scenarios.find((item) => item.key === state.scenario);
    values[0].textContent = scenario ? scenario.label : state.scenario;
    values[1].textContent = String(state.seed);

    // Dữ liệu từ Python thì "chiến lược" chính là chính sách đã sinh ra file,
    // không phải mục chọn agent bên dưới (mục đó chưa nối vào mô phỏng).
    const isPython = state.dataSource === 'python' || state.dataSource === 'api';
    const policy = state.source?.policy;
    values[2].textContent = isPython
      ? POLICY_LABELS[policy] ?? (state.dataSource === 'api' ? 'Live (Python)' : 'Python')
      : 'Demo trình duyệt';
    values[2].title = isPython
      ? `${state.source?.days ?? state.series.length} ngày · ${state.source?.config ?? 'configs'}`
      : 'Dữ liệu mock trong trình duyệt (chưa nối Python)';
  }

  const unsubscribe = store.subscribe(update);
  return { node, destroy: unsubscribe };
}
