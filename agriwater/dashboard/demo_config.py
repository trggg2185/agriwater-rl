"""In-memory v0.1 demo overlay for the dashboard.

The committed YAML deliberately keeps physical and weather values as ``null``
until both project members agree on them. The dashboard may still be used to
illustrate the mechanics, so this module merges the proposed v0.1 values into a
copy of the loaded configuration. Nothing here is written back to ``configs``.
"""

from copy import deepcopy
from typing import Any

from agriwater.config import load_config

DEMO_NOTE = (
    "Tham số minh họa v0.1 (đề xuất, chưa hiệu chuẩn). "
    "Không sửa configs/*.yaml và không dùng cho báo cáo thực địa."
)

DEMO_PHYSICS: dict[str, Any] = {
    "water_balance": {
        "plot_area_m2": 1.0,
        "soil_capacity_liters": 50.0,
        "irrigation_efficiency": 0.8,
        "rain_efficiency": 1.0,
        "evapotranspiration_liters_per_day": 0.0,
        "drainage_liters_per_day": 5.0,
        "et_temperature_slope": 0.25,
        "crop_factors": [1.0, 1.0, 1.0, 1.0],
        "stage_factors": [0.60, 0.90, 1.15, 0.80],
        "drainage_threshold": 0.85,
        "repeat_irrigation_threshold_liters": 12.5,
        "repeat_irrigation_efficiency": 0.8,
    },
    "growth_stage_days": [8, 16, 24],
    "biological_termination": [0.10, 0.95],
    "initial_state": {
        "crop_type": 0,
        "growth_stage": 0,
        "soil_moisture_range": [0.35, 0.55],
    },
}

DEMO_SCENARIOS: dict[str, dict[str, list[float]]] = {
    "dry": {
        "temperature_range_c": [35.0, 42.0],
        "rain_probability_range": [0.0, 0.05],
        "rain_amount_range_mm": [0.0, 5.0],
    },
    "stormy": {
        "temperature_range_c": [22.0, 30.0],
        "rain_probability_range": [0.3, 0.9],
        "rain_amount_range_mm": [5.0, 40.0],
    },
    "random": {
        "temperature_range_c": [18.0, 38.0],
        "rain_probability_range": [0.0, 1.0],
        "rain_amount_range_mm": [0.0, 40.0],
    },
}


def build_demo_config() -> dict[str, Any]:
    """Return a fresh environment config with the v0.1 demo values applied."""
    config = deepcopy(load_config("environment"))
    balance = config.get("water_balance")
    if not isinstance(balance, dict):
        balance = {}
        config["water_balance"] = balance
    balance.update(deepcopy(DEMO_PHYSICS["water_balance"]))
    config["growth_stage_days"] = list(DEMO_PHYSICS["growth_stage_days"])
    config["biological_termination"] = list(DEMO_PHYSICS["biological_termination"])
    initial = config.get("initial_state")
    if not isinstance(initial, dict):
        initial = {}
        config["initial_state"] = initial
    initial.update(deepcopy(DEMO_PHYSICS["initial_state"]))
    return config


def demo_scenario_ranges(scenario: str) -> dict[str, list[float]]:
    """Return the v0.1 weather ranges for one scenario (read-only)."""
    try:
        ranges = DEMO_SCENARIOS[scenario]
    except KeyError as exc:
        raise ValueError("scenario must be dry, stormy or random") from exc
    return deepcopy(ranges)
