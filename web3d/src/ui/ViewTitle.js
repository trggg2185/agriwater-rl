import { el } from '../utils/dom.js';

export function ViewTitle(store) {
  const title = el('h1', { class: 'viewtitle', id: 'field-title' }, 'Ruộng lúa');
  const context = el('p', { class: 'viewblock__context' });
  const node = el('div', { class: 'viewblock' }, [title, context]);

  const unsubscribe = store.subscribe((state) => {
    const crop = state.meta.crops.find((item) => item.code === state.crop);
    const scenario = state.meta.scenarios.find((item) => item.key === state.scenario);
    title.textContent = crop?.key === 'rice' ? 'Ruộng lúa' : 'Vườn ngô';
    const source = state.dataSource === 'api' ? 'Mô phỏng trực tiếp' : 'Phát lại';
    context.textContent = `${scenario?.label ?? state.scenario} · Seed ${state.seed} · ${source}`;
  });
  return { node, destroy: unsubscribe };
}
