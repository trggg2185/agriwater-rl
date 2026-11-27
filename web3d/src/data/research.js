import { EPISODE_SCHEMA, normalizeEpisode } from './replay.js';

export const STRATEGIES = {
  baseline: 'Rule-based Baseline',
  q_learning: 'Q-Learning',
  dqn: 'DQN',
};

export const observationFields = [
  { key: 'soil_moisture', label: 'Độ ẩm đất (0–1)', min: 0, max: 1, required: true },
  { key: 'temperature', label: 'Nhiệt độ (°C)', min: 15, max: 45 },
  { key: 'rain_probability', label: 'Xác suất mưa (0–1)', min: 0, max: 1 },
  { key: 'rain_forecast_mm', label: 'Lượng mưa dự báo (mm)', min: 0, max: 50 },
  { key: 'last_irrigation_liters', label: 'Lượng tưới gần nhất (L)', min: 0, max: 25 },
];

export const actualRainField = { key: 'actual_rain_mm', label: 'Lượng mưa thực tế (mm)', min: 0, max: 50 };

const weatherKeys = ['temperature', 'rain_probability', 'rain_forecast_mm', actualRainField.key];

/** Đổi kịch bản cũng đổi nguồn thời tiết ngày đầu, nhưng giữ trạng thái đất và cây. */
export function switchScenario(profile, scenario) {
  if (profile.scenario === scenario) return profile;
  const initialState = Object.fromEntries(
    Object.entries(profile.initialState).filter(([key]) => !weatherKeys.includes(key)),
  );
  return { ...profile, scenario, initialState, weather: undefined };
}

const weatherLimits = {
  temperature: [15, 45],
  rain_probability: [0, 1],
  rain_forecast_mm: [0, 50],
  actual_rain_mm: [0, 50],
};

export function validateWeather(value, maxDays) {
  const weather = Array.isArray(value) ? value : value?.weather;
  if (!Array.isArray(weather) || weather.length !== maxDays + 1) {
    throw new Error(`Kịch bản cần ${maxDays + 1} bản ghi thời tiết, gồm cả dự báo cho bước cuối.`);
  }
  return weather.map((day, index) => Object.fromEntries(Object.entries(weatherLimits).map(([key, [min, max]]) => {
    const reading = day?.[key];
    if (!Number.isFinite(reading) || reading < min || reading > max) {
      throw new Error(`Bản ghi ${index + 1}: ${key} phải nằm trong đoạn ${min}–${max}.`);
    }
    return [key, reading];
  })));
}

export function validateProfile(profile, meta) {
  if (!profile || !meta.crops.some(({ code }) => code === profile.crop)
    || !meta.scenarios.some(({ key }) => key === profile.scenario)
    || !Number.isInteger(profile.seed) || profile.seed < 0 || profile.seed > 4294967295
    || !Number.isInteger(profile.initialState?.growth_stage)
    || profile.initialState.growth_stage < 0 || profile.initialState.growth_stage >= meta.stages.length) {
    throw new Error('Giống cây, kịch bản, giai đoạn hoặc seed không hợp lệ.');
  }
  for (const { key, min, max, required, label } of [...observationFields, actualRainField]) {
    const reading = profile.initialState[key];
    if (reading == null && !required) continue;
    if (!Number.isFinite(reading) || reading < min || reading > max) {
      throw new Error(`Giá trị không hợp lệ ở trường ${label}.`);
    }
  }
  for (const key of ['pumpPowerKw', 'pumpFlow']) {
    const value = profile[key];
    if (value != null && (!Number.isFinite(value) || value <= 0)) {
      throw new Error('Công suất và lưu lượng bơm phải lớn hơn 0.');
    }
  }
  return profile;
}

export function summarize(series, { pumpPowerKw, pumpFlow } = {}) {
  const totals = { water: 0, reward: 0, ideal: 0, stress: 0, rainPenalty: 0, delayPenalty: 0 };
  let incompleteRewardParts = false;
  for (const day of series) {
    totals.water += day.waterLiters;
    totals.reward += day.reward;
    totals.ideal += Number(day.isIdeal);
    totals.stress += Number(day.isStressed);
    const { R_rain, R_delay } = day.rewardParts ?? {};
    incompleteRewardParts ||= !Number.isFinite(R_rain) || !Number.isFinite(R_delay);
    totals.rainPenalty += Number(R_rain < 0);
    totals.delayPenalty += Number(R_delay < 0);
  }
  return {
    ...totals,
    idealRatio: series.length ? totals.ideal / series.length : null,
    rainPenalty: incompleteRewardParts ? null : totals.rainPenalty,
    delayPenalty: incompleteRewardParts ? null : totals.delayPenalty,
    energy: pumpPowerKw > 0 && pumpFlow > 0 ? pumpPowerKw * totals.water / pumpFlow / 60 : null,
  };
}

