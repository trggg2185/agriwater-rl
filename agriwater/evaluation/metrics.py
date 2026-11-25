"""Evaluation metrics matching docs/EXPERIMENT_GUIDE.md conventions."""

from collections.abc import Sequence
from typing import Any

import numpy as np


def calculate_metrics(
    transitions: Sequence[dict[str, Any]],
    *,
    baseline_water: float | None = None,
) -> dict[str, float]:
    """Aggregate water, reward, ideal ratio, stress and waste counts from daily records."""
    if not transitions:
        raise ValueError("transitions must not be empty")

    days_survived = float(len(transitions))
    total_water = float(sum(float(row["water_used_liters"]) for row in transitions))
    total_reward = float(sum(float(row["reward"]) for row in transitions))
    ideal_days = float(sum(1 for row in transitions if row["is_ideal"]))
    stress_days = float(sum(1 for row in transitions if row["is_stressed"]))
    overwater_days = float(sum(1 for row in transitions if float(row["R_waste"]) < 0.0))
    rain_waste_days = float(sum(1 for row in transitions if float(row["R_rain"]) < 0.0))
    delay_days = float(sum(1 for row in transitions if float(row["R_delay"]) < 0.0))
    last = transitions[-1]

    metrics: dict[str, float] = {
        "total_water_liters": total_water,
        "total_reward": total_reward,
        "days_survived": days_survived,
        "ideal_days": ideal_days,
        "ideal_ratio": ideal_days / days_survived,
        "stress_days": stress_days,
        "overwater_days": overwater_days,
        "rain_waste_days": rain_waste_days,
        "delay_days": delay_days,
        "terminated": 1.0 if last["terminated"] else 0.0,
        "truncated": 1.0 if last["truncated"] else 0.0,
    }
    if baseline_water is not None:
        if isinstance(baseline_water, bool) or not np.isfinite(baseline_water):
            raise ValueError("baseline_water must be a finite number")
        if baseline_water > 0.0:
            metrics["water_saving_pct"] = 100.0 * (baseline_water - total_water) / baseline_water
    return metrics


def summarize_episodes(
    episode_metrics: Sequence[dict[str, float]],
) -> dict[str, dict[str, float]]:
    """Compute mean and standard deviation per metric across evaluated episodes."""
    if not episode_metrics:
        raise ValueError("episode_metrics must not be empty")
    keys = list(episode_metrics[0])
    summary: dict[str, dict[str, float]] = {}
    for key in keys:
        values = np.array([m[key] for m in episode_metrics if key in m], dtype=np.float64)
        summary[key] = {"mean": float(values.mean()), "std": float(values.std())}
    return summary
