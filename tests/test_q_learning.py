"""Unit and integration tests for Tabular Q-learning agent, training, eval, and API hook."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from agriwater.agents.q_agent import QLearningAgent, StateDiscretizer
from agriwater.api import runtime
from agriwater.api.app import app
from agriwater.environment.observation import build_observation
from agriwater.evaluation.eval import evaluate_policies
from agriwater.training.train import train_q_learning


def test_discretizer_shape_and_total_states() -> None:
    disc = StateDiscretizer()
    assert disc.shape == (4, 2, 9, 3, 3, 3, 2)
    assert disc.num_states == 3888


def test_discretizer_clips_out_of_bounds_values() -> None:
    disc = StateDiscretizer()
    low_idx = disc.discretize(np.array([-5.0, -1.0, -0.5, -2.0, -0.1, -10.0, -0.2], dtype=np.float32))
    high_idx = disc.discretize(np.array([5.0, 2.0, 1.5, 3.0, 1.8, 9.0, 4.0], dtype=np.float32))

    assert low_idx == (0, 0, 0, 0, 0, 0, 0)
    # stage=3 (clipped from 2.0) maps to stage_bin=0 (only stage 2 maps to 1)
    assert high_idx == (3, 0, 8, 2, 2, 2, 1)


def test_discretizer_aligns_with_domain_thresholds() -> None:
    disc = StateDiscretizer()

    s_below = build_observation(
        crop_type=2,
        growth_stage=1,
        soil_moisture=0.599,
        temperature_c=24.9,
        rain_probability=0.699,
        rain_forecast_mm=14.9,
        last_irrigation_liters=10.0,
    )
    assert disc.discretize(s_below) == (2, 0, 4, 0, 1, 0, 0)

    s_at = build_observation(
        crop_type=3,
        growth_stage=2,
        soil_moisture=0.60,
        temperature_c=35.0,
        rain_probability=0.70,
        rain_forecast_mm=15.0,
        last_irrigation_liters=12.5,
    )
    assert disc.discretize(s_at) == (3, 1, 5, 2, 2, 1, 1)


def test_random_tie_breaking_avoids_action_zero_bias() -> None:
    agent = QLearningAgent(seed=123)
    state = build_observation(crop_type=0, growth_stage=0, soil_moisture=0.5)
    # All Q-values are tied at 0.0; greedy selection must break ties randomly across 0..5.
    chosen = {agent.select_action(state, training=False) for _ in range(60)}
    assert len(chosen) >= 4


def test_training_false_enforces_greedy_even_with_high_epsilon() -> None:
    agent = QLearningAgent(epsilon_start=1.0, seed=7)
    state = build_observation(crop_type=1, growth_stage=2, soil_moisture=0.45)
    idx = agent.discretizer.discretize(state)
    agent.q_table[idx][3] = 42.0

    for _ in range(25):
        assert agent.select_action(state, training=False) == 3


def test_update_distinguishes_terminated_and_truncated() -> None:
    s = build_observation(crop_type=0, growth_stage=0, soil_moisture=0.45)
    s_next = build_observation(crop_type=0, growth_stage=0, soil_moisture=0.55)

    # Case 1: terminated=True -> no bootstrapping
    agent_term = QLearningAgent(alpha=0.5, gamma=0.9, seed=0)
    agent_term.q_table[agent_term.discretizer.discretize(s_next)][2] = 100.0
    agent_term.update(s, action=1, reward=-100.0, next_state=s_next, terminated=True, truncated=False)
    assert agent_term.q_table[agent_term.discretizer.discretize(s)][1] == pytest.approx(-50.0)

    # Case 2: truncated=True, terminated=False -> must bootstrap gamma * max Q(s', a')
    agent_trunc = QLearningAgent(alpha=0.5, gamma=0.9, seed=0)
    agent_trunc.q_table[agent_trunc.discretizer.discretize(s_next)][2] = 100.0
    agent_trunc.update(s, action=1, reward=10.0, next_state=s_next, terminated=False, truncated=True)
    # target = 10 + 0.9 * 100 = 100 -> Q = 0 + 0.5 * 100 = 50
    assert agent_trunc.q_table[agent_trunc.discretizer.discretize(s)][1] == pytest.approx(50.0)


def test_epsilon_decay_clamps_at_epsilon_end() -> None:
    agent = QLearningAgent(epsilon_start=1.0, epsilon_end=0.05, epsilon_decay=0.5, seed=0)
    for _ in range(20):
        agent.decay_epsilon()
    assert agent.epsilon == pytest.approx(0.05)


def test_save_and_load_roundtrip(tmp_path: Path) -> None:
    agent = QLearningAgent(alpha=0.15, gamma=0.95, seed=42)
    s = build_observation(crop_type=2, growth_stage=2, soil_moisture=0.35)
    agent.q_table[agent.discretizer.discretize(s)][4] = 12.345

    ckpt = agent.save(tmp_path / "q_table.npz", metadata={"note": "test"})
    loaded = QLearningAgent.load(ckpt, seed=42)

    assert loaded.epsilon == 0.0
    assert loaded.alpha == pytest.approx(0.15)
    assert loaded.gamma == pytest.approx(0.95)
    assert np.allclose(loaded.q_table, agent.q_table)
    assert loaded.select_action(s, training=False) == 4


def test_train_eval_and_api_q_learning_smoke(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    model_path = tmp_path / "q_table.npz"
    log_path = tmp_path / "train_log.csv"
    plot_path = tmp_path / "curve.png"
    eval_csv = tmp_path / "eval.csv"
    eval_plot = tmp_path / "eval.png"

    agent, records = train_q_learning(
        scenario="mixed",
        episodes=25,
        seed=42,
        model_out=model_path,
        log_out=log_path,
        plot_out=plot_path,
        verbose=False,
    )
    assert len(records) == 25
    assert model_path.exists()
    assert log_path.exists()
    assert plot_path.exists()
    assert agent.q_table.shape == (4, 2, 9, 3, 3, 3, 2, 6)

    rows = evaluate_policies(
        model_path=model_path,
        episodes=3,
        seed=100,
        csv_out=eval_csv,
        plot_out=eval_plot,
        verbose=False,
    )
    assert len(rows) == 9  # 3 scenarios x 3 policies
    assert eval_csv.exists()
    assert eval_plot.exists()

    # Verify API loads the checkpoint and runs q_learning policy without breaking baseline.
    monkeypatch.setattr(runtime, "DEFAULT_Q_TABLE_PATH", model_path)
    runtime._Q_AGENT_CACHE.clear()
    client = TestClient(app)

    meta = client.get("/api/meta").json()
    assert "q_learning" in meta["availablePolicies"]

    session_resp = client.post(
        "/api/session",
        json={"scenario": "dry", "seed": 42, "crop": 1, "policy": "q_learning", "start_day": 5},
    )
    assert session_resp.status_code == 200
    body = session_resp.json()
    assert body["source"]["policy"] == "q_learning"
    assert len(body["series"]) == 5

    step_resp = client.post(
        "/api/step",
        json={"session_id": body["session_id"], "action": 0, "automatic": True},
    )
    assert step_resp.status_code == 200
    assert len(step_resp.json()["series"]) == 6
