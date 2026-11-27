"""Unit and integration tests for metrics, evaluation and training pipelines."""

import csv
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from agriwater.agents.base_agent import BaseAgent
from agriwater.agents.baseline import BaselineAgent
from agriwater.agents.dqn import DQNAgent
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.weather import generate_weather
from agriwater.evaluation.evaluate import evaluate, evaluate_scenario
from agriwater.evaluation.metrics import calculate_metrics, summarize_episodes
from agriwater.training.train import train


class _FixedSpyAgent(BaseAgent):
    def __init__(self, action: int = 0) -> None:
        self.action = action
        self.training_flags: list[bool] = []

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        self.training_flags.append(training)
        return self.action


def test_calculate_metrics_and_summary() -> None:
    transitions = [
        {
            "water_used_liters": 10.0,
            "reward": 6.0,
            "is_ideal": True,
            "is_stressed": False,
            "R_waste": 0.0,
            "R_rain": 0.0,
            "R_delay": 0.0,
            "terminated": False,
            "truncated": False,
        },
        {
            "water_used_liters": 20.0,
            "reward": -150.0,
            "is_ideal": False,
            "is_stressed": True,
            "R_waste": -40.0,
            "R_rain": -20.0,
            "R_delay": -32.0,
            "terminated": True,
            "truncated": False,
        },
    ]
    m = calculate_metrics(transitions, baseline_water=60.0)
    assert m["total_water_liters"] == 30.0
    assert m["total_reward"] == -144.0
    assert m["days_survived"] == 2.0
    assert m["ideal_days"] == 1.0
    assert m["ideal_ratio"] == pytest.approx(0.5)
    assert m["stress_days"] == 1.0
    assert m["overwater_days"] == 1.0
    assert m["rain_waste_days"] == 1.0
    assert m["delay_days"] == 1.0
    assert m["terminated"] == 1.0
    assert m["truncated"] == 0.0
    assert m["water_saving_pct"] == pytest.approx(50.0)

    summary = summarize_episodes([m, m])
    assert summary["total_reward"]["mean"] == pytest.approx(-144.0)
    assert summary["total_reward"]["std"] == pytest.approx(0.0)

    with pytest.raises(ValueError, match="empty"):
        calculate_metrics([])


def test_evaluate_replays_weather_immutably_and_sets_training_false() -> None:
    weather = generate_weather("dry", 11, seed=99)
    original_weather = [dict(day) for day in weather]
    env = AgriWaterEnv(scenario="dry", max_days=10)
    spy_a = _FixedSpyAgent(action=2)
    spy_b = _FixedSpyAgent(action=2)
    try:
        first = evaluate(spy_a, env, weather, seed=99)
        second = evaluate(spy_b, env, weather, seed=99)
    finally:
        env.close()

    assert first == second
    assert weather == original_weather
    assert spy_a.training_flags and all(flag is False for flag in spy_a.training_flags)


def test_train_saves_checkpoint_log_and_evaluates(tmp_path: Path) -> None:
    cfg: dict[str, Any] = {
        "gamma": 0.99,
        "learning_rate": 0.005,
        "epsilon_start": 1.0,
        "epsilon_end": 0.05,
        "epsilon_decay": 0.9,
        "batch_size": 4,
        "replay_buffer_size": 200,
        "target_update_steps": 5,
        "hidden_sizes": [16, 16],
        "device": "cpu",
    }
    agent = DQNAgent(cfg, seed=42)
    env = AgriWaterEnv(scenario="dry", max_days=10)
    ckpt_path = tmp_path / "dqn_best.pt"
    log_path = tmp_path / "train.csv"
    try:
        result = train(
            agent,
            env,
            episodes=6,
            seed=42,
            checkpoint_path=ckpt_path,
            log_path=log_path,
            eval_episodes=2,
            eval_every=3,
            randomize_crop=True,
        )
    finally:
        env.close()

    assert len(result["history"]) == 6
    assert ckpt_path.is_file()
    assert log_path.is_file()
    assert agent.epsilon < 1.0

    with log_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 6
    assert "mean_loss" in rows[0] and "epsilon" in rows[0]

    loaded = DQNAgent.from_checkpoint(ckpt_path)
    per_ep, summary = evaluate_scenario(loaded, "dry", episodes=3, seed=500, max_days=10)
    assert len(per_ep) == 3
    assert "total_reward" in summary


def test_train_rejects_non_learning_agent() -> None:
    env = AgriWaterEnv(scenario="dry", max_days=5)
    try:
        with pytest.raises(TypeError, match="learn"):
            train(BaselineAgent(), env, episodes=1)
    finally:
        env.close()


def test_train_supports_mixed_scenarios(tmp_path: Path) -> None:
    cfg: dict[str, Any] = {
        "gamma": 0.99,
        "learning_rate": 0.005,
        "epsilon_start": 1.0,
        "epsilon_end": 0.05,
        "epsilon_decay": 0.9,
        "batch_size": 4,
        "replay_buffer_size": 200,
        "target_update_steps": 5,
        "hidden_sizes": [16, 16],
        "device": "cpu",
        "loss": "huber",
        "double_dqn": True,
    }
    agent = DQNAgent(cfg, seed=7)
    env = AgriWaterEnv(scenario="dry", max_days=6)
    ckpt = tmp_path / "mixed.pt"
    try:
        result = train(
            agent,
            env,
            episodes=6,
            seed=7,
            checkpoint_path=ckpt,
            eval_episodes=2,
            eval_every=3,
            scenarios=("dry", "random", "stormy"),
        )
    finally:
        env.close()
    assert len(result["history"]) == 6
    assert result["best_val_reward"] is not None
    assert ckpt.is_file()
