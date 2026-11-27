"""Pure dataframe and metric helpers for the Streamlit dashboard.

Keeping the calculations outside ``app.py`` makes them testable without a
browser and without running Streamlit.
"""

from collections.abc import Mapping, Sequence
from typing import Any

import pandas as pd

from agriwater.environment.demo import RECORD_COLUMNS

REWARD_KEYS = [column for column in RECORD_COLUMNS if column.startswith("R_")]


def records_to_frame(records: Sequence[Mapping[str, Any]]) -> pd.DataFrame:
    """Convert demo records to a typed dataframe, preserving column order."""
    if not records:
        return pd.DataFrame(columns=RECORD_COLUMNS)
    frame = pd.DataFrame.from_records(records, columns=RECORD_COLUMNS)
    for column in ("day", "action"):
        frame[column] = frame[column].astype(int)
    for column in RECORD_COLUMNS:
        if column not in ("day", "action", "is_ideal", "is_stressed", "terminated", "truncated"):
            frame[column] = frame[column].astype(float)
    for column in ("is_ideal", "is_stressed", "terminated", "truncated"):
        frame[column] = frame[column].astype(bool)
    return frame


def compute_metrics(frame: pd.DataFrame) -> dict[str, Any]:
    """Return the summary metrics shown in the dashboard KPI cards."""
    days = int(len(frame))
    if days == 0:
        return {
            "days": 0,
            "total_water_liters": 0.0,
            "total_reward": 0.0,
            "ideal_days": 0,
            "ideal_ratio": 0.0,
            "stress_days": 0,
            "overwater_days": 0,
            "rain_waste_days": 0,
            "delay_days": 0,
            "termination_reason": "chưa chạy",
        }
    last = frame.iloc[-1]
    if bool(last["terminated"]):
        reason = "sinh học"
    elif bool(last["truncated"]):
        reason = "hết số ngày"
    else:
        reason = "chưa kết thúc"
    ideal_days = int(frame["is_ideal"].sum())
    return {
        "days": days,
        "total_water_liters": float(frame["water_used_liters"].sum()),
        "total_reward": float(frame["reward"].sum()),
        "ideal_days": ideal_days,
        "ideal_ratio": ideal_days / days,
        "stress_days": int(frame["is_stressed"].sum()),
        "overwater_days": int((frame["R_waste"] < 0).sum()),
        "rain_waste_days": int((frame["R_rain"] < 0).sum()),
        "delay_days": int((frame["R_delay"] < 0).sum()),
        "termination_reason": reason,
    }


def cumulative_reward(frame: pd.DataFrame) -> pd.Series:
    """Return cumulative reward indexed by day, starting from zero."""
    return frame.set_index("day")["reward"].cumsum()


def component_totals(frame: pd.DataFrame) -> dict[str, float]:
    """Sum each of the six reward components over the episode."""
    return {key: float(frame[key].sum()) for key in REWARD_KEYS}


def daily_ideal_bounds(
    frame: pd.DataFrame, config: Mapping[str, Any]
) -> tuple[list[float], list[float]]:
    """Return the ideal moisture band for each recorded day.

    The band changes at growth-stage milestones. Missing or ``null`` config is
    rejected instead of being silently treated as zero.
    """
    moisture = config.get("moisture")
    if not isinstance(moisture, Mapping):
        raise ValueError("config.moisture must be a mapping")
    default = moisture.get("ideal_default")
    stage_two = moisture.get("ideal_stage_2")
    milestones = config.get("growth_stage_days")
    initial = config.get("initial_state")
    if not isinstance(milestones, list) or len(milestones) != 3:
        raise ValueError("growth_stage_days must contain three milestones")
    if not isinstance(initial, Mapping):
        raise ValueError("initial_state must be a mapping")
    start_stage = initial.get("growth_stage")
    if isinstance(start_stage, bool) or not isinstance(start_stage, int):
        raise ValueError("initial_state.growth_stage must be an integer 0-3")
    low: list[float] = []
    high: list[float] = []
    for day in frame["day"].astype(int):
        stage = min(3, start_stage + sum(day >= milestone for milestone in milestones))
        bounds = stage_two if stage == 2 else default
        if not isinstance(bounds, list) or len(bounds) != 2:
            raise ValueError("ideal moisture bounds must contain two numbers")
        low.append(float(bounds[0]))
        high.append(float(bounds[1]))
    return low, high
