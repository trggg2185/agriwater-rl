"""Single reward entry point; see docs/DESIGN_CONTRACT.md for all six terms."""

import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np

from agriwater.config import load_config

_OBSERVATION_SIZE = 7
_CODE_COUNT = 3
_FORECAST_SCALE_MM = np.float32(50.0)
_IRRIGATION_SCALE_LITERS = np.float32(25.0)
_ACTIONS = range(6)


@dataclass(frozen=True)
class _RewardSettings:
    """Validated coefficients from the ``reward`` and ``moisture`` sections."""

    health: float
    stress: float
    water_per_action: float
    waste_per_action: float
    rain_per_action: float
    delay_per_action: float
    waste_moisture: np.float32
    rain_probability: np.float32
    rain_forecast_mm: np.float32
    previous_irrigation_liters: np.float32
    ideal_default: tuple[np.float32, np.float32]
    ideal_stage_2: tuple[np.float32, np.float32]
    stress_low: np.float32
    stress_high: np.float32


def _finite(value: Any, label: str) -> float:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a number, got {value!r}")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{label} must be finite")
    return number


def _number(section: dict[str, Any], key: str, source: str) -> float:
    return _finite(section.get(key), f"{source}.{key}")


def _bounds(section: dict[str, Any], key: str, source: str) -> tuple[np.float32, np.float32]:
    value = section.get(key)
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f"{source}.{key} must be a list of two numbers")
    low = _finite(value[0], f"{source}.{key}[0]")
    high = _finite(value[1], f"{source}.{key}[1]")
    if not 0.0 <= low <= high <= 1.0:
        raise ValueError(f"{source}.{key} must satisfy 0 <= low <= high <= 1")
    return np.float32(low), np.float32(high)


def _unit_interval(value: np.float32, label: str) -> np.float32:
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{label} must lie in [0, 1], got {float(value)}")
    return value


@lru_cache(maxsize=1)
def _reward_settings() -> _RewardSettings:
    """Load and validate reward coefficients once per process.

    Tests that change configuration must call ``_reward_settings.cache_clear()``.
    """
    config = load_config("environment")
    reward = config.get("reward")
    moisture = config.get("moisture")
    if not isinstance(reward, dict):
        raise ValueError("environment config must define a reward mapping")
    if not isinstance(moisture, dict):
        raise ValueError("environment config must define a moisture mapping")

    waste_moisture = _unit_interval(
        np.float32(_number(reward, "waste_moisture", "reward")), "reward.waste_moisture"
    )
    rain_probability = _unit_interval(
        np.float32(_number(reward, "rain_probability", "reward")), "reward.rain_probability"
    )
    rain_forecast_mm = np.float32(_number(reward, "rain_forecast_mm", "reward"))
    previous_irrigation_liters = np.float32(_number(reward, "previous_irrigation_liters", "reward"))
    if rain_forecast_mm < 0:
        raise ValueError("reward.rain_forecast_mm must be non-negative")
    if previous_irrigation_liters < 0:
        raise ValueError("reward.previous_irrigation_liters must be non-negative")

    ideal_default = _bounds(moisture, "ideal_default", "moisture")
    ideal_stage_2 = _bounds(moisture, "ideal_stage_2", "moisture")
    stress_low, stress_high = _bounds(moisture, "stress_bounds", "moisture")

    return _RewardSettings(
        health=_number(reward, "health", "reward"),
        stress=_number(reward, "stress", "reward"),
        water_per_action=_number(reward, "water_per_action", "reward"),
        waste_per_action=_number(reward, "waste_per_action", "reward"),
        rain_per_action=_number(reward, "rain_per_action", "reward"),
        delay_per_action=_number(reward, "delay_per_action", "reward"),
        waste_moisture=waste_moisture,
        rain_probability=rain_probability,
        rain_forecast_mm=rain_forecast_mm,
        previous_irrigation_liters=previous_irrigation_liters,
        ideal_default=ideal_default,
        ideal_stage_2=ideal_stage_2,
        stress_low=stress_low,
        stress_high=stress_high,
    )


def _observation(value: Any, label: str) -> np.ndarray:
    if not isinstance(value, np.ndarray):
        raise TypeError(f"{label} must be a numpy.ndarray, got {type(value).__name__}")
    if value.dtype != np.float32:
        raise TypeError(f"{label} must have dtype float32, got {value.dtype}")
    if value.shape != (_OBSERVATION_SIZE,):
        raise ValueError(f"{label} must have shape ({_OBSERVATION_SIZE},), got {value.shape}")
    if not np.all(np.isfinite(value)):
        raise ValueError(f"{label} must contain only finite values")
    if np.any(value < 0.0) or np.any(value > 1.0):
        raise ValueError(f"{label} values must lie in [0, 1]")
    return value


def _action(value: Any) -> int:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, (int, np.integer)):
        raise TypeError("action must be an integer from 0 to 5")
    index = int(value)
    if index not in _ACTIONS:
        raise ValueError("action must be an integer from 0 to 5")
    return index


def _decoded_code(value: np.float32, label: str) -> int:
    code = int(round(float(value) * _CODE_COUNT))
    if not 0 <= code <= _CODE_COUNT:
        raise ValueError(f"{label} does not decode to a code in 0..{_CODE_COUNT}")
    return code


def _rain_forecast_mm(observation: np.ndarray) -> np.float32:
    return np.float32(observation[5]) * _FORECAST_SCALE_MM


def _previous_irrigation_liters(observation: np.ndarray) -> np.float32:
    return np.float32(observation[6]) * _IRRIGATION_SCALE_LITERS


def calculate_reward(
    state: np.ndarray, action: int, next_state: np.ndarray
) -> tuple[float, dict[str, float]]:
    """Return total and R_health/R_stress/R_water/R_waste/R_rain/R_delay.

    Health and stress use ``next_state``; waste, rain and delay use ``state``.
    All thresholds are compared in float32 so boundaries match the observation
    representation exactly.
    """
    settings = _reward_settings()
    current = _observation(state, "state")
    following = _observation(next_state, "next_state")
    action_index = _action(action)
    for observation, label in ((current, "state"), (following, "next_state")):
        _decoded_code(observation[0], f"{label}[0] crop_type")
        _decoded_code(observation[1], f"{label}[1] growth_stage")

    next_stage = _decoded_code(following[1], "next_state[1] growth_stage")
    ideal_low, ideal_high = settings.ideal_stage_2 if next_stage == 2 else settings.ideal_default
    moisture = following[2]
    health = settings.health if ideal_low <= moisture <= ideal_high else 0.0
    stress = (
        settings.stress
        if moisture < settings.stress_low or moisture > settings.stress_high
        else 0.0
    )

    water = settings.water_per_action * action_index
    waste = 0.0
    rain = 0.0
    delay = 0.0
    if action_index > 0:
        if current[2] >= settings.waste_moisture:
            waste = settings.waste_per_action * action_index
        if (
            current[4] >= settings.rain_probability
            and _rain_forecast_mm(current) >= settings.rain_forecast_mm
        ):
            rain = settings.rain_per_action * action_index
        if _previous_irrigation_liters(current) >= settings.previous_irrigation_liters:
            delay = settings.delay_per_action * action_index

    parts = {
        "R_health": float(health),
        "R_stress": float(stress),
        "R_water": float(water),
        "R_waste": float(waste),
        "R_rain": float(rain),
        "R_delay": float(delay),
    }
    return float(sum(parts.values())), parts
