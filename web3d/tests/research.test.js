import { expect, it } from 'vitest';
import { alignRuns, summarize, trainingLog, validateWeather } from '../src/data/research.js';

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
