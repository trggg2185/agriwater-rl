import { SCENE } from '../config.js';
import { fieldIrrigationStatus } from '../utils/irrigationZones.js';
import { weatherCondition } from '../utils/colors.js';
import { el, icon, setAttr, setText } from '../utils/dom.js';
import { formatNumber } from '../utils/math.js';
import { fbm, hash2 } from '../utils/noise.js';

function mistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const u = x / canvas.width;
      const v = y / canvas.height;
      const ridge = 0.49 + Math.sin(u * 9) * 0.13;
      const plume = Math.max(0, 1 - Math.abs(v - ridge) * 2.15) ** 2;
      const noise = Math.max(0, (fbm(u * 8, v * 4.5 + 16) - 0.32) / 0.46);
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = 224;
      pixels.data[i + 1] = 235;
      pixels.data[i + 2] = 239;
      pixels.data[i + 3] = 460 * plume * noise ** 1.3 * Math.sin(Math.PI * u) ** 0.5;
    }
  }

  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

const WEATHER_LABELS = {
  sun: 'Nắng', rain: 'Mưa nhẹ', storm: 'Mưa lớn', cloud: 'Âm u',
};

const QUICK_WEATHER = { sun: 'Nắng', rain: 'Mưa nhẹ', storm: 'Mưa lớn', random: 'Ngẫu nhiên' };

