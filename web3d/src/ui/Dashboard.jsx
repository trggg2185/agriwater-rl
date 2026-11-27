import React, { useState, useSyncExternalStore } from 'react';
import { ChartNoAxesCombined, FlaskConical, GitCompare, GraduationCap, Leaf, Settings2 } from 'lucide-react';
import { UI } from '../config.js';
import { Compare, Environment, Experiment, Report, Training } from './ResearchWorkspace.jsx';

const navIcons = {
  environment: Settings2, training: GraduationCap, experiment: FlaskConical,
  compare: GitCompare, monitor: ChartNoAxesCombined,
};

function readSaved(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function Dashboard({ store, actions }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { view } = state;
  const [profile, setProfile] = useState(() => readSaved('agriwater.environment.v1', null));
  const [runs, setRuns] = useState(() => readSaved('agriwater.results.v1', []));

  function saveProfile(next) {
    localStorage.setItem('agriwater.environment.v1', JSON.stringify(next));
    setProfile(next);
  }

  function addRun(run) {
    const next = [...runs, run];
    localStorage.setItem('agriwater.results.v1', JSON.stringify(next));
    setRuns(next);
  }
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true"><Leaf size={16} /></span>
          <span className="brand__name">AgriWater-RL</span>
        </div>
        <nav className="nav" aria-label="Điều hướng chính">
          {UI.views.map(({ id, label, shortLabel }) => {
            const Icon = navIcons[id];
            return (
              <button className="nav__item" type="button" key={id} aria-label={label}
                aria-pressed={id === view} onClick={() => store.setState({ view: id, playing: false })}>
                <Icon size={13} aria-hidden="true" />
                <span className="nav__label">{label}</span>
                {shortLabel && <span className="nav__label-short">{shortLabel}</span>}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="workspace">
        <div className="workspace-heading" hidden={view !== 'monitor'} />
        <div className="workspace-grid grid items-start" hidden={view !== 'monitor'}>
          <section className="field overflow-hidden" aria-labelledby="field-title">
            <header className="field__header">
              <h2 id="field-title">Thửa canh tác</h2>
              <span className="field__stage" />
            </header>
            <div className="field__scene relative">
              <div className="field__viewport overflow-hidden">
                <div id="scene-root" className="absolute inset-0" role="group" tabIndex={0}
                  aria-label="Máy quay ruộng. Dùng phím mũi tên để di chuyển, con lăn để thu phóng và Escape để đặt lại" />
              </div>
              <div className="field__telemetry" />
            </div>
            <div className="field__controls" />
          </section>
          <div className="workspace-data min-w-0" />
        </div>
        {view === 'environment' && <Environment profile={profile} save={saveProfile} state={state} apply={actions.applyProfile} />}
        {view === 'training' && <Training profile={profile} addRun={addRun} />}
        {view === 'experiment' && <Experiment profile={profile} state={state} addRun={addRun} />}
        {view === 'compare' && <Compare runs={runs.filter((run) => run.kind !== 'training')} addRun={addRun} />}
        {view === 'monitor' && <Report runs={runs} state={state} />}
      </main>
    </>
  );
}
