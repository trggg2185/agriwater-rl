import React, { useEffect, useRef, useState } from 'react';
import * as api from '../data/apiClient.js';
import { normalizeEpisode } from '../data/replay.js';
import { actualRainField, alignRuns, episodeOverview, importRun, observationFields, runRow, STRATEGIES, summarize, switchScenario, trainingLog, validateProfile, validateWeather } from '../data/research.js';
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

function Section({ title, description, children }) {
  return <section>
    <header className="study-heading"><h1 className="viewtitle">{title}</h1>{description && <p>{description}</p>}</header>
    <div className="study panel">{children}</div>
  </section>;
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
    initialState: { growth_stage: first.stage, soil_moisture: first.previousMoisture },
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
      else setMessage('Đã lưu thiết lập. Bấm Áp dụng và chạy mô phỏng để mở phiên mới.');
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return <Section title="Thiết lập ruộng" description="Điều kiện ban đầu cho một vụ mới">
    <form onSubmit={submit}>
      <div className="study-grid">
        <label>Kịch bản thời tiết<select value={draft.scenario} onChange={(e) => {
          setDraft(switchScenario(draft, e.target.value));
          setMessage(''); setError('');
        }}>
          {state.meta.scenarios.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Giống cây<select value={draft.crop} onChange={(e) => setValue('crop', Number(e.target.value))}>
          {state.meta.crops.map((crop) => <option key={crop.code} value={crop.code}>{crop.label}</option>)}
        </select></label>
        <label>Seed<input type="number" min="0" max="4294967295" step="1" required
          value={draft.seed ?? ''} onChange={(e) => setValue('seed', readNumber(e.target))} /></label>
        <label>Độ ẩm đất (0–1)<input type="number" step="any" min="0" max="1" required
          value={draft.initialState.soil_moisture ?? ''} onChange={(e) => setInitial('soil_moisture', readNumber(e.target))} /></label>
      </div>
      <details className="study-details" onInvalid={(event) => { event.currentTarget.open = true; }}><summary>Thông số thêm</summary>
        <div className="study-grid">
          <label>Giai đoạn sinh trưởng<select value={draft.initialState.growth_stage} onChange={(e) => setInitial('growth_stage', Number(e.target.value))}>
            {state.meta.stages.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select></label>
          {[...observationFields.filter(({ key }) => key !== 'soil_moisture'), actualRainField].map(({ key, label, min, max }) =>
            <label key={key}>{label}<input type="number" step="any" min={min} max={max}
              placeholder={key !== 'last_irrigation_liters' ? (draft.weather ? 'Theo tệp thời tiết' : 'Theo kịch bản') : undefined}
              value={draft.initialState[key] ?? ''} onChange={(e) => setInitial(key, readNumber(e.target))} /></label>)}
          <label>Lưu lượng bơm (L/phút)<input type="number" step="any" min=".001"
            value={draft.pumpFlow ?? ''} onChange={(e) => setValue('pumpFlow', readNumber(e.target))} /></label>
          <label>Công suất bơm (kW)<input type="number" step="any" min=".001"
            value={draft.pumpPowerKw ?? ''} onChange={(e) => setValue('pumpPowerKw', readNumber(e.target))} /></label>
          <label>Tải lên kịch bản<input type="file" accept=".json,application/json" onChange={importProfile} /></label>
        </div>
        <p className="study-status">Các giá trị thời tiết nhập tay chỉ áp dụng cho ngày đầu.
          Để trống để lấy dữ liệu theo kịch bản hoặc tệp đã nạp.</p>
      </details>
      {draft.weather && <p className="study-status">Đã nạp {draft.weather.length} bản ghi thời tiết.</p>}
      <Status message={error} error />
      <Status message={message} />
      <div className="study-actions">
        <button type="submit" value="save" disabled={busy}>Lưu thiết lập</button>
        <button type="submit" className="is-primary" value="start" disabled={busy}>{busy ? 'Đang khởi tạo…' : 'Áp dụng và chạy mô phỏng'}</button>
      </div>
    </form>
  </Section>;
}

export function Training({ profile, state, addRun, refreshPolicies, navigate }) {
  const [algorithm, setAlgorithm] = useState('q_learning');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState(() => sessionStorage.getItem('agriwater.training.active'));
  const [progress, setProgress] = useState(null);
  const busy = starting || Boolean(jobId);
  const [learningRate, setLearningRate] = useState('0.1');

  useEffect(() => {
    if (!jobId) return;
    let disposed = false;
    let timer;
    const history = [];
    function clearJob() {
      sessionStorage.removeItem('agriwater.training.active');
      setJobId(null);
    }
    async function check() {
      try {
        const job = await api.getTraining(jobId, history.length);
        if (disposed) return;
        history.push(...job.series);
        setProgress(job);
        setError('');
        if (history.length < job.completedEpisodes || job.status === 'running') {
          timer = window.setTimeout(check, history.length < job.completedEpisodes ? 0 : 900);
          return;
        }
        if (job.status === 'completed') {
          addRun({
            id: job.id, title: `Huấn luyện · seed ${job.seed}`, algorithm: job.algorithm,
            kind: 'training', date: new Date().toISOString(), series: history,
          });
          setMessage(`${STRATEGIES[job.algorithm]} đã sẵn sàng. Đã lưu đường học vào Báo cáo kết quả.`);
          void refreshPolicies();
        } else {
          setError(job.error);
        }
        clearJob();
      } catch (issue) {
        if (disposed) return;
        setError(issue.message);
        if (issue.message.startsWith('404 ')) clearJob();
        else timer = window.setTimeout(check, 2500);
      }
    }
    void check();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [jobId, addRun, refreshPolicies]);

  async function start(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    setMessage('');
    setProgress(null);
    setStarting(true);
    try {
      const job = await api.startTraining({
        algorithm,
        scenario: profile?.scenario ?? 'mixed',
        seed: profile?.seed ?? state.seed,
        total_timesteps: Number(data.get('totalTimesteps')),
        learning_rate: Number(learningRate),
        gamma: Number(data.get('gamma')),
        epsilon_start: Number(data.get('epsilon')),
      });
      sessionStorage.setItem('agriwater.training.active', job.id);
      setJobId(job.id);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setStarting(false);
    }
  }

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

  return <Section title="Huấn luyện mô hình" description="Tạo mô hình để dùng khi tưới tự động">
    <form onSubmit={start}>
      <div className="study-grid">
        <label>Thuật toán<select value={algorithm} disabled={busy} onChange={(event) => {
          setAlgorithm(event.target.value);
          setLearningRate(event.target.value === 'dqn' ? '0.001' : '0.1');
        }}><option value="q_learning">Q-Learning</option><option value="dqn">DQN</option></select></label>
        <label>Số bước huấn luyện (Total Timesteps)<input name="totalTimesteps" type="number" min="1" max="450000" step="1" defaultValue="30000" required disabled={busy} /></label>
      </div>
      <details className="study-details" onInvalid={(event) => { event.currentTarget.open = true; }}><summary>Thông số học và nhập nhật ký</summary>
        <div className="study-grid">
          <label>Tốc độ học (α)<input type="number" min=".000001" max="1" step="any" value={learningRate} onChange={(event) => setLearningRate(event.target.value)} required disabled={busy} /></label>
          <label>Hệ số chiết khấu (γ)<input name="gamma" type="number" min="0" max="0.9999999999999999" step="any" defaultValue=".99" required disabled={busy} /></label>
          <label>Xác suất khám phá ban đầu (ε)<input name="epsilon" type="number" min="0" max="1" step="any" defaultValue="1" required disabled={busy} /></label>
          <label>Nhật ký huấn luyện CSV<input type="file" accept=".csv,text/csv" onChange={importLog} disabled={busy} /></label>
        </div>
      </details>
      <p className="study-status">
        {profile ? `Kịch bản ${state.meta.scenarios.find(({ key }) => key === profile.scenario)?.label ?? profile.scenario} · Seed ${profile.seed}` : `Kết hợp ba kịch bản · seed ${state.seed}`}.
        {' '}Sau khi hoàn tất, mô hình mới sẽ được dùng cho các phiên mở sau đó.
      </p>
      {progress && <div className="study-progress" role="status">
        <progress aria-label="Tiến độ huấn luyện" value={progress.timesteps} max={progress.targetTimesteps} />
        <span>{progress.timesteps}/{progress.targetTimesteps} bước mô phỏng · {progress.completedEpisodes} tập đã ghi</span>
      </div>}
      <Status message={!state.apiConnected && !busy ? 'Chưa kết nối được API huấn luyện.' : ''} />
      <Status message={error} error />
      <Status message={message} />
      <div className="study-actions">
        <button className="is-primary" type="submit" disabled={busy || !state.apiConnected}>{busy ? 'Đang huấn luyện…' : 'Bắt đầu huấn luyện'}</button>
        {progress?.status === 'completed' && <button type="button" onClick={() => navigate('monitor')}>Về Ruộng để chọn mô hình</button>}
      </div>
    </form>
  </Section>;
}

export function Experiment({ profile, state, addRun, navigate }) {
  const [file, setFile] = useState(null);
  const [policy, setPolicy] = useState('baseline');
  const [scenario, setScenario] = useState(profile?.scenario ?? state.scenario);
  const [seed, setSeed] = useState(profile?.seed ?? state.seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const summary = result && episodeOverview(result);
  async function run(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const inputs = profile ? switchScenario(profile, scenario) : { crop: state.crop };
      const chosen = { ...inputs, scenario, seed: Number(seed) };
      const weather = file ? validateWeather(await readJson(file), state.meta.maxDays)
        : chosen.seed === profile?.seed ? chosen.weather : undefined;
      const payload = await api.runExperiment({ ...chosen, policy, weather });
      const episode = normalizeEpisode(payload);
      const result = runRow(episode, policy, chosen, file?.name ?? chosen.scenario);
      addRun(result);
      setResult(result);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return <Section title="Thử nghiệm" description="Chạy một chiến lược từ đầu đến cuối vụ">
    <form onSubmit={run}>
      <div className="study-grid">
        <label>Kịch bản<select value={scenario} disabled={busy} onChange={(e) => setScenario(e.target.value)}>
          {state.meta.scenarios.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Seed<input type="number" min="0" max="4294967295" step="1" value={seed} required disabled={busy} onChange={(e) => setSeed(e.target.value)} /></label>
        <label>Mô hình<select value={policy} disabled={busy} onChange={(e) => setPolicy(e.target.value)}>
          {Object.entries(STRATEGIES).map(([key, label]) => {
            const status = state.policies.find((item) => item.key === key);
            return <option key={key} value={key} disabled={!status?.available} title={status?.reason}>
              {label}{status?.available ? '' : ' · chưa sẵn sàng'}
            </option>;
          })}
        </select></label>
      </div>
      <details className="study-details"><summary>Dùng tệp thời tiết riêng</summary>
        <div className="study-grid"><label>Tệp thời tiết JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => setFile(e.target.files[0])} /></label></div>
        <p className="study-status">Tệp cần {state.meta.maxDays + 1} bản ghi gồm nhiệt độ, xác suất mưa, mưa dự báo và mưa thực tế.</p>
      </details>
      {summary && <p className="study-outcome" role="status"><strong>{STRATEGIES[result.algorithm]} · {outcomeLabel(summary)} · {summary.days} ngày · {formatNumber(summary.water, 0)} L</strong></p>}
      <Status message={error} error />
      <div className="study-actions"><button className="is-primary" disabled={busy || !state.policies.some((item) => item.key === policy && item.available)} type="submit">{busy ? 'Đang chạy thử nghiệm…' : 'Chạy thử nghiệm'}</button>{summary && <button type="button" onClick={() => navigate('compare')}>Mở bảng so sánh</button>}</div>
    </form>
  </Section>;
}

function resultLabel(run) {
  const strategy = Object.hasOwn(STRATEGIES, run.algorithm) ? STRATEGIES[run.algorithm] : null;
  if (!strategy) return run.title;
  return run.kind === 'training' ? `${strategy} · ${run.title}` : `${strategy} · ${run.title} · seed ${run.seed}`;
}

const runDateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });

function runOptionLabel(run) {
  const label = resultLabel(run);
  const when = Date.parse(run.date);
  return Number.isFinite(when) ? `${label} · ${runDateTime.format(when)}` : label;
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

function outcomeLabel({ outcome }) {
  return { completed: 'Hết vụ', terminated: 'Cây chết', in_progress: 'Đang mô phỏng' }[outcome];
}

function daysLabel({ days, maxDays }) {
  return maxDays ? `${days}/${maxDays}` : `${days} ngày`;
}

function OutcomeTable({ runs }) {
  const summaries = runs.map(episodeOverview);
  return <table className="study-table study-table--outcomes">
    <thead><tr><th scope="col">Chỉ số</th>{runs.map((run) =>
      <th scope="col" key={run.id}>{STRATEGIES[run.algorithm] ?? run.title}</th>)}</tr></thead>
    <tbody>
      <tr><th scope="row">Cây sống đến</th>{summaries.map((summary, index) =>
        <td key={runs[index].id}><strong>{daysLabel(summary)}</strong><small>{outcomeLabel(summary)}</small></td>)}</tr>
      <tr><th scope="row">Tổng nước tưới</th>{summaries.map((summary, index) =>
        <td key={runs[index].id}><strong>{formatNumber(summary.water, 0)} L</strong></td>)}</tr>
      <tr><th scope="row">Ngày đủ ẩm</th>{summaries.map((summary, index) =>
        <td key={runs[index].id}><strong>{summary.idealDays}/{summary.days}</strong></td>)}</tr>
    </tbody>
  </table>;
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

export function Compare({ runs, addRun, meta, navigate }) {
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
      setComparison({ fullRuns: selected, runs: selected.map((run) => ({ ...run, series: run.series.slice(0, length) })), trimmed, length });
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
      const full = comparison.fullRuns.map((run) => {
        const summary = episodeOverview(run);
        return `${STRATEGIES[run.algorithm]} · ${daysLabel(summary)} · ${outcomeLabel(summary)} · ${summary.water} L cả vụ`;
      });
      await downloadReportPdf(['So sánh chiến lược AgriWater-RL', ...full, `Chi tiết ${comparison.length} ngày chung`, ...lines],
        container.current.querySelector('canvas'));
    } catch {
      setError('Không thể xuất báo cáo PDF.');
    }
  }

  const first = comparison?.fullRuns[0];
  const condition = first && [
    meta.crops.find(({ code }) => code === first.crop)?.label,
    meta.scenarios.find(({ key }) => key === first.scenario)?.label ?? first.scenario,
    `Seed ${first.seed}`,
  ].filter(Boolean).join(' · ');
  return <Section title="So sánh chiến lược" description={condition ?? 'Đối chiếu các chiến lược trên cùng điều kiện ban đầu'}>
    <form onSubmit={compare}>
      <div className="study-grid">
        {ids.map((id, index) => <label key={index}>Chiến lược {index + 1}
          <select required value={id} onChange={(e) => {
            setIds(ids.map((value, slot) => slot === index ? e.target.value : value));
            setComparison(null);
          }}>
            <option value="">Chọn kết quả đã lưu</option>
            {runs.map((run) => <option key={run.id} value={run.id}
              disabled={ids.some((value, slot) => slot !== index && value === run.id)}>{runOptionLabel(run)}</option>)}
          </select>
        </label>)}
        <label>Nhập kết quả episode<input type="file" accept=".json,application/json" onChange={loadResult} /></label>
      </div>
      <Status message={error} error />
      {new Set(runs.map((run) => run.algorithm)).size < 2 && <p className="study-status">Cần kết quả đã lưu của ít nhất hai chiến lược khác nhau.</p>}
      <div className="study-actions">
        {ids.length < 3 && <button type="button" onClick={() => { setIds([...ids, '']); setComparison(null); }}>+ Chiến lược 3</button>}
        {ids.length === 3 && <button type="button" onClick={() => { setIds(ids.slice(0, 2)); setComparison(null); }}>Bỏ chiến lược 3</button>}
        <button className="is-primary" type="submit" disabled={ids.some((id) => !id)}>Phân tích đối chiếu</button>
        <button type="button" onClick={() => navigate('experiment')}>Về Thử nghiệm</button>
      </div>
    </form>
    {comparison && <>
      <div className="study-results">
        <h2>Kết quả cả vụ</h2>
        <OutcomeTable runs={comparison.fullRuns} />
      </div>
      <div className="study-results">
        <h2>Độ ẩm theo ngày</h2>
        {comparison.trimmed && <Status message={`Biểu đồ và chỉ số chi tiết dùng ${comparison.length} ngày chung.`} />}
        <ResearchChart runs={comparison.runs} metric="moisture" container={container} />
        <div className="study-chart-key">{comparison.runs.map((run, index) =>
          <span key={run.id} style={{ color: colors[index] }}>{STRATEGIES[run.algorithm]}</span>)}</div>
      </div>
      <details className="study-details"><summary>Chỉ số chi tiết · {comparison.length} ngày</summary>
        <MetricTable runs={comparison.runs} />
      </details>
      <div className="study-actions">
        <button type="button" onClick={() => downloadComparisonCsv(comparison.runs.map((run, index) => ({
          algorithm: run.algorithm, steps: run.series.length, ...summarize(run.series, run),
          fullRun: episodeOverview(comparison.fullRuns[index]),
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
      id: 'current', title: 'Phiên đang xem', series: state.series.slice(0, state.day), maxDays: state.meta.maxDays,
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
  return <Section title="Báo cáo kết quả" description="Xem biểu đồ và xuất số liệu của một lượt">
    <form onSubmit={show}>
      <div className="study-grid">
        <label>Nguồn kết quả<select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Chọn kết quả</option>
          {!from && !to && state.dataSource !== 'mock' && <option value="current">Phiên đang xem</option>}
          {datedRuns.map((run) => <option key={run.id} value={run.id}>{runOptionLabel(run)}</option>)}
        </select></label>
        <label>Loại đồ thị<select value={selectedMetric} onChange={(e) => setMetric(e.target.value)}>
          {metrics.map((key) => <option key={key} value={key}>{charts[key][0]}</option>)}
        </select></label>
      </div>
      <details className="study-details">
        <summary>Lọc theo ngày lưu kết quả</summary>
        <div className="study-grid">
          <label>Từ ngày lưu kết quả<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setSource(''); }} /></label>
          <label>Đến ngày lưu kết quả<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setSource(''); }} /></label>
        </div>
      </details>
      <div className="study-actions"><button className="is-primary" type="submit">Xem dữ liệu</button></div>
    </form>
    <Status message={error} error />
    {report && <>
      {report.runs[0].kind !== 'training' && <div className="study-results">
        <h2>Tóm tắt lượt chạy</h2>
        <OutcomeTable runs={report.runs} />
        <details className="study-details"><summary>Chỉ số chi tiết</summary><MetricTable runs={report.runs} /></details>
      </div>}
      <ResearchChart runs={report.runs} metric={report.metric} container={container} />
      <div className="study-actions">
        <button type="button" onClick={() => (report.runs[0].kind === 'training' ? downloadTrainingCsv : downloadResultCsv)(report.runs[0])}>Xuất CSV</button>
        <button type="button" disabled={exporting} onClick={exportPdf}>Xuất báo cáo PDF</button>
      </div>
    </>}
  </Section>;
}
