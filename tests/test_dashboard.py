"""Dashboard overlay, metric and chart-data tests (no browser required)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from agriwater.config import load_config
from agriwater.dashboard.demo_config import (
    build_demo_config,
    demo_scenario_ranges,
)
from agriwater.dashboard.plots import (
    REWARD_KEYS,
    component_totals,
    compute_metrics,
    cumulative_reward,
    daily_ideal_bounds,
    records_to_frame,
)
from agriwater.environment.demo import RECORD_COLUMNS, run_episode
from agriwater.environment.weather import generate_weather


def _episode(scenario: str = "dry", seed: int = 42, action: int | None = 2):
    config = build_demo_config()
    weather = generate_weather(
        scenario,
        int(config["max_days"]) + 1,
        seed=seed + 1,
        ranges=demo_scenario_ranges(scenario),
    )
    return run_episode(scenario, seed, action, config=config, weather=weather), config


def test_demo_config_fills_physical_values_without_touching_yaml() -> None:
    config = build_demo_config()
    balance = config["water_balance"]
    assert balance["plot_area_m2"] == 1.0
    assert balance["soil_capacity_liters"] == 50.0
    assert config["growth_stage_days"] == [8, 16, 24]
    assert config["biological_termination"] == [0.10, 0.95]
    assert config["initial_state"]["soil_moisture_range"] == [0.35, 0.55]
    assert config["reward"]["health"] == 10

    on_disk = load_config("environment")
    assert on_disk["water_balance"]["plot_area_m2"] is None
    assert on_disk["growth_stage_days"] is None


def test_demo_config_returns_independent_copies() -> None:
    first = build_demo_config()
    first["water_balance"]["plot_area_m2"] = 999.0
    first["initial_state"]["soil_moisture_range"][0] = 0.0
    second = build_demo_config()
    assert second["water_balance"]["plot_area_m2"] == 1.0
    assert second["initial_state"]["soil_moisture_range"] == [0.35, 0.55]


def test_demo_scenario_ranges_reject_unknown_and_copy() -> None:
    ranges = demo_scenario_ranges("dry")
    ranges["temperature_range_c"][0] = 0.0
    assert demo_scenario_ranges("dry")["temperature_range_c"] == [35.0, 42.0]
    with pytest.raises(ValueError, match="scenario"):
        demo_scenario_ranges("unknown")


@pytest.mark.parametrize("scenario", ["dry", "stormy", "random"])
def test_demo_weather_is_seeded_and_inside_ranges(scenario: str) -> None:
    ranges = demo_scenario_ranges(scenario)
    first = generate_weather(scenario, 31, seed=43, ranges=ranges)
    second = generate_weather(scenario, 31, seed=43, ranges=ranges)
    assert first == second
    for day in first:
        assert ranges["temperature_range_c"][0] <= day["temperature"]
        assert day["temperature"] <= ranges["temperature_range_c"][1]
        assert ranges["rain_probability_range"][0] <= day["rain_probability"]
        assert day["rain_probability"] <= ranges["rain_probability_range"][1]
        assert ranges["rain_amount_range_mm"][0] <= day["rain_forecast_mm"]
        assert day["rain_forecast_mm"] <= ranges["rain_amount_range_mm"][1]
        assert day["actual_rain_mm"] in (0.0, day["rain_forecast_mm"])


def test_overlay_episode_is_deterministic_and_has_full_schema() -> None:
    records, _ = _episode()
    again, _ = _episode()
    assert records == again
    assert records
    assert list(records[0]) == RECORD_COLUMNS
    for record in records:
        components = sum(record[key] for key in REWARD_KEYS)
        assert components == pytest.approx(record["reward"], abs=1e-6)


def test_records_to_frame_preserves_order_and_types() -> None:
    records, _ = _episode()
    frame = records_to_frame(records)
    assert list(frame.columns) == RECORD_COLUMNS
    assert frame["day"].dtype.kind == "i"
    assert frame["action"].dtype.kind == "i"
    assert frame["soil_moisture"].dtype.kind == "f"
    assert frame["terminated"].dtype == bool


def test_records_to_frame_handles_empty_input() -> None:
    frame = records_to_frame([])
    assert frame.empty
    assert list(frame.columns) == RECORD_COLUMNS


def test_metrics_match_records() -> None:
    records, _ = _episode()
    frame = records_to_frame(records)
    metrics = compute_metrics(frame)
    assert metrics["days"] == len(records)
    assert metrics["total_water_liters"] == pytest.approx(
        sum(record["water_used_liters"] for record in records)
    )
    assert metrics["total_reward"] == pytest.approx(sum(record["reward"] for record in records))
    assert metrics["ideal_days"] == sum(bool(record["is_ideal"]) for record in records)
    assert metrics["ideal_ratio"] == pytest.approx(metrics["ideal_days"] / metrics["days"])
    assert metrics["stress_days"] == sum(bool(record["is_stressed"]) for record in records)
    assert metrics["overwater_days"] == sum(record["R_waste"] < 0 for record in records)
    assert metrics["rain_waste_days"] == sum(record["R_rain"] < 0 for record in records)
    assert metrics["delay_days"] == sum(record["R_delay"] < 0 for record in records)
    assert metrics["termination_reason"] in {"sinh học", "hết số ngày", "chưa kết thúc"}


def test_metrics_empty_frame() -> None:
    metrics = compute_metrics(records_to_frame([]))
    assert metrics["days"] == 0
    assert metrics["ideal_ratio"] == 0.0
    assert metrics["termination_reason"] == "chưa chạy"


def test_component_totals_and_cumulative_reward() -> None:
    records, _ = _episode()
    frame = records_to_frame(records)
    totals = component_totals(frame)
    assert list(totals) == REWARD_KEYS
    assert sum(totals.values()) == pytest.approx(frame["reward"].sum())
    cumulative = cumulative_reward(frame)
    assert list(cumulative.index) == list(frame["day"])
    assert cumulative.iloc[-1] == pytest.approx(frame["reward"].sum())


def test_ideal_bounds_follow_stage_milestones() -> None:
    frame = pd.DataFrame({"day": [1, 8, 9, 16, 17, 24, 25]})
    config = build_demo_config()
    low, high = daily_ideal_bounds(frame, config)
    assert low == [0.40, 0.40, 0.40, 0.50, 0.50, 0.40, 0.40]
    assert high == [0.70, 0.70, 0.70, 0.75, 0.75, 0.70, 0.70]


def test_ideal_bounds_reject_missing_config() -> None:
    frame = pd.DataFrame({"day": [1]})
    config: dict[str, Any] = build_demo_config()
    config["growth_stage_days"] = None
    with pytest.raises(ValueError, match="growth_stage_days"):
        daily_ideal_bounds(frame, config)


def test_streamlit_app_runs_without_exception() -> None:
    from streamlit.testing.v1 import AppTest

    app = Path(__file__).parents[1] / "agriwater/dashboard/app.py"
    tested = AppTest.from_file(str(app), default_timeout=60).run()
    assert not tested.exception
    assert not tested.error
    assert len(tested.metric) == 5
    assert len(tested.dataframe) == 1
    assert len(tested.get("vega_lite_chart")) == 4
