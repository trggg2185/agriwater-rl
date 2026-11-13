"""Environment contracts available before simulation implementation."""

import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from agriwater.environment.agriwater_env import AgriWaterEnv


def test_spaces() -> None:
    env = AgriWaterEnv()
    assert env.observation_space.shape == (7,)
    assert env.observation_space.dtype == np.float32
    assert np.all(env.observation_space.low == 0)
    assert np.all(env.observation_space.high == 1)
    assert env.action_space.n == 6


@pytest.mark.parametrize("days", [0, -1, True, 1.5])
def test_invalid_duration(days: object) -> None:
    with pytest.raises(ValueError):
        AgriWaterEnv(max_days=days)


def test_invalid_scenario() -> None:
    with pytest.raises(ValueError):
        AgriWaterEnv(scenario="unknown")


@pytest.mark.skip(reason="Integration awaits Minh's loader/reward and agreed physical parameters")
def test_gymnasium_contract() -> None:
    check_env(AgriWaterEnv(), skip_render_check=True)


@pytest.fixture
def isolated(monkeypatch):
    """Synthetic physics and stub reward ONLY for Truong's unit tests."""
    from copy import deepcopy
    from pathlib import Path

    import yaml

    from agriwater.environment import agriwater_env, weather

    config = yaml.safe_load((Path(__file__).parents[1] / "configs/environment.yaml").read_text())
    config.update(
        initial_state=dict(crop_type=0, growth_stage=0, soil_moisture_range=[0.4, 0.6]),
        growth_stage_days=[8, 16, 24],
        biological_termination=[0.05, 0.95],
    )
    config["water_balance"] = dict(
        plot_area_m2=1.0,
        soil_capacity_liters=100.0,
        irrigation_efficiency=0.8,
        rain_efficiency=0.5,
        evapotranspiration_liters_per_day=2.0,
        et_temperature_slope=0.1,
        crop_factors=[1.0, 1.1, 1.2, 1.3],
        stage_factors=[1.0, 1.2, 1.4, 1.0],
        drainage_liters_per_day=5.0,
        drainage_threshold=0.7,
        repeat_irrigation_threshold_liters=12.5,
        repeat_irrigation_efficiency=0.5,
    )
    scenarios = {
        s: dict(
            temperature_range_c=[20, 30],
            rain_probability_range=[0.2, 0.8],
            rain_amount_range_mm=[0, 20],
        )
        for s in ("dry", "stormy", "random")
    }

    def loader(name):
        return deepcopy(config if name == "environment" else scenarios)

    monkeypatch.setattr(agriwater_env, "load_config", loader)
    monkeypatch.setattr(weather, "load_config", loader)
    monkeypatch.setattr(agriwater_env, "calculate_reward", lambda s, a, n: (0.0, {}))
    return config, scenarios


def fixed_weather(days=31, rain=0.0, temperature=15.0):
    return [
        dict(
            temperature=temperature, rain_probability=0.0, rain_forecast_mm=0.0, actual_rain_mm=rain
        )
        for _ in range(days)
    ]


def test_gymnasium_with_stub_dependencies(isolated):
    """API/determinism check, NOT validation of the production reward."""
    check_env(AgriWaterEnv(), skip_render_check=True)


def test_balance_and_reward_arguments(isolated, monkeypatch):
    from agriwater.environment import agriwater_env

    captured = []

    def reward(state, action, next_state):
        captured.append((state.copy(), action, next_state.copy()))
        return 123.0, {"test_only": 123.0}

    monkeypatch.setattr(agriwater_env, "calculate_reward", reward)
    env = AgriWaterEnv()
    old, _ = env.reset(seed=1, options={"soil_moisture": 0.5, "weather": fixed_weather(rain=10.0)})
    nxt, value, _, _, info = env.step(2)
    # 50 L + 10*.8 irrigation + 10*.5 rain - 2 ET = 61 L.
    assert nxt[2] == pytest.approx(0.61)
    assert value == 123.0
    assert info["water_used_liters"] == 10.0
    np.testing.assert_array_equal(captured[0][0], old)
    np.testing.assert_array_equal(captured[0][2], nxt)
    b = info["water_balance"]
    assert b["after_liters"] == pytest.approx(
        b["before_liters"]
        + b["irrigation_liters"]
        + b["rain_liters"]
        - b["evapotranspiration_liters"]
        - b["drainage_liters"],
        abs=1e-5,
    )
    nxt[:] = 0
    assert env._state[2] > 0


