import { el, icon } from '../utils/dom.js';
import { weatherCondition } from '../utils/colors.js';
import { formatNumber } from '../utils/math.js';

/** Thẻ thời tiết góc trái dưới; bấm chevron để mở rộng lên trên. */
export function WeatherCard(store) {
  const tempValue = el('span');
  const condText = el('div', { class: 'weather__cond' }, 'Nắng');
  const subText = el('div', { class: 'weather__sub' }, '—');

  const node = el('div', { class: 'weather' }, [
    el(
      'button',
      { class: 'weather__chev', type: 'button', 'aria-label': 'Mở rộng thông tin thời tiết', 'aria-expanded': 'false' },
      [icon('chevron')],
    ),
    el('div', { class: 'weather__head' }, [
      el('div', { class: 'weather__temp' }, [tempValue, el('span', { class: 'weather__unit' }, '°C')]),
      el('div', {}, [condText, subText]),
    ]),
  ]);

  const extraProb = el('span');
  const extraRain = el('span');
  const extraScenario = el('span');
  const extraTemp = el('span');

  const extra = el('div', { class: 'weather__extra', hidden: true }, [
    el('div', { class: 'weather__row' }, [el('span', {}, 'Xác suất mưa'), extraProb]),
    el('div', { class: 'weather__row' }, [el('span', {}, 'Mưa dự báo'), extraRain]),
    el('div', { class: 'weather__row' }, [el('span', {}, 'Nhiệt độ'), extraTemp]),
    el('div', { class: 'weather__row' }, [el('span', {}, 'Kịch bản'), extraScenario]),
  ]);
  node.append(extra);

  const chevron = node.querySelector('.weather__chev');
  chevron.addEventListener('click', () => {
    const open = node.classList.toggle('is-open');
    extra.hidden = !open;
    chevron.setAttribute('aria-expanded', String(open));
  });

  function update(state) {
    const record = state.series[Math.min(state.day, state.series.length) - 1];
    if (!record) return;
    const condition = weatherCondition(record.rainProbability, record.rainForecastMm);

    tempValue.textContent = formatNumber(record.temperature, 0);
    condText.textContent = condition.label;
    subText.textContent = `Mưa ${formatNumber(record.rainForecastMm, 0)} mm · P ${formatNumber(record.rainProbability * 100, 0)} %`;

    extraProb.textContent = `${formatNumber(record.rainProbability * 100, 0)} %`;
    extraRain.textContent = `${formatNumber(record.rainForecastMm, 1)} mm`;
    extraTemp.textContent = `${formatNumber(record.temperature, 1)} °C`;
    const scenario = state.meta.scenarios.find((item) => item.key === state.scenario);
    extraScenario.textContent = scenario ? scenario.label : state.scenario;
  }

  const unsubscribe = store.subscribe(update);
  return { node, destroy: unsubscribe };
}
