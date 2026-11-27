"""Tests cho thuật toán Baseline (mục 3 của báo cáo)."""

import numpy as np
import pytest

from agriwater.agents.baseline import (
    BaselineAgent,
    evaluate_baseline,
    main,
    run_baseline_episode,
    save_results_csv,
    summarize_results,
)
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.observation import build_observation


def _state(moisture: float) -> np.ndarray:
    return build_observation(crop_type=0, growth_stage=0, soil_moisture=moisture)


@pytest.mark.parametrize(
    ("moisture", "expected"),
    [(0.0, 4), (0.15, 4), (0.2999, 4), (0.30, 0), (0.31, 0), (0.6, 0), (1.0, 0)],
)
def test_threshold_policy(moisture: float, expected: int) -> None:
    assert BaselineAgent().select_action(_state(moisture)) == expected


def test_policy_is_deterministic_and_ignores_training_flag() -> None:
    agent = BaselineAgent()
    state = _state(0.25)
    actions = {agent.select_action(state, training=t) for t in (False, True) for _ in range(20)}
    assert actions == {4}


def test_only_soil_moisture_matters() -> None:
    agent = BaselineAgent()
    dry = build_observation(
        crop_type=3,
        growth_stage=2,
        soil_moisture=0.1,
        temperature_c=45,
        rain_probability=1.0,
        rain_forecast_mm=50,
        last_irrigation_liters=25,
    )
    assert agent.select_action(dry) == 4


def test_state_is_not_modified() -> None:
    state = _state(0.2)
    before = state.copy()
    BaselineAgent().select_action(state)
    np.testing.assert_array_equal(state, before)


def test_water_amount_mapping() -> None:
    agent = BaselineAgent()
    assert [agent.get_water_amount(a) for a in range(6)] == [0, 5, 10, 15, 20, 25]


def test_from_config_uses_action_liters() -> None:
    agent = BaselineAgent.from_config({"action_liters": [0, 1, 2, 3, 4, 5]})
    assert agent.get_water_amount(4) == 4


@pytest.mark.parametrize(
    "kwargs",
    [
        {"moisture_threshold": -0.1},
        {"moisture_threshold": 1.5},
        {"irrigation_action": 6},
        {"irrigation_action": -1},
        {"water_levels": [0, 5, 10]},
    ],
)
def test_invalid_parameters(kwargs: dict) -> None:
    with pytest.raises(ValueError):
        BaselineAgent(**kwargs)


def test_invalid_types() -> None:
    with pytest.raises(TypeError):
        BaselineAgent(irrigation_action=True)
    with pytest.raises(TypeError):
        BaselineAgent(moisture_threshold="0.3")
    with pytest.raises(ValueError):
        BaselineAgent().select_action(np.zeros(3, dtype=np.float32))


def test_episode_metrics_match_environment() -> None:
    env = AgriWaterEnv(scenario="dry")
    agent = BaselineAgent()
    result = run_baseline_episode(env, agent, seed=7)

    # Chạy lại tay cùng seed để đối chiếu từng bước.
    state, _ = env.reset(seed=7)
    reward_sum = water = stress = ideal = steps = 0
    while True:
        action = agent.select_action(state)
        state, reward, terminated, truncated, info = env.step(action)
        reward_sum += reward
        water += info["water_used_liters"]
        stress += info["is_stressed"]
        ideal += info["is_ideal"]
        steps += 1
        if terminated or truncated:
            break

    assert result["total_reward"] == pytest.approx(reward_sum)
    assert result["total_water"] == pytest.approx(water)
    assert result["stress_count"] == stress
    assert result["ideal_count"] == ideal
    assert result["steps"] == steps <= 30
    assert result["ideal_ratio"] == pytest.approx(ideal / steps)
    assert result["total_water"] % 20 == 0  # chỉ dùng action 0 hoặc 4


def test_episode_respects_max_steps() -> None:
    result = run_baseline_episode(AgriWaterEnv(scenario="random"), BaselineAgent(), 3, seed=1)
    assert result["steps"] == 3
    with pytest.raises(ValueError):
        run_baseline_episode(AgriWaterEnv(), BaselineAgent(), max_steps=0)


def test_dry_scenario_triggers_irrigation() -> None:
    results = evaluate_baseline(AgriWaterEnv(scenario="dry"), 5, seed=0, verbose=False)
    assert any(r["total_water"] > 0 for r in results)


def test_evaluation_is_reproducible() -> None:
    first = evaluate_baseline(AgriWaterEnv(scenario="random"), 4, seed=11, verbose=False)
    second = evaluate_baseline(AgriWaterEnv(scenario="random"), 4, seed=11, verbose=False)
    assert first == second
    assert [r["seed"] for r in first] == [11, 12, 13, 14]
    assert [r["episode"] for r in first] == [1, 2, 3, 4]


def test_summary_and_csv(tmp_path) -> None:
    results = evaluate_baseline(AgriWaterEnv(scenario="stormy"), 3, seed=5, verbose=False)
    summary = summarize_results(results)
    assert summary["episodes"] == 3
    assert 0.0 <= summary["ideal_ratio_mean"] <= 1.0
    assert 0.0 <= summary["termination_rate"] <= 1.0
    path = save_results_csv(results, tmp_path / "out" / "baseline.csv")
    lines = path.read_text("utf-8").strip().splitlines()
    assert lines[0].startswith("episode,seed,total_reward")
    assert len(lines) == 4
    with pytest.raises(ValueError):
        summarize_results([])


def test_cli(tmp_path, capsys) -> None:
    out = tmp_path / "b.csv"
    main(["--scenario", "dry", "--episodes", "2", "--seed", "1", "--output", str(out), "--quiet"])
    assert out.exists()
    assert "Baseline | scenario=dry" in capsys.readouterr().out
