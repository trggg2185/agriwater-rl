import { expect, it } from 'vitest';
import { alignRuns, episodeOverview, summarize, switchScenario, trainingLog, validateWeather } from '../src/data/research.js';

const weather = { temperature: 29, rainProbability: .5, rainForecastMm: 8, actualRainMm: 2 };
const first = {
  ...weather, day: 1, previousMoisture: .4, lastIrrigation: 0, stage: 0,
  waterLiters: 10, reward: -10, isIdeal: true, isStressed: false, rewardParts: { R_rain: -4, R_delay: 0 },
};
const second = {
  ...first, day: 2, waterLiters: 5, reward: 6, isIdeal: false, isStressed: true,
  rewardParts: { R_rain: 0, R_delay: -8 },
};

it('tổng hợp KPI thực tế và chỉ ước tính điện khi có thông số bơm', () => {
  const totals = summarize([first, second], { pumpPowerKw: 2, pumpFlow: 10 });
  expect(totals).toMatchObject({
    water: 15, reward: -4, idealRatio: .5, stress: 1, rainPenalty: 1, delayPenalty: 1, energy: .05,
  });
  expect(summarize([{ ...first, rewardParts: null }]).rainPenalty).toBeNull();
  expect(summarize([first]).energy).toBeNull();
});

it('cắt theo chuỗi ngắn hơn khi đầu vào khớp và từ chối so sánh khác thời tiết', () => {
  const common = { scenario: 'dry', seed: 42, crop: 1 };
  const a = { ...common, algorithm: 'baseline', series: [first, second] };
  const b = { ...common, algorithm: 'dqn', series: [first] };
  expect(alignRuns([a, b])).toEqual({ length: 1, trimmed: true });
  expect(() => alignRuns([a, { ...b, series: [{ ...first, actualRainMm: 5 }] }])).toThrow('thời tiết');
});

it('kiểm tra số chiều thời tiết và đọc nhật ký Reward/Loss có giá trị trống', () => {
  const day = { temperature: 30, rain_probability: .3, rain_forecast_mm: 5, actual_rain_mm: 2 };
  expect(validateWeather([day, day], 1)).toEqual([day, day]);
  expect(() => validateWeather([day], 1)).toThrow('2 bản ghi');
  expect(trainingLog('episode,reward,loss\n1,-92,\n2,100,0.4')).toEqual([
    { day: 1, reward: -92, loss: null }, { day: 2, reward: 100, loss: .4 },
  ]);
});

it('đổi kịch bản loại bỏ thời tiết cũ và giữ thiết lập đất, cây, seed', () => {
  const profile = { scenario: 'dry', crop: 1, seed: 42, weather: [{}], initialState: {
    soil_moisture: .45, growth_stage: 1, last_irrigation_liters: 5,
    temperature: 40, rain_probability: .01, rain_forecast_mm: 0, actual_rain_mm: 0,
  } };
  expect(switchScenario(profile, 'stormy')).toEqual({
    scenario: 'stormy', crop: 1, seed: 42, weather: undefined,
    initialState: { soil_moisture: .45, growth_stage: 1, last_irrigation_liters: 5 },
  });
  expect(switchScenario(profile, 'dry')).toBe(profile);
});

it('giữ tổng cả vụ và phân biệt kết thúc sinh học với hết vụ khi so theo ngày chung', () => {
  const complete = { series: [first, { ...second, truncated: true }] };
  const stopped = { maxDays: 2, series: [{ ...first, terminated: true }] };
  expect(episodeOverview(complete)).toEqual({ days: 2, maxDays: 2, outcome: 'completed', water: 15, idealDays: 1 });
  expect(episodeOverview(stopped)).toEqual({ days: 1, maxDays: 2, outcome: 'terminated', water: 10, idealDays: 1 });
  expect(episodeOverview({ series: stopped.series }).maxDays).toBeNull();
});
