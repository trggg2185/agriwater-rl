export function downloadResultCsv(run) {
  const header = 'day,crop_type,growth_stage,soil_moisture_before,soil_moisture_after,temperature_c,rain_probability,rain_forecast_mm,actual_rain_mm,last_irrigation_l,action,water_l,reward,cumulative_reward,is_ideal,is_stressed,r_health,r_stress,r_water,r_waste,r_rain,r_delay,terminated,truncated';
  let cumulative = 0;
  const rows = run.series.map((r) => {
    cumulative += r.reward;
    const parts = r.rewardParts ?? {};
    return [r.day, r.crop, r.stage, r.previousMoisture, r.moisture, r.temperature, r.rainProbability,
      r.rainForecastMm, r.actualRainMm, r.lastIrrigation, r.action, r.waterLiters, r.reward, cumulative,
      r.isIdeal, r.isStressed, parts.R_health, parts.R_stress, parts.R_water, parts.R_waste,
      parts.R_rain, parts.R_delay, r.terminated, r.truncated].join(',');
  });
  saveCsv(header, rows);
}

export function downloadTrainingCsv(run) {
  saveCsv('episode,reward,loss', run.series.map(({ day, reward, loss }) => [day, reward, loss].join(',')));
}

function saveCsv(header, rows) {
  const url = URL.createObjectURL(new Blob([header, '\r\n', rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agriwater-ket-qua.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadReportPdf(lines, chart) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const header = document.createElement('canvas');
  header.width = 1400;
  header.height = (lines.length + 2) * 48;
  const ctx = header.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, header.width, header.height);
  ctx.fillStyle = '#142a3b';
  lines.forEach((line, index) => {
    ctx.font = index === 0 ? 'bold 34px system-ui' : '25px system-ui';
    ctx.fillText(line, 0, index * 48 + 43, header.width);
  });
  const h = header.height * 180 / header.width;
  pdf.addImage(header, 'PNG', 15, 14, 180, h);
  if (chart?.width && chart.height) {
    pdf.addImage(chart, 'PNG', 15, 18 + h, 180, Math.min(265 - h, chart.height * 180 / chart.width));
  }
  pdf.save('agriwater-bao-cao.pdf');
}

export function downloadComparisonCsv(rows) {
  saveCsv('strategy,steps,water_l,estimated_energy_kwh,ideal_ratio,stress_count,rain_penalty_count,delay_penalty_count,cumulative_reward,full_days,max_days,outcome,full_water_l,full_ideal_days',
    rows.map(({ algorithm, steps, water, energy, idealRatio, stress, rainPenalty, delayPenalty, reward, fullRun }) =>
      [algorithm, steps, water, energy, idealRatio, stress, rainPenalty, delayPenalty, reward,
        fullRun?.days, fullRun?.maxDays, fullRun?.outcome, fullRun?.water, fullRun?.idealDays].join(',')));
}
