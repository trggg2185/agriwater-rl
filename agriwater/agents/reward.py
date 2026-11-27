"""Single reward entry point; see docs/DESIGN_CONTRACT.md for all six terms."""

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from agriwater.config import load_config
from agriwater.environment.observation import (
    CODE_COUNT,
    CROP_TYPE,
    GROWTH_STAGE,
    IRRIGATION_MAX_LITERS,
    LAST_IRRIGATION,
    OBSERVATION_SIZE,
    RAIN_FORECAST_MAX_MM,
    RAIN_FORECAST_MM,
    RAIN_PROBABILITY,
    SOIL_MOISTURE,
)

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


def _reward_settings(config: dict[str, Any] | None = None) -> _RewardSettings:
    """Validate an episode snapshot or load the current standalone configuration."""
    if config is None:
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
    if not 0 <= rain_forecast_mm <= 50:
        raise ValueError("reward.rain_forecast_mm must lie in [0, 50]")
    if not 0 <= previous_irrigation_liters <= 25:
        raise ValueError("reward.previous_irrigation_liters must lie in [0, 25]")

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
    if value.shape != (OBSERVATION_SIZE,):
        raise ValueError(f"{label} must have shape ({OBSERVATION_SIZE},), got {value.shape}")
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
    code = int(round(float(value) * CODE_COUNT))
    if not 0 <= code <= CODE_COUNT or value != np.float32(code / CODE_COUNT):
        raise ValueError(f"{label} does not decode to a code in 0..{CODE_COUNT}")
    return code


def _rain_forecast_mm(observation: np.ndarray) -> np.float32:
    """Chiều 5 (0–1) → mm, giữ đúng số học float32 như khi so ngưỡng."""
    return np.float32(observation[RAIN_FORECAST_MM]) * np.float32(RAIN_FORECAST_MAX_MM)


def _previous_irrigation_liters(observation: np.ndarray) -> np.float32:
    """Chiều 6 (0–1) → lít, cùng lý do float32 như trên."""
    return np.float32(observation[LAST_IRRIGATION]) * np.float32(IRRIGATION_MAX_LITERS)


def calculate_reward(
    state: np.ndarray,
    action: int,
    next_state: np.ndarray,
    *,
    config: dict[str, Any] | None = None,
) -> tuple[float, dict[str, float]]:
    """c) Reward đa mục tiêu: R = R_health + R_stress + R_water + R_waste + R_rain + R_delay.

    R_health và R_stress đánh giá độ ẩm cuối ngày trong ``next_state``.
    R_water tính chi phí theo mức tưới. R_waste, R_rain và R_delay phạt
    tưới khi đất đã ẩm, khi dự báo mưa lớn hoặc khi ngày trước đã tưới nhiều.
    Ba khoản phạt này dùng ``state`` để phản ánh dữ liệu có lúc ra quyết định.
    Hệ số đọc từ YAML và các ngưỡng được so sánh bằng float32.
    """
    settings = _reward_settings(config)
    current = _observation(state, "state")
    following = _observation(next_state, "next_state")
    action_index = _action(action)
    for observation, label in ((current, "state"), (following, "next_state")):
        _decoded_code(observation[CROP_TYPE], f"{label}.crop_type")
        _decoded_code(observation[GROWTH_STAGE], f"{label}.growth_stage")

    # c/R_health: Thưởng nếu độ ẩm cuối ngày đạt vùng lý tưởng của giai đoạn mới.
    next_stage = _decoded_code(following[GROWTH_STAGE], "next_state.growth_stage")
    ideal_low, ideal_high = settings.ideal_stage_2 if next_stage == 2 else settings.ideal_default
    moisture = following[SOIL_MOISTURE]
    health = settings.health if ideal_low <= moisture <= ideal_high else 0.0
    # c/R_stress: Phạt độ ẩm cuối ngày thấp hoặc cao hơn ngưỡng stress.
    stress = (
        settings.stress
        if moisture < settings.stress_low or moisture > settings.stress_high
        else 0.0
    )

    # c/R_water: Phạt chi phí tài nguyên tỉ lệ với chỉ số mức tưới.
    water = settings.water_per_action * action_index
    waste = 0.0
    rain = 0.0
    delay = 0.0
    if action_index > 0:
        # c/R_waste: Phạt tưới khi đất trước hành động đã đủ ẩm.
        if current[SOIL_MOISTURE] >= settings.waste_moisture:
            waste = settings.waste_per_action * action_index
        # c/R_rain: Phạt tưới khi xác suất và lượng mưa dự báo đều vượt ngưỡng.
        if (
            current[RAIN_PROBABILITY] >= settings.rain_probability
            and _rain_forecast_mm(current) >= settings.rain_forecast_mm
        ):
            rain = settings.rain_per_action * action_index
        # c/R_delay: Phạt tưới tiếp sau khi lượng tưới ngày trước đạt ngưỡng.
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
    # c) Cộng sáu thành phần thành một điểm học; trả từng khoản để đối chiếu.
    return float(sum(parts.values())), parts
