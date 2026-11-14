import { UI } from '../config.js';
import { el, icon } from '../utils/dom.js';

/** Thanh điều hướng 3 mục; nền trắng trượt sang mục đang chọn. */
export function TopNav(store) {
  const indicator = el('div', { class: 'nav__indicator' });
  const node = el('nav', { class: 'nav', 'aria-label': 'Điều hướng chính' }, indicator);

  const items = UI.views.map((view) => {
    const button = el(
      'button',
      {
        class: 'nav__item',
        type: 'button',
        'aria-label': view.label,
        dataset: { view: view.id },
      },
      [icon(view.icon), el('span', { class: 'nav__label' }, view.label)],
    );
    button.addEventListener('click', () => store.setState({ view: view.id }));
    node.append(button);
    return button;
  });

  function moveIndicator(activeView) {
    const active = items.find((item) => item.dataset.view === activeView) ?? items[0];
    if (!active) return;
    const navBox = node.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (!box.width) return;
    indicator.style.width = `${box.width}px`;
    indicator.style.transform = `translateX(${box.left - navBox.left}px)`;
  }

  function sync(state) {
    for (const item of items) item.classList.toggle('is-active', item.dataset.view === state.view);
    requestAnimationFrame(() => moveIndicator(state.view));
  }

  const unsubscribe = store.subscribe(sync);
  const onResize = () => moveIndicator(store.getState().view);
  window.addEventListener('resize', onResize);
  if (document.fonts?.ready) document.fonts.ready.then(onResize);

  return {
    node,
    destroy() {
      unsubscribe();
      window.removeEventListener('resize', onResize);
    },
  };
}
