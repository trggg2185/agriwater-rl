import { UI } from '../config.js';
import { el, icon } from '../utils/dom.js';

export function TopNav(store) {
  const node = el('nav', { class: 'nav', 'aria-label': 'Điều hướng chính' });

  const items = UI.views.map((view) => {
    const button = el(
      'button',
      {
        class: 'nav__item',
        type: 'button',
        'aria-label': view.label,
        dataset: { view: view.id },
      },
      [
        icon(view.icon),
        el('span', { class: 'nav__label' }, view.label),
        view.shortLabel && el('span', { class: 'nav__label-short' }, view.shortLabel),
      ],
    );
    button.addEventListener('click', () => store.setState({ view: view.id }));
    node.append(button);
    return button;
  });

  function sync(state) {
    for (const item of items) {
      item.setAttribute('aria-pressed', String(item.dataset.view === state.view));
    }
  }

  const unsubscribe = store.subscribe(sync);
  return { node, destroy: unsubscribe };
}
