"""Reward contract: six components, boundaries, validation and configuration."""

import copy

import numpy as np
import pytest

import agriwater.agents.reward as reward_module
from agriwater.agents.reward import calculate_reward
from agriwater.config import load_config

COMPONENT_KEYS = {
    "R_health",
    "R_stress",
    "R_water",
    "R_waste",
    "R_rain",
    "R_delay",
}


def observation(
    *,
    crop: int = 0,
    stage: int = 0,
    moisture: float = 0.50,
    temperature: float = 0.50,
    rain_probability: float = 0.0,
    forecast_mm: float = 0.0,
    previous_liters: float = 0.0,
) -> np.ndarray:
    """Build a normalized float32 observation from physical values."""
    return np.array(
        [
            crop / 3.0,
            stage / 3.0,
            moisture,
            temperature,
            rain_probability,
            forecast_mm / 50.0,
            previous_liters / 25.0,
        ],
        dtype=np.float32,
    )


@pytest.fixture(autouse=True)
def _clear_reward_cache() -> None:
    reward_module._reward_settings.cache_clear()
    yield
    reward_module._reward_settings.cache_clear()


def test_ideal_without_irrigation() -> None:
    state = observation(moisture=0.50)
    total, parts = calculate_reward(state, 0, state.copy())
    assert total == 10.0
    assert parts == {
        "R_health": 10.0,
        "R_stress": 0.0,
        "R_water": 0.0,
        "R_waste": 0.0,
        "R_rain": 0.0,
        "R_delay": 0.0,
    }


def test_documented_full_example() -> None:
    state = observation(
        moisture=0.60,
        rain_probability=0.70,
        forecast_mm=15.0,
        previous_liters=12.5,
    )
    next_state = observation(moisture=0.90)
    total, parts = calculate_reward(state, 2, next_state)
    assert parts == {
        "R_health": 0.0,
        "R_stress": -100.0,
        "R_water": -4.0,
        "R_waste": -20.0,
        "R_rain": -10.0,
        "R_delay": -16.0,
    }
    assert total == -150.0


@pytest.mark.parametrize(
    ("stage", "moisture", "expected"),
    [
        (0, 0.39, 0.0),
        (0, 0.40, 10.0),
        (0, 0.70, 10.0),
        (0, 0.71, 0.0),
        (1, 0.40, 10.0),
        (1, 0.70, 10.0),
        (2, 0.49, 0.0),
        (2, 0.50, 10.0),
        (2, 0.75, 10.0),
        (2, 0.76, 0.0),
        (3, 0.40, 10.0),
        (3, 0.70, 10.0),
    ],
)
def test_health_uses_next_stage_and_inclusive_bounds(
    stage: int, moisture: float, expected: float
) -> None:
    next_state = observation(stage=stage, moisture=moisture)
    _, parts = calculate_reward(observation(), 0, next_state)
    assert parts["R_health"] == expected


def test_health_follows_stage_transition() -> None:
    state = observation(stage=1)
    for moisture, stage_1, stage_2 in (
        (0.45, 10.0, 0.0),
        (0.72, 0.0, 10.0),
    ):
        _, before = calculate_reward(state, 0, observation(stage=1, moisture=moisture))
        _, after = calculate_reward(state, 0, observation(stage=2, moisture=moisture))
        assert before["R_health"] == stage_1
        assert after["R_health"] == stage_2


@pytest.mark.parametrize(
    ("moisture", "expected"),
    [
        (0.0, -100.0),
        (0.199, -100.0),
        (0.20, 0.0),
        (0.50, 0.0),
        (0.85, 0.0),
        (0.851, -100.0),
        (1.0, -100.0),
    ],
)
def test_stress_uses_next_moisture_and_exclusive_bounds(moisture: float, expected: float) -> None:
    next_state = observation(moisture=moisture)
    _, parts = calculate_reward(observation(), 0, next_state)
    assert parts["R_stress"] == expected


