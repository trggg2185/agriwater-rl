import { SCENE } from '../config.js';
import { fieldIrrigationStatus } from '../utils/irrigationZones.js';
import { weatherCondition } from '../utils/colors.js';
import { el, icon } from '../utils/dom.js';
import { formatNumber } from '../utils/math.js';
import { fbm, hash2 } from '../utils/noise.js';
import { POLICY_LABELS } from './ViewTitle.js';

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

export function FieldHud(store) {
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
  const tags = el('div', { class: 'field-tags' }, [
    el('span', { class: 'field-tag' }, [icon('droplet'), weather]),
    el('span', { class: 'field-tag' }, [icon('power'), pump]),
  ]);

  const reward = el('span', { class: 'field-stats__value' });
  const water = el('span', { class: 'field-stats__value' });
  const policy = el('span', { class: 'field-stats__value' });
  const stats = el('section', { class: 'field-stats', 'aria-label': 'Bước mô phỏng' }, [
    el('h3', {}, 'Bước mô phỏng'),
    el('div', { class: 'field-stats__body' }, [
      el('div', {}, ['Phần thưởng ', reward]),
      el('div', {}, ['Hành động ', water]),
      el('div', {}, ['Chiến lược ', policy]),
    ]),
  ]);

  const playing = el('span', { class: 'field-auto__value' });
  const auto = el('button', {
    class: 'field-auto',
    type: 'button',
    role: 'switch',
    'aria-checked': 'false',
    'aria-label': 'Baseline tự động',
  }, [el('span', {}, 'Baseline tự động'), el('span', { class: 'field-auto__row' }, [
    playing, el('span', { class: 'field-auto__track', 'aria-hidden': 'true' }),
  ])]);
  auto.addEventListener('click', () => store.setState((state) => ({ autoIrrigation: !state.autoIrrigation })));

  const unsub = store.subscribe((state) => {
    const record = state.series[state.day - 1];
    if (!record) return;
    const forecastCondition = weatherCondition(record.rainProbability, record.rainForecastMm);
    const observed = record.actualRainMm >= 15 ? 'storm'
      : record.actualRainMm > 0 ? 'rain'
        : forecastCondition.key === 'sun' ? 'sun' : 'cloud';
    atmosphere.dataset.weather = observed;
    weather.textContent = `${WEATHER_LABELS[observed]} · mưa thực tế ${formatNumber(record.actualRainMm, 1)} mm`;
    const { openMask } = fieldIrrigationStatus(state, SCENE.sprinklers.headCount);
    const spraying = openMask.some(Boolean);
    pump.textContent = spraying
      ? state.previewAction != null ? 'Xem thử tưới' : 'Bơm đang tưới'
      : 'Bơm nghỉ';
    reward.textContent = `${record.reward > 0 ? '+' : ''}${formatNumber(record.reward, 1)}`;
    water.textContent = `a${record.action} · ${formatNumber(record.waterLiters, 0)} L`;
    policy.textContent = state.dataSource === 'api'
      ? state.autoIrrigation ? 'Baseline (bước tiếp)' : 'Thủ công (bước tiếp)'
      : (POLICY_LABELS[state.source?.policy] ?? 'Demo').replace(' (Python)', '');
    auto.disabled = state.dataSource !== 'api' || state.simulationBusy;
    auto.title = auto.disabled ? 'Chế độ phát lại hiển thị hành động đã ghi trong dữ liệu' : '';
    const enabled = auto.disabled ? state.source?.policy === 'baseline' : state.autoIrrigation;
    playing.textContent = enabled ? 'Bật' : 'Tắt';
    auto.setAttribute('aria-checked', String(Boolean(enabled)));
  });

  return {
    node: el('div', { class: 'field-hud' }, [atmosphere, tags]),
    readout: el('div', { class: 'field-readout' }, [stats, auto]),
    destroy: unsub,
  };
}
