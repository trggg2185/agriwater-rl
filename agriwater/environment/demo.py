"""Non-learning demo: replay fixed or random actions and export daily records."""

import argparse
import csv
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np

from agriwater.environment.agriwater_env import AgriWaterEnv

RECORD_COLUMNS = [
    "day",
    "action",
    "water_used_liters",
    "actual_rain_mm",
    "soil_moisture",
    "reward",
    "is_ideal",
    "is_stressed",
    "terminated",
    "truncated",
    "R_health",
    "R_stress",
    "R_water",
    "R_waste",
    "R_rain",
    "R_delay",
]
_REWARD_KEYS = RECORD_COLUMNS[-6:]
_SCENARIOS = ("dry", "stormy", "random")


def _validate_action(action: int | None) -> None:
    if action is None:
        return
    if isinstance(action, (bool, np.bool_)) or not isinstance(action, (int, np.integer)):
        raise TypeError("action must be None or an integer from 0 to 5")
    if not 0 <= int(action) <= 5:
        raise ValueError("action must be None or an integer from 0 to 5")


def _validate_seed(seed: int) -> None:
    if isinstance(seed, (bool, np.bool_)) or not isinstance(seed, (int, np.integer)):
        raise TypeError("seed must be an integer")


def _record(
    info: dict[str, Any], action: int, reward: float, terminated: bool, truncated: bool
) -> dict[str, Any]:
    components = info["reward_components"]
    missing = [key for key in _REWARD_KEYS if key not in components]
    if missing:
        raise KeyError(f"reward_components is missing: {', '.join(missing)}")
    return {
        "day": int(info["day"]),
        "action": int(action),
        "water_used_liters": float(info["water_used_liters"]),
        "actual_rain_mm": float(info["actual_rain_mm"]),
        "soil_moisture": float(info["soil_moisture"]),
        "reward": float(reward),
        "is_ideal": bool(info["is_ideal"]),
        "is_stressed": bool(info["is_stressed"]),
        "terminated": bool(terminated),
        "truncated": bool(truncated),
        **{key: float(components[key]) for key in _REWARD_KEYS},
    }


def run_episode(
    scenario: str = "random", seed: int = 42, action: int | None = None
) -> list[dict[str, Any]]:
    """Run one episode without learning and return one record per day.

    ``action=None`` samples actions from a dedicated RNG, so the weather
    sequence is unaffected. Fixed actions 0..5 are applied every day.
    """
    _validate_seed(seed)
    _validate_action(action)
    action_rng = np.random.default_rng(seed)
    env = AgriWaterEnv(scenario=scenario)
    records: list[dict[str, Any]] = []
    try:
        env.reset(seed=int(seed))
        terminated = truncated = False
        while not (terminated or truncated):
            chosen = (
                int(action_rng.integers(0, env.action_space.n)) if action is None else int(action)
            )
            _, reward, terminated, truncated, info = env.step(chosen)
            records.append(_record(info, chosen, reward, terminated, truncated))
    finally:
        env.close()
    return records


def write_csv(
    records: Sequence[dict[str, Any]], output: str | Path, *, force: bool = False
) -> Path:
    """Write records to ``output`` without silently overwriting an existing file."""
    path = Path(output)
    if path.exists() and not force:
        raise FileExistsError(f"{path} already exists; pass force=True or --force to overwrite")
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=RECORD_COLUMNS)
        writer.writeheader()
        writer.writerows(records)
    return path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AgriWater-RL non-learning demo")
    parser.add_argument("--scenario", choices=_SCENARIOS, default="random")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--action", type=int, choices=range(6), default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--force", action="store_true", help="overwrite an existing CSV file")
    return parser


def main(argv: list[str] | None = None) -> None:
    """Run the demo, optionally write CSV and print a short summary."""
    args = build_parser().parse_args(argv)
    records = run_episode(args.scenario, args.seed, args.action)
    if args.output is not None:
        try:
            path = write_csv(records, args.output, force=args.force)
        except FileExistsError as exc:
            raise SystemExit(str(exc)) from exc
        print(f"Đã ghi {len(records)} bản ghi vào {path}")

    policy = "hành động ngẫu nhiên" if args.action is None else f"hành động cố định {args.action}"
    total_water = sum(record["water_used_liters"] for record in records)
    total_reward = sum(record["reward"] for record in records)
    print("Demo không học (non-learning demo)")
    print(f"Kịch bản: {args.scenario}, seed: {args.seed}, {policy}")
    print(f"Số ngày chạy: {len(records)}")
    print(f"Tổng nước tưới: {total_water:.1f} lít")
    print(f"Tổng reward: {total_reward:.1f}")


if __name__ == "__main__":
    main()
