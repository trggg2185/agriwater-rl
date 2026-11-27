import React, { useEffect, useRef, useState } from 'react';
import * as api from '../data/apiClient.js';
import { normalizeEpisode } from '../data/replay.js';
import { alignRuns, importRun, observationFields, runRow, STRATEGIES, summarize, trainingLog, validateProfile, validateWeather } from '../data/research.js';
import { downloadComparisonCsv, downloadReportPdf, downloadResultCsv, downloadTrainingCsv } from '../data/reportExport.js';
import { formatNumber } from '../utils/math.js';
import { chartCanvas } from './charts/ChartCanvas.js';

const summaryRows = [
  ['water', 'Tổng nước tưới', 'L', 1],
  ['energy', 'Điện bơm ước tính', 'kWh', 3],
  ['idealRatio', 'Thời gian có độ ẩm lý tưởng', '%', 1],
  ['stress', 'Bước cây bị stress', '', 0],
  ['rainPenalty', 'Lần tưới khi dự báo mưa lớn', '', 0],
  ['delayPenalty', 'Lần tưới dồn dập', '', 0],
  ['reward', 'Phần thưởng tích lũy', '', 1],
];

const charts = {
  moisture: ['Độ ẩm đất (%)', (r) => r.moisture * 100, { min: 0, max: 100 }],
  temperature: ['Nhiệt độ (°C)', (r) => r.temperature, { min: 15, max: 45 }],
  rain: ['Lượng mưa dự báo (mm)', (r) => r.rainForecastMm, {}],
  water: ['Nước tưới (L)', (r) => r.waterLiters, {}],
  reward: ['Phần thưởng tích lũy', (_, sum) => sum, {}],
  trainingReward: ['Learning curve · Reward', (r) => r.reward, {}],
  trainingLoss: ['Learning curve · Loss', (r) => r.loss, {}],
};

function Section({ title, children }) {
  return <section className="study panel"><h1 className="viewtitle">{title}</h1>{children}</section>;
}

function Status({ message, error = false }) {
  return message && <p className={error ? 'study-error' : 'study-status'} role={error ? 'alert' : 'status'}>{message}</p>;
}

async function readJson(file) {
  if (!file) throw new Error('Chọn một tệp JSON.');
  if (file.size > 2_000_000) throw new Error('Tệp lớn hơn 2 MB.');
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error('Tệp JSON không hợp lệ.');
  }
}

function defaultProfile(state) {
  const first = state.series[0];
  return {
    crop: state.crop, scenario: state.scenario, seed: state.seed, pumpFlow: 25,
    initialState: { growth_stage: first.stage, soil_moisture: first.previousMoisture,
      temperature: first.temperature },
  };
}