const conditions = ['temperature', 'rainProbability', 'rainForecastMm', 'actualRainMm'];

export function alignRuns(runs) {
  const first = runs[0];
  if (runs.length < 2 || runs.some((run) => !run?.series.length) || new Set(runs.map(({ algorithm }) => algorithm)).size !== runs.length) {
    throw new Error('Chọn ít nhất hai kết quả thuộc các chiến lược khác nhau.');
  }
  const length = Math.min(...runs.map(({ series }) => series.length));
  for (const run of runs.slice(1)) {
    const sameInputs = run.scenario === first.scenario && run.seed === first.seed && run.crop === first.crop
      && run.series[0].previousMoisture === first.series[0].previousMoisture
      && run.series[0].lastIrrigation === first.series[0].lastIrrigation
      && run.series[0].stage === first.series[0].stage;
    const sameWeather = first.series.slice(0, length).every((record, index) =>
      record.day === run.series[index].day
      && conditions.every((key) => record[key] === run.series[index][key]),
    );
    if (!sameInputs || !sameWeather) {
      throw new Error('Các kết quả phải dùng cùng loại cây, trạng thái đầu, seed và chuỗi thời tiết.');
    }
  }
  return { length, trimmed: runs.some(({ series }) => series.length !== length) };
}

export function importRun(raw) {
  const algorithm = raw?.source?.policy;
  if (raw?.schema !== EPISODE_SCHEMA || !Object.hasOwn(STRATEGIES, algorithm)
    || !Number.isInteger(raw.seed) || !Number.isInteger(raw.crop) || typeof raw.scenario !== 'string'
    || !Array.isArray(raw.series) || !raw.series.length) {
    throw new Error('Cần tệp episode của Baseline, Q-Learning hoặc DQN theo schema agriwater.episode/1.');
  }
  const keyFields = ['previousMoisture', 'moisture', 'waterLiters', 'reward', 'stage', 'lastIrrigation', ...conditions];
  if (!raw.series.every((day, index) => day?.day === index + 1 && keyFields.every((key) => Number.isFinite(day[key])))) {
    throw new Error('Episode thiếu trường trạng thái, hành động hoặc phần thưởng theo ngày.');
  }
  if (!raw.series.at(-1).terminated && !raw.series.at(-1).truncated) {
    throw new Error('Chỉ nhập episode đã hoàn thành để so sánh.');
  }
  return { ...normalizeEpisode(raw), algorithm };
}

export function runRow(episode, algorithm, profile, title) {
  return {
    id: crypto.randomUUID(), date: new Date().toISOString(), title, algorithm,
    scenario: episode.scenario, seed: episode.seed, crop: episode.crop,
    series: episode.series, pumpPowerKw: profile?.pumpPowerKw, pumpFlow: profile?.pumpFlow,
  };
}

/** Training Logs CSV của lớp lưu trữ. Loss bỏ trống cho thuật toán không có Loss. */
export function trainingLog(text) {
  const [heading, ...lines] = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const fields = heading.split(',').map((field) => field.trim().toLowerCase());
  const episode = fields.indexOf('episode');
  const reward = fields.indexOf('reward');
  const loss = fields.indexOf('loss');
  if (episode < 0 || reward < 0 || !lines.length) {
    throw new Error('CSV cần các cột episode, reward và ít nhất một dòng dữ liệu. Cột loss là tùy chọn.');
  }
  let previous = -1;
  return lines.filter((line) => line.trim()).map((line, index) => {
    const cells = line.split(',').map((value) => value.trim());
    const read = (column) => cells[column] ? Number(cells[column]) : null;
    const day = read(episode);
    const points = read(reward);
    const error = read(loss);
    if (!Number.isInteger(day) || day <= previous || !Number.isFinite(points)
      || (error != null && (!Number.isFinite(error) || error < 0))) {
      throw new Error(`Dòng CSV ${index + 2} có tập, phần thưởng hoặc loss không hợp lệ.`);
    }
    previous = day;
    return { day, reward: points, loss: error };
  });
}