def test_weather_replay_and_seed(isolated):
    from agriwater.environment.weather import generate_weather

    w = generate_weather("dry", 31, seed=42)
    assert w == generate_weather("dry", 31, seed=42)
    assert w != generate_weather("dry", 31, seed=43)
    a, b = AgriWaterEnv(), AgriWaterEnv()
    x, _ = a.reset(seed=4, options={"weather": w})
    y, _ = b.reset(seed=4, options={"weather": w})
    np.testing.assert_array_equal(x, y)
    w[0]["temperature"] = 45
    assert a._weather[0]["temperature"] != 45
    x, _, _, _, ix = a.step(0)
    y, _, _, _, iy = b.step(5)
    np.testing.assert_array_equal(x[3:6], y[3:6])
    assert ix["actual_rain_mm"] == iy["actual_rain_mm"]


def test_termination_truncation_and_render(isolated):
    import gymnasium as gym

    env = AgriWaterEnv(max_days=1, render_mode="ansi")
    with pytest.raises(gym.error.ResetNeeded):
        env.step(0)
    env.reset(options={"soil_moisture": 0.5, "weather": fixed_weather(2)})
    _, _, terminated, truncated, _ = env.step(0)
    assert not terminated and truncated
    assert "Day 1/1" in env.render()
    with pytest.raises(gym.error.ResetNeeded):
        env.step(0)
    env = AgriWaterEnv()
    env.reset(options={"soil_moisture": 0.01, "weather": fixed_weather()})
    _, _, terminated, truncated, info = env.step(0)
    assert terminated and not truncated
    assert info["soil_moisture"] == 0


def test_stage_and_evaporation_factors(isolated):
    def moisture(crop, stage, temperature):
        env = AgriWaterEnv()
        env.reset(
            options={
                "crop_type": crop,
                "growth_stage": stage,
                "soil_moisture": 0.5,
                "weather": fixed_weather(temperature=temperature),
            }
        )
        return env.step(0)[0][2]

    assert moisture(0, 0, 15) > moisture(1, 0, 15)
    assert moisture(0, 0, 15) > moisture(0, 2, 15)
    assert moisture(0, 0, 15) > moisture(0, 0, 30)
    env = AgriWaterEnv()
    env.reset(options={"soil_moisture": 0.6, "weather": fixed_weather()})
    for _ in range(8):
        state, _, _, _, _ = env.step(0)
    assert round(float(state[1]) * 3) == 1


def test_repeat_irrigation_drainage_and_overflow(isolated):
    env = AgriWaterEnv()
    env.reset(options={"soil_moisture": 0.5, "weather": fixed_weather()})
    first = env.step(5)[4]["water_balance"]
    second = env.step(5)[4]["water_balance"]
    assert first["irrigation_liters"] == 20
    assert second["irrigation_liters"] == 10
    env.reset(options={"soil_moisture": 0.9, "weather": fixed_weather(rain=50)})
    state, _, terminated, _, info = env.step(5)
    assert state[2] == 1 and terminated
    assert info["water_balance"]["drainage_liters"] > 5


@pytest.mark.parametrize("action", [-1, 6, True, 1.0, np.array(1)])
def test_bad_action(isolated, action):
    env = AgriWaterEnv()
    env.reset(seed=1)
    with pytest.raises(ValueError):
        env.step(action)
    assert env.day == 0


@pytest.mark.parametrize(
    "options",
    [
        {"typo": 1},
        {"soil_moisture": float("nan")},
        {"crop_type": True},
        {"growth_stage": 4},
        {"weather": []},
    ],
)
def test_bad_reset(isolated, options):
    with pytest.raises(ValueError):
        AgriWaterEnv().reset(options=options)


def test_null_config_rejected(isolated):
    isolated[0]["water_balance"]["soil_capacity_liters"] = None
    with pytest.raises(ValueError, match="soil_capacity_liters"):
        AgriWaterEnv().reset()


def test_reward_failure_is_atomic(isolated, monkeypatch):
    from agriwater.environment import agriwater_env

    def missing(*args):
        raise NotImplementedError("Reward pending")

    monkeypatch.setattr(agriwater_env, "calculate_reward", missing)
    env = AgriWaterEnv()
    state, _ = env.reset(seed=1)
    with pytest.raises(NotImplementedError):
        env.step(1)
    assert env.day == 0
    np.testing.assert_array_equal(state, env._state)


def test_weather_bounds_and_probability(isolated):
    from agriwater.environment.weather import generate_weather

    scenario = isolated[1]["dry"]
    scenario["rain_probability_range"] = [0, 0]
    assert all(w["actual_rain_mm"] == 0 for w in generate_weather("dry", 10, seed=1))
    scenario["rain_probability_range"] = [1, 1]
    assert all(
        w["actual_rain_mm"] == w["rain_forecast_mm"] for w in generate_weather("dry", 10, seed=1)
    )
    scenario["temperature_range_c"] = None
    with pytest.raises(ValueError):
        generate_weather("dry", 10, seed=1)