export function Environment({ profile, save, state, apply }) {
  const [draft, setDraft] = useState(() => profile ?? defaultProfile(state));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function setValue(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setMessage('');
    setError('');
  }
  function setInitial(key, value) {
    setDraft((prev) => ({ ...prev, initialState: { ...prev.initialState, [key]: value } }));
    setMessage('');
    setError('');
  }
  function readNumber(input) {
    return input.value === '' ? undefined : input.valueAsNumber;
  }
  async function importProfile(event) {
    try {
      const imported = await readJson(event.target.files[0]);
      const next = {
        ...draft, crop: imported.crop ?? draft.crop, scenario: imported.scenario ?? draft.scenario,
        seed: imported.seed ?? draft.seed, initialState: imported.initial_state ?? imported.initialState ?? draft.initialState,
        pumpFlow: imported.pumpFlow ?? draft.pumpFlow, pumpPowerKw: imported.pumpPowerKw ?? draft.pumpPowerKw,
        weather: imported.weather ? validateWeather(imported.weather, state.meta.maxDays) : undefined,
      };
      if (!imported.initialState && !imported.initial_state && !imported.weather) throw new Error('Tệp thiếu initial_state hoặc weather.');
      setDraft(validateProfile(next, state.meta));
      setMessage('Đã nạp cấu hình vào biểu mẫu.');
      setError('');
    } catch (issue) {
      setError(issue.message);
      setMessage('');
    } finally {
      event.target.value = '';
    }
  }
  async function submit(event) {
    event.preventDefault();
    const start = event.nativeEvent.submitter?.value === 'start';
    setBusy(true);
    setError('');
    setMessage('');
    try {
      validateProfile(draft, state.meta);
      save(draft);
      if (start) await apply(draft);
      else setMessage('Đã lưu cấu hình môi trường thành công.');
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return <Section title="Thiết lập thông số môi trường">
    <form onSubmit={submit}>
      <div className="study-grid">
        <label>Giống cây<select value={draft.crop} onChange={(e) => setValue('crop', Number(e.target.value))}>
          {state.meta.crops.map((crop) => <option key={crop.code} value={crop.code}>{crop.label}</option>)}
        </select></label>
        <label>Giai đoạn sinh trưởng<select value={draft.initialState.growth_stage} onChange={(e) => setInitial('growth_stage', Number(e.target.value))}>
          {state.meta.stages.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select></label>
        {observationFields.map(({ key, label, min, max, required }) =>
          <label key={key}>{label}<input type="number" step="any" min={min} max={max} required={required}
            value={draft.initialState[key] ?? ''} onChange={(e) => setInitial(key, readNumber(e.target))} /></label>)}
        <label>Kịch bản thời tiết<select value={draft.scenario} onChange={(e) => {
          setDraft({ ...draft, scenario: e.target.value, weather: undefined }); setMessage(''); setError('');
        }}>
          {state.meta.scenarios.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Seed<input type="number" min="0" max="4294967295" step="1" required
          value={draft.seed ?? ''} onChange={(e) => setValue('seed', readNumber(e.target))} /></label>
        <label>Lưu lượng bơm (L/phút)<input type="number" step="any" min=".001"
          value={draft.pumpFlow ?? ''} onChange={(e) => setValue('pumpFlow', readNumber(e.target))} /></label>
        <label>Công suất bơm (kW)<input type="number" step="any" min=".001"
          value={draft.pumpPowerKw ?? ''} onChange={(e) => setValue('pumpPowerKw', readNumber(e.target))} /></label>
        <label>Tải lên kịch bản<input type="file" accept=".json,application/json" onChange={importProfile} /></label>
      </div>
      {draft.weather && <p className="study-status">Đã nạp {draft.weather.length} bản ghi thời tiết.</p>}
      <Status message={error} error />
      <Status message={message} />
      <div className="study-actions">
        <button type="submit" value="save" disabled={busy}>Lưu thiết lập</button>
        <button type="submit" value="start" disabled={busy}>{busy ? 'Đang khởi tạo…' : 'Áp dụng và chạy mô phỏng'}</button>
      </div>
    </form>
  </Section>;
}

export function Training({ profile, addRun }) {
  const [algorithm, setAlgorithm] = useState('q_learning');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function importLog(event) {
    const file = event.target.files[0];
    if (!file) return;
    setMessage('');
    setError('');
    try {
      if (file.size > 2_000_000) throw new Error('Tệp lớn hơn 2 MB.');
      const series = trainingLog(await file.text());
      addRun({ id: crypto.randomUUID(), title: file.name, algorithm, kind: 'training',
        date: new Date().toISOString(), series });
      setMessage('Đã nạp nhật ký huấn luyện. Mở Báo cáo kết quả để xem Reward và Loss.');
    } catch (issue) {
      setError(issue.message);
    } finally {
      event.target.value = '';
    }
  }

  return <Section title="Huấn luyện thuật toán RL">
    <form>
      <div className="study-grid">
        <label>Thuật toán<select value={algorithm} onChange={(event) => setAlgorithm(event.target.value)}><option value="q_learning">Q-Learning</option><option value="dqn">DQN</option></select></label>
        <label>Learning Rate (α)<input type="number" min=".000001" max="1" step="any" required /></label>
        <label>Discount Factor (γ)<input type="number" min="0" max="1" step="any" defaultValue=".99" required /></label>
        <label>Xác suất khám phá (ε)<input type="number" min="0" max="1" step="any" /></label>
        <label>Total Timesteps<input type="number" min="1" step="1" required /></label>
        <label>Nhật ký huấn luyện CSV<input type="file" accept=".csv,text/csv" onChange={importLog} /></label>
      </div>
      <Status message={profile ? 'Chưa kết nối dịch vụ huấn luyện Q-Learning và DQN.' : 'Cần lưu thiết lập môi trường và kết nối dịch vụ huấn luyện.'} />
      <Status message={error} error />
      <Status message={message} />
      <div className="study-actions"><button type="button" disabled>Bắt đầu huấn luyện</button></div>
    </form>
  </Section>;
}

export function Experiment({ profile, state, addRun }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function run(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const weather = validateWeather(await readJson(file), state.meta.maxDays);
      const chosen = profile ?? { crop: state.crop, scenario: state.scenario, seed: state.seed };
      const payload = await api.createSession({
        ...chosen, weather, startDay: state.meta.maxDays,
      }, { timeoutMs: 15000 });
      const episode = normalizeEpisode(payload);
      const result = runRow(episode, 'baseline', chosen, file.name);
      addRun(result);
      setMessage(`Thử nghiệm Baseline hoàn tất. Đã lưu ${result.series.length} bước để xem báo cáo.`);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return <Section title="Thử nghiệm đa kịch bản">
    <form onSubmit={run}>
      <div className="study-grid">
        <label>Nguồn kịch bản thời tiết<input type="file" accept=".json,application/json" required disabled={busy} onChange={(e) => setFile(e.target.files[0])} /></label>
        <label>Mô hình<select defaultValue="baseline" disabled={busy}>
          <option value="baseline">{STRATEGIES.baseline}</option>
          <option disabled>Q-Learning · chưa có mô hình</option><option disabled>DQN · chưa có mô hình</option>
        </select></label>
      </div>
      <p className="study-status">JSON gồm {state.meta.maxDays + 1} dòng có các trường <code>temperature</code>, <code>rain_probability</code>, <code>rain_forecast_mm</code> và <code>actual_rain_mm</code>.</p>
      <Status message={message} />
      <Status message={error} error />
      <div className="study-actions"><button disabled={busy} type="submit">{busy ? 'Đang chạy thử nghiệm…' : 'Chạy thử nghiệm'}</button></div>
    </form>
  </Section>;
}

function resultLabel(run) {
  const strategy = Object.hasOwn(STRATEGIES, run.algorithm) ? STRATEGIES[run.algorithm] : null;
  if (!strategy) return run.title;
  return run.kind === 'training' ? `${strategy} · ${run.title}` : `${strategy} · ${run.title} · seed ${run.seed}`;
}

function displayMetric(value, key, unit, digits) {
  if (value == null) return '—';
  return `${formatNumber(key === 'idealRatio' ? value * 100 : value, digits)}${unit ? ` ${unit}` : ''}`;
}

function metricsFor(run) {
  const totals = summarize(run.series, run);
  return summaryRows.map(([key, label, unit, digits]) => [label, displayMetric(totals[key], key, unit, digits)]);
}

function MetricTable({ runs }) {
  const columns = runs.map(metricsFor);
  return <div className="study-table-wrap"><table className="study-table">
    <thead><tr><th scope="col">Chỉ số</th>{runs.map((run) => <th scope="col" key={run.id}>{resultLabel(run)}</th>)}</tr></thead>
    <tbody>{summaryRows.map(([key, label], index) => <tr key={key}>
      <th scope="row">{label}</th>{runs.map((run, col) => <td key={run.id}>{columns[col][index][1]}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

const colors = ['#396782', '#946339', '#63548b'];

function ResearchChart({ runs, metric, container }) {
  useEffect(() => {
    const [label, getValue, bounds] = charts[metric];
    const chart = chartCanvas('line', label, {});
    container.current.replaceChildren(chart.node);
    chart.update(runs[0].series.map(({ day }) => day), runs.map((run, index) => {
      let total = 0;
      return {
        label: resultLabel(run),
        data: run.series.map((record) => { total += record.reward; return getValue(record, total); }),
        borderColor: colors[index], backgroundColor: colors[index], pointRadius: 2, borderWidth: 2,
      };
    }), bounds, {});
    return () => chart.destroy();
  }, [runs, metric, container]);
  return <div className="study-chart" ref={container} />;
}

export function Compare({ runs, addRun }) {
  const [ids, setIds] = useState(['', '']);
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState('');
  const container = useRef(null);
  async function loadResult(event) {
    try {
      const episode = importRun(await readJson(event.target.files[0]));
      addRun(runRow(episode, episode.algorithm, null, event.target.files[0].name));
      setError('');
    } catch (issue) {
      setError(issue.message);
    } finally {
      event.target.value = '';
    }
  }
  function compare(event) {
    event.preventDefault();
    setError('');
    try {
      const selected = ids.map((id) => runs.find((run) => run.id === id));
      const { length, trimmed } = alignRuns(selected);
      setComparison({ runs: selected.map((run) => ({ ...run, series: run.series.slice(0, length) })), trimmed, length });
    } catch (issue) {
      setComparison(null);
      setError(issue.message);
    }
  }
  async function exportPdf() {
    if (!comparison) return;
    try {
      const lines = comparison.runs.flatMap((run) => [
        resultLabel(run),
        ...metricsFor(run).map(([label, value]) => `${label}  ${value}`),
      ]);
      await downloadReportPdf(['So sánh chiến lược AgriWater-RL', `${comparison.length} bước chung`, ...lines],
        container.current.querySelector('canvas'));
    } catch {
      setError('Không thể xuất báo cáo PDF.');
    }
  }

  return <Section title="So sánh chiến lược">
    <form onSubmit={compare}>
      <div className="study-grid">
        {ids.map((id, index) => <label key={index}>Chiến lược {index + 1}
          <select required value={id} onChange={(e) => {
            setIds(ids.map((value, slot) => slot === index ? e.target.value : value));
            setComparison(null);
          }}>
            <option value="">Chọn kết quả đã lưu</option>
            {runs.map((run) => <option key={run.id} value={run.id}
              disabled={ids.some((value, slot) => slot !== index && value === run.id)}>{resultLabel(run)}</option>)}
          </select>
        </label>)}
        <label>Nhập kết quả episode<input type="file" accept=".json,application/json" onChange={loadResult} /></label>
      </div>
      <Status message={error} error />
      {new Set(runs.map((run) => run.algorithm)).size < 2 && <p className="study-status">Cần kết quả đã lưu của ít nhất hai chiến lược khác nhau.</p>}
      <div className="study-actions">
        {ids.length < 3 && <button type="button" onClick={() => { setIds([...ids, '']); setComparison(null); }}>+ Chiến lược 3</button>}
        {ids.length === 3 && <button type="button" onClick={() => { setIds(ids.slice(0, 2)); setComparison(null); }}>Bỏ chiến lược 3</button>}
        <button type="submit" disabled={ids.some((id) => !id)}>Phân tích đối chiếu</button>
      </div>
    </form>
    {comparison && <>
      <Status message={comparison.trimmed ? `Độ dài khác nhau. Đối chiếu ${comparison.length} bước chung.` : 'Dữ liệu so sánh đã sẵn sàng.'} />
      <MetricTable runs={comparison.runs} />
      <ResearchChart runs={comparison.runs} metric="moisture" container={container} />
      <div className="study-chart-key">{comparison.runs.map((run, index) =>
        <span key={run.id} style={{ color: colors[index] }}>{STRATEGIES[run.algorithm]}</span>)}</div>
      <div className="study-actions">
        <button type="button" onClick={() => downloadComparisonCsv(comparison.runs.map((run) => ({
          algorithm: run.algorithm, steps: run.series.length, ...summarize(run.series, run),
        })))}>Xuất CSV đối chiếu</button>
        <button type="button" onClick={exportPdf}>Xuất PDF đối chiếu</button>
      </div>
    </>}
  </Section>;
}

export function Report({ runs, state }) {
  const [source, setSource] = useState('current');
  const [metric, setMetric] = useState('moisture');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const container = useRef(null);
  const datedRuns = runs.filter((run) => (!from || run.date.slice(0, 10) >= from) && (!to || run.date.slice(0, 10) <= to));
  const selected = datedRuns.find((run) => run.id === source);
  const metrics = selected?.kind === 'training'
    ? ['trainingReward', ...(selected.series.some((row) => row.loss != null) ? ['trainingLoss'] : [])]
    : ['moisture', 'temperature', 'rain', 'water', 'reward'];
  const selectedMetric = metrics.includes(metric) ? metric : metrics[0];

  function show(event) {
    event.preventDefault();
    setError('');
    const current = state.dataSource === 'mock' ? null : {
      id: 'current', title: 'Phiên đang xem', series: state.series.slice(0, state.day),
      pumpPowerKw: state.appliedProfile?.pumpPowerKw, pumpFlow: state.appliedProfile?.pumpFlow,
    };
    const run = source === 'current' && !from && !to ? current : datedRuns.find((row) => row.id === source);
    if (!run?.series.length || (from && to && from > to)) {
      setReport(null);
      setError(from && to && from > to ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'
        : 'Không có dữ liệu để hiển thị. Vui lòng hoàn thành thử nghiệm hoặc nạp kết quả.');
      return;
    }
    setReport({ runs: [run], metric: selectedMetric });
  }

  async function exportPdf() {
    const run = report?.runs[0];
    if (!run || exporting) return;
    setExporting(true);
    try {
      await downloadReportPdf(['Báo cáo AgriWater-RL', resultLabel(run), charts[report.metric][0],
        ...(run.kind === 'training' ? [`Số episode  ${run.series.length}`]
          : metricsFor(run).map(([label, value]) => `${label}  ${value}`))],
      container.current.querySelector('canvas'));
    } catch {
      setError('Không thể xuất báo cáo PDF.');
    } finally {
      setExporting(false);
    }
  }
  return <section className="study panel study-report" aria-labelledby="report-title">
    <h2 id="report-title" className="viewtitle">Báo cáo kết quả</h2>
    <form onSubmit={show}>
      <div className="study-grid">
        <label>Từ ngày lưu kết quả<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setSource(''); }} /></label>
        <label>Đến ngày lưu kết quả<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setSource(''); }} /></label>
        <label>Nguồn kết quả<select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Chọn kết quả</option>
          {!from && !to && state.dataSource !== 'mock' && <option value="current">Phiên đang xem</option>}
          {datedRuns.map((run) => <option key={run.id} value={run.id}>{resultLabel(run)}</option>)}
        </select></label>
        <label>Loại đồ thị<select value={selectedMetric} onChange={(e) => setMetric(e.target.value)}>
          {metrics.map((key) => <option key={key} value={key}>{charts[key][0]}</option>)}
        </select></label>
      </div>
      <div className="study-actions"><button type="submit">Xem dữ liệu</button></div>
    </form>
    <Status message={error} error />
    {report && <>
      {report.runs[0].kind !== 'training' && <MetricTable runs={report.runs} />}
      <ResearchChart runs={report.runs} metric={report.metric} container={container} />
      <div className="study-actions">
        <button type="button" onClick={() => (report.runs[0].kind === 'training' ? downloadTrainingCsv : downloadResultCsv)(report.runs[0])}>Xuất CSV</button>
        <button type="button" disabled={exporting} onClick={exportPdf}>Xuất báo cáo PDF</button>
      </div>
    </>}
  </section>;
}
