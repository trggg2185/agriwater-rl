/** API và bản phát lại ghi giai đoạn lúc bắt đầu bước; mốc YAML tính cuối bước. */
export function growthWindow({ meta, series, dataSource }, record) {
  const offset = dataSource === 'mock' ? 0 : 1;
  const first = series.find((day) => day.stage === record.stage)?.day ?? record.day;
  const recordedNext = series.find((day) => day.stage > record.stage)?.day;
  const milestone = meta.growthStageDays[record.stage];
  const next = recordedNext ?? (milestone == null ? undefined : milestone + offset);
  return { first, next };
}