export function FieldHud(store, actions) {
  const drops = Array.from({ length: 62 }, (_, index) => {
    const drop = el('span');
    drop.style.left = `${5 + hash2(index, 11) * 106}%`;
    drop.style.animationDelay = `${-hash2(index, 27) * 3}s`;
    drop.style.animationDuration = `${.8 + hash2(index, 45) * .9}s`;
    drop.style.height = `${16 + hash2(index, 61) * 18}px`;
    return drop;
  });
  const atmosphere = el('div', { class: 'atmosphere', 'aria-hidden': 'true' }, [
    el('div', { class: 'atmosphere__rain' }, drops),
    el('div', { class: 'atmosphere__mist' }),
    el('div', { class: 'atmosphere__mist atmosphere__mist--back' }),
    el('div', { class: 'atmosphere__sun' }),
  ]);
  atmosphere.style.setProperty('--mist-image', `url("${mistTexture()}")`);

  const weather = el('span');
  const pump = el('span');
  const weatherButton = el('button', {
    type: 'button', class: 'field-tag field-tag--select',
    'aria-label': 'Chọn nhanh thời tiết', 'aria-expanded': 'false', 'aria-controls': 'field-weather-menu',
  }, [icon('droplet'), weather, icon('chevron')]);
  const weatherChoice = el('select', { 'aria-label': 'Thời tiết từ ngày tiếp theo' },
    Object.entries(QUICK_WEATHER).map(([key, label]) => el('option', { value: key }, label)),
  );
  const applyWeather = el('button', { type: 'submit' }, 'Áp dụng');
  const advanced = el('button', { type: 'button' }, 'Thiết lập chi tiết');
  const latestDay = el('button', { type: 'button', hidden: true }, 'Về ngày mới nhất');
  const weatherError = el('p', { role: 'alert', hidden: true });
  const weatherHint = el('p');
  const weatherPanel = el('form', { class: 'field-weather-menu', id: 'field-weather-menu', hidden: true }, [
    el('label', {}, ['Thời tiết từ ngày tiếp theo', weatherChoice]),
    weatherHint,
    weatherError,
    el('div', { class: 'field-weather-menu__actions' }, [latestDay, applyWeather, advanced]),
  ]);
  const weatherControl = el('div', { class: 'field-weather-control' }, [weatherButton, weatherPanel]);

  function showWeather(open) {
    weatherPanel.hidden = !open;
    weatherButton.setAttribute('aria-expanded', String(open));
    weatherError.hidden = true;
  }

  function dismissOnOutsidePress(event) {
    if (!weatherPanel.hidden && !event.composedPath().includes(weatherControl)) {
      showWeather(false);
    }
  }
  document.addEventListener('pointerdown', dismissOnOutsidePress, true);

  weatherButton.addEventListener('click', () => {
    if (weatherPanel.hidden) {
      const observed = store.getState().upcomingWeather?.mode ?? atmosphere.dataset.weather;
      weatherChoice.value = Object.hasOwn(QUICK_WEATHER, observed) ? observed : 'sun';
    }
    showWeather(weatherPanel.hidden);
  });
  weatherControl.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || weatherPanel.hidden) return;
    showWeather(false);
    weatherButton.focus();
  });
  latestDay.addEventListener('click', () => {
    const state = store.getState();
    if (state.simulationBusy) return;
    store.setState({ day: state.series.length, playing: false, previewAction: null });
    if (weatherChoice.disabled) weatherButton.focus();
    else weatherChoice.focus();
  });
  advanced.addEventListener('click', () => {
    showWeather(false);
    store.setState({ view: 'environment', playing: false });
  });
  weatherPanel.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (applyWeather.disabled) return;
    weatherError.hidden = true;
    try {
      await actions.setWeather(weatherChoice.value);
      if (weatherPanel.hidden) return;
      showWeather(false);
      weatherButton.focus();
    } catch (error) {
      weatherError.textContent = error.message;
      weatherError.hidden = false;
    }
  });

  const tags = el('div', { class: 'field-tags' }, [
    weatherControl,
    el('span', { class: 'field-tag' }, [icon('power'), pump]),
  ]);

  const moisture = el('strong');
  const ideal = el('small');
  const water = el('strong');
  const total = el('small');
  const reward = el('small');
  const stats = el('section', { class: 'field-summary__stats', 'aria-label': 'Bước mô phỏng', 'aria-live': 'polite' }, [
    el('div', { class: 'field-summary__value' }, ['Độ ẩm đất', moisture, ideal]),
    el('div', { class: 'field-summary__value' }, ['Nước tưới trong ngày', water, total, reward]),
  ]);

  const playing = el('span', { class: 'field-auto__value' });
  const auto = el('button', {
    class: 'field-auto',
    type: 'button',
    role: 'switch',
    'aria-checked': 'false',
    'aria-label': 'Tưới tự động',
  }, [el('span', {}, 'Tưới tự động'), el('span', { class: 'field-auto__row' }, [
    playing, el('span', { class: 'field-auto__track', 'aria-hidden': 'true' }),
  ])]);
  auto.addEventListener('click', () => store.setState((state) => ({ autoIrrigation: !state.autoIrrigation })));

  let displayedSeries;
  let displayedDay;
  const unsub = store.subscribe((state) => {
    const latest = state.day === state.series.length;
    const record = state.series[state.day - 1];
    if (!record) return;
    const finished = state.series.at(-1)?.terminated || state.series.at(-1)?.truncated;
    const blocked = state.dataSource !== 'api' || !latest || finished || state.simulationBusy;
    if (latestDay.hidden !== latest) latestDay.hidden = latest;
    if (latestDay.disabled !== state.simulationBusy) latestDay.disabled = state.simulationBusy;
    if (applyWeather.disabled !== blocked) applyWeather.disabled = blocked;
    if (weatherChoice.disabled !== blocked) weatherChoice.disabled = blocked;
    setText(weatherHint, state.dataSource !== 'api' ? 'Chỉ chỉnh được thời tiết trong phiên live.'
      : finished ? 'Vụ đã kết thúc.'
        : !latest ? 'Về ngày mới nhất để chỉnh thời tiết.'
          : `Áp dụng từ ngày ${state.day + 1}. Hiệu ứng cập nhật ngay trên ruộng.`);
    setText(applyWeather, state.simulationBusy ? 'Đang cập nhật…' : 'Áp dụng');
    const upcoming = latest ? state.upcomingWeather : null;
    const displayed = upcoming ?? record;
    const forecastCondition = weatherCondition(displayed.rainProbability, displayed.rainForecastMm);
    const observed = displayed.actualRainMm >= 15 ? 'storm'
      : displayed.actualRainMm > 0 ? 'rain'
        : forecastCondition.key === 'sun' ? 'sun' : 'cloud';
    if (atmosphere.dataset.weather !== observed) atmosphere.dataset.weather = observed;
    const rainLabel = upcoming ? `Ngày ${upcoming.day} · ${WEATHER_LABELS[observed]}`
      : `${WEATHER_LABELS[observed]} · mưa thực tế`;
    setText(weather, `${rainLabel} ${formatNumber(displayed.actualRainMm, 1)} mm`);
    const { openMask } = fieldIrrigationStatus(state, SCENE.sprinklers.headCount);
    const spraying = openMask.some(Boolean);
    setText(pump, spraying
      ? state.previewAction != null ? 'Xem thử tưới' : 'Bơm đang tưới'
      : 'Bơm nghỉ');
    if (displayedSeries !== state.series || displayedDay !== state.day) {
      displayedSeries = state.series;
      displayedDay = state.day;
      setText(moisture, `${formatNumber(record.moisture * 100, 1)}%`);
      setText(ideal, record.isIdeal ? 'Trong vùng lý tưởng'
        : record.isStressed ? 'Cây đang bị stress' : 'Ngoài vùng lý tưởng');
      setText(water, `${formatNumber(record.waterLiters, 0)} L`);
      const cumulative = state.series.slice(0, state.day).reduce((sum, item) => sum + item.waterLiters, 0);
      setText(total, `${formatNumber(cumulative, 0)} L tích lũy`);
      setText(reward, `Thưởng trong ngày ${record.reward > 0 ? '+' : ''}${formatNumber(record.reward, 1)}`);
    }
    const autoDisabled = state.dataSource !== 'api' || state.simulationBusy;
    if (auto.disabled !== autoDisabled) auto.disabled = autoDisabled;
    const enabled = state.dataSource === 'api' && state.autoIrrigation;
    setText(playing, enabled ? 'Bật' : 'Tắt');
    setAttr(auto, 'aria-checked', String(Boolean(enabled)));
  });

  return {
    node: el('div', { class: 'field-hud' }, [atmosphere, tags]),
    readout: stats,
    automatic: auto,
    destroy() {
      document.removeEventListener('pointerdown', dismissOnOutsidePress, true);
      unsub();
    },
  };
}