def test_stress_triggers_immediately_outside_bounds() -> None:
    low = np.nextafter(np.float32(0.20), np.float32(0.0))
    high = np.nextafter(np.float32(0.85), np.float32(1.0))
    for moisture in (low, high):
        next_state = observation()
        next_state[2] = moisture
        _, parts = calculate_reward(observation(), 0, next_state)
        assert parts["R_stress"] == -100.0


@pytest.mark.parametrize("action", list(range(6)))
def test_water_penalty_scales_with_action(action: int) -> None:
    state = observation(moisture=0.30)
    _, parts = calculate_reward(state, action, state.copy())
    assert parts["R_water"] == -2.0 * action


@pytest.mark.parametrize(
    ("moisture", "action", "expected"),
    [
        (0.59, 2, 0.0),
        (0.60, 2, -20.0),
        (0.60, 0, 0.0),
        (0.80, 5, -50.0),
    ],
)
def test_waste_penalty_needs_wet_state_and_irrigation(
    moisture: float, action: int, expected: float
) -> None:
    state = observation(moisture=moisture)
    _, parts = calculate_reward(state, action, state.copy())
    assert parts["R_waste"] == expected


@pytest.mark.parametrize(
    ("rain_probability", "forecast_mm", "action", "expected"),
    [
        (0.69, 15.0, 1, 0.0),
        (0.70, 14.0, 1, 0.0),
        (0.70, 15.0, 0, 0.0),
        (0.70, 15.0, 1, -5.0),
        (0.70, 15.0, 3, -15.0),
        (1.0, 50.0, 5, -25.0),
    ],
)
def test_rain_penalty_needs_probability_and_amount(
    rain_probability: float, forecast_mm: float, action: int, expected: float
) -> None:
    state = observation(
        moisture=0.30,
        rain_probability=rain_probability,
        forecast_mm=forecast_mm,
    )
    _, parts = calculate_reward(state, action, state.copy())
    assert parts["R_rain"] == expected


@pytest.mark.parametrize(
    ("previous_liters", "action", "expected"),
    [
        (12.4, 3, 0.0),
        (12.5, 0, 0.0),
        (12.5, 3, -24.0),
        (25.0, 5, -40.0),
    ],
)
def test_delay_penalty_uses_previous_irrigation(
    previous_liters: float, action: int, expected: float
) -> None:
    state = observation(moisture=0.30, previous_liters=previous_liters)
    _, parts = calculate_reward(state, action, state.copy())
    assert parts["R_delay"] == expected


@pytest.mark.parametrize("action", list(range(6)))
def test_always_returns_all_six_keys_as_floats(action: int) -> None:
    state = observation()
    total, parts = calculate_reward(state, action, state.copy())
    assert set(parts) == COMPONENT_KEYS
    assert all(isinstance(value, float) for value in parts.values())
    assert isinstance(total, float)
    assert total == sum(parts.values())


def test_total_equals_component_sum_across_inputs() -> None:
    for action in range(6):
        for moisture in (0.10, 0.30, 0.50, 0.70, 0.90):
            state = observation(
                stage=2,
                moisture=moisture,
                rain_probability=0.8,
                forecast_mm=20.0,
                previous_liters=13.0,
            )
            next_state = observation(stage=3, moisture=moisture)
            total, parts = calculate_reward(state, action, next_state)
            assert total == sum(parts.values())


def test_inputs_are_not_mutated() -> None:
    state = observation(
        moisture=0.65,
        rain_probability=0.75,
        forecast_mm=18.0,
        previous_liters=13.0,
    )
    next_state = observation(stage=2, moisture=0.90)
    state_before = state.copy()
    next_before = next_state.copy()
    calculate_reward(state, 4, next_state)
    assert np.array_equal(state, state_before)
    assert np.array_equal(next_state, next_before)


def test_float32_probability_threshold_needs_no_epsilon() -> None:
    probability = np.float32(0.70)
    assert float(probability) < 0.70
    state = observation(
        moisture=0.30,
        rain_probability=0.70,
        forecast_mm=15.0,
    )
    _, parts = calculate_reward(state, 1, state.copy())
    assert parts["R_rain"] == -5.0


