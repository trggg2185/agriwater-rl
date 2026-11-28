import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { ChartNoAxesCombined, Sprout, FlaskConical, GitCompare, GraduationCap, Leaf, Settings2 } from 'lucide-react';
import { UI } from '../config.js';
import { Compare, Environment, Experiment, Report, Training } from './ResearchWorkspace.jsx';

const navIcons = {
  environment: Settings2, training: GraduationCap, experiment: FlaskConical,
  compare: GitCompare, monitor: Sprout, report: ChartNoAxesCombined,
};

function readSaved(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function ResearchViews({ store, actions, profile, saveProfile, runs, addRun, navigate }) {
  const state = useSyncExternalStore(store.subscribe, () => {
    const current = store.getState();
    return current.view === 'monitor' || current.view === 'training' ? null : current;
  });
  switch (state?.view) {
    case 'environment':
      return <Environment profile={profile} save={saveProfile} state={state} apply={actions.applyProfile} />;
    case 'experiment':
      return <Experiment profile={profile} state={state} addRun={addRun} navigate={navigate} />;
    case 'compare':
      return <Compare runs={runs.filter((run) => run.kind !== 'training')} addRun={addRun} meta={state.meta} navigate={navigate} />;
    case 'report':
      return <Report runs={runs} state={state} />;
    default:
      return null;
  }
}

export function Dashboard({ store, actions }) {
  const view = useSyncExternalStore(store.subscribe, () => store.getState().view);
  const storageWarning = useSyncExternalStore(store.subscribe, () => store.getState().storageWarning);
  const [profile, setProfile] = useState(() => readSaved('agriwater.environment.v1', null));
  const [runs, setRuns] = useState(() => readSaved('agriwater.results.v1', []));
  const runsRef = useRef(runs);

  function saveProfile(next) {
    localStorage.setItem('agriwater.environment.v1', JSON.stringify(next));
    setProfile(next);
  }

  const addRun = useCallback((run) => {
    if (runsRef.current.some(({ id }) => id === run.id)) return;
    const next = [...runsRef.current, run];
    try {
      localStorage.setItem('agriwater.results.v1', JSON.stringify(next));
    } catch {
      store.setState({ storageWarning: 'Bộ nhớ trình duyệt đã đầy. Hãy xuất kết quả trước khi đóng trang.' });
    }
    runsRef.current = next;
    setRuns(next);
  }, [store]);
  const navigate = useCallback((view) => {
    store.setState({ view, playing: false });
    window.scrollTo(0, 0);
  }, [store]);

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true"><Leaf size={16} /></span>
          <span className="brand__name">AgriWater-RL</span>
        </div>
        <nav className="nav" aria-label="Điều hướng chính">
          {UI.views.map(({ id, label }) => {
            const Icon = navIcons[id];
            return (
              <button className="nav__item" type="button" key={id} aria-label={label}
                aria-current={id === view ? 'page' : undefined} onClick={() => navigate(id)}>
                <Icon size={13} aria-hidden="true" />
                <span className="nav__label">{label}</span>
              </button>
            );
          })}
        </nav>
      </header>
      <main className={view === 'monitor' ? 'workspace workspace--field' : 'workspace'}>
        {storageWarning && <p className="study-status" role="status">{storageWarning}</p>}
        <div className="workspace-intro" hidden={view !== 'monitor'}>
          <div className="workspace-heading" />
          <button type="button" className="workspace-button" onClick={() => navigate('environment')}>Thiết lập ruộng</button>
        </div>
        <div className="workspace-grid grid" hidden={view !== 'monitor'}>
          <section className="field overflow-hidden" aria-labelledby="field-title">
            <div className="field__scene relative">
              <div className="field__viewport overflow-hidden">
                <span className="field__stage" />
                <div id="scene-root" className="absolute inset-0" role="group" tabIndex={0}
                  aria-label="Máy quay ruộng. Bật nút bàn tay để kéo, dùng phím mũi tên hoặc con lăn. Nhấn Escape để đặt lại" />
              </div>
            </div>
            <div className="field__controls" />
          </section>
          <aside className="panel field-summary">
            <h2>Chiến lược tưới</h2>
            <div className="field__strategy" />
            <button type="button" className="workspace-link" onClick={() => navigate('training')}>Xem mô hình đã huấn luyện</button>
            <div className="field__telemetry" />
            <button type="button" className="workspace-button" onClick={() => navigate('compare')}>So sánh các lượt đã chạy →</button>
          </aside>
        </div>
        <details className="workspace-details panel" hidden={view !== 'monitor'}>
          <summary>Dữ liệu ruộng và nhật ký</summary>
          <div className="workspace-data min-w-0" />
        </details>
        <div hidden={view !== 'training'}>
          <Training profile={profile} store={store} addRun={addRun} refreshPolicies={actions.refreshPolicies} navigate={navigate} />
        </div>
        <ResearchViews store={store} actions={actions} profile={profile} saveProfile={saveProfile}
          runs={runs} addRun={addRun} navigate={navigate} />
      </main>
    </>
  );
}