@pytest.mark.parametrize("target", ["state", "next_state"])
def test_rejects_non_array_observation(target: str) -> None:
    valid = observation()
    bad: object = [0.0] * 7
    args = {"state": valid.copy(), "next_state": valid.copy()}
    args[target] = bad
    with pytest.raises(TypeError, match="numpy.ndarray"):
        calculate_reward(args["state"], 0, args["next_state"])


@pytest.mark.parametrize("target", ["state", "next_state"])
def test_rejects_non_float32_observation(target: str) -> None:
    valid = observation()
    bad = valid.astype(np.float64)
    args = {"state": valid.copy(), "next_state": valid.copy()}
    args[target] = bad
    with pytest.raises(TypeError, match="float32"):
        calculate_reward(args["state"], 0, args["next_state"])


@pytest.mark.parametrize("shape", [(6,), (8,), (1, 7), (7, 1), ()])
def test_rejects_wrong_observation_shape(shape: tuple[int, ...]) -> None:
    valid = observation()
    bad = np.zeros(shape, dtype=np.float32)
    with pytest.raises(ValueError, match="shape"):
        calculate_reward(bad, 0, valid)


@pytest.mark.parametrize("value", [np.nan, np.inf, -np.inf])
def test_rejects_non_finite_observation(value: float) -> None:
    valid = observation()
    bad = valid.copy()
    bad[2] = value
    with pytest.raises(ValueError, match="finite"):
        calculate_reward(valid, 0, bad)


@pytest.mark.parametrize("value", [-0.1, 1.1])
def test_rejects_out_of_range_observation(value: float) -> None:
    valid = observation()
    bad = valid.copy()
    bad[4] = value
    with pytest.raises(ValueError, match=r"\[0, 1\]"):
        calculate_reward(valid, 0, bad)


@pytest.mark.parametrize("action", [True, False, np.bool_(True), 1.0, "1", None])
def test_rejects_non_integer_action(action: object) -> None:
    state = observation()
    with pytest.raises(TypeError, match="integer"):
        calculate_reward(state, action, state.copy())  # type: ignore[arg-type]


@pytest.mark.parametrize("action", [-1, 6, 100])
def test_rejects_out_of_range_action(action: int) -> None:
    state = observation()
    with pytest.raises(ValueError, match="0 to 5"):
        calculate_reward(state, action, state.copy())


def test_accepts_numpy_integer_action() -> None:
    state = observation()
    _, parts = calculate_reward(state, np.int64(2), state.copy())
    assert parts["R_water"] == -4.0


def test_coefficients_come_from_environment_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = copy.deepcopy(load_config("environment"))
    config["reward"]["health"] = 7
    config["reward"]["water_per_action"] = -1
    monkeypatch.setattr(reward_module, "load_config", lambda name: config)

    state = observation(moisture=0.50)
    total, parts = calculate_reward(state, 2, state.copy())
    assert parts["R_health"] == 7.0
    assert parts["R_water"] == -2.0
    assert total == 5.0


def test_rejects_missing_reward_section(monkeypatch: pytest.MonkeyPatch) -> None:
    config = copy.deepcopy(load_config("environment"))
    del config["reward"]
    monkeypatch.setattr(reward_module, "load_config", lambda name: config)

    state = observation()
    with pytest.raises(ValueError, match="reward mapping"):
        calculate_reward(state, 0, state.copy())


def test_rejects_null_reward_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    config = copy.deepcopy(load_config("environment"))
    config["reward"]["waste_moisture"] = None
    monkeypatch.setattr(reward_module, "load_config", lambda name: config)

    state = observation()
    with pytest.raises(ValueError, match="waste_moisture"):
        calculate_reward(state, 0, state.copy())


def test_rejects_null_moisture_bounds(monkeypatch: pytest.MonkeyPatch) -> None:
    config = copy.deepcopy(load_config("environment"))
    config["moisture"]["ideal_default"] = None
    monkeypatch.setattr(reward_module, "load_config", lambda name: config)

    state = observation()
    with pytest.raises(ValueError, match="ideal_default"):
        calculate_reward(state, 0, state.copy())
