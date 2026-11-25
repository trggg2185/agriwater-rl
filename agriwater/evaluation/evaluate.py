"""Fair policy evaluation on identical pre-generated daily weather sequences."""

import argparse
import csv
from copy import deepcopy
from pathlib import Path
from typing import Any

from agriwater.agents.base_agent import BaseAgent
from agriwater.agents.dqn import DQNAgent
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.demo import _record
from agriwater.environment.weather import WeatherDay, generate_weather
from agriwater.evaluation.metrics import calculate_metrics, summarize_episodes

_SCENARIOS = ("dry", "stormy", "random")


def evaluate(
    agent: BaseAgent,
    env: AgriWaterEnv,
    weather: list[WeatherDay],
    *,
    seed: int | None = None,
    initial_options: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Evaluate with training=False and replay the supplied immutable weather data."""
    options = {} if initial_options is None else deepcopy(initial_options)
    if "weather" in options:
        raise ValueError("Pass weather via the weather argument, not initial_options")
    options["weather"] = deepcopy(weather)

    state, _ = env.reset(seed=seed, options=options)
    records: list[dict[str, Any]] = []
    terminated = truncated = False
    while not (terminated or truncated):
        action = agent.select_action(state, training=False)
        state, reward, terminated, truncated, info = env.step(action)
        records.append(_record(info, action, reward, terminated, truncated))
    return records


def evaluate_scenario(
    agent: BaseAgent,
    scenario: str,
    *,
    episodes: int = 30,
    seed: int = 1000,
    max_days: int | None = None,
    initial_options: dict[str, Any] | None = None,
) -> tuple[list[dict[str, float]], dict[str, dict[str, float]]]:
    """Evaluate an agent across multiple seeded episodes on one weather scenario."""
    if episodes < 1:
        raise ValueError("episodes must be a positive integer")
    env = AgriWaterEnv(scenario=scenario, max_days=max_days)
    per_episode: list[dict[str, float]] = []
    try:
        for offset in range(episodes):
            ep_seed = seed + offset
            weather = generate_weather(scenario, env.max_days + 1, seed=ep_seed)
            records = evaluate(agent, env, weather, seed=ep_seed, initial_options=initial_options)
            row = {"seed": float(ep_seed), **calculate_metrics(records)}
            per_episode.append(row)
    finally:
        env.close()
    summary = summarize_episodes(per_episode)
    return per_episode, summary


def _write_metrics_csv(rows: list[dict[str, Any]], output: Path, *, force: bool = False) -> Path:
    if output.exists() and not force:
        raise FileExistsError(f"{output} already exists; pass --force to overwrite")
    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0])
    with output.open("w" if force else "x", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate a trained DQN agent on AgriWaterEnv")
    parser.add_argument("--model", type=Path, required=True, help="Path to DQN .pt checkpoint")
    parser.add_argument("--scenario", choices=(*_SCENARIOS, "all"), default="all")
    parser.add_argument("--episodes", type=int, default=30)
    parser.add_argument("--seed", type=int, default=1000)
    parser.add_argument("--crop-type", type=int, choices=range(4), default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--force", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> None:
    """Load a DQN checkpoint and report multi-seed metrics per scenario."""
    args = build_parser().parse_args(argv)
    agent = DQNAgent.from_checkpoint(args.model, seed=args.seed)
    initial_options = None if args.crop_type is None else {"crop_type": args.crop_type}
    scenarios = _SCENARIOS if args.scenario == "all" else (args.scenario,)

    all_rows: list[dict[str, Any]] = []
    for scenario in scenarios:
        rows, summary = evaluate_scenario(
            agent,
            scenario,
            episodes=args.episodes,
            seed=args.seed,
            initial_options=initial_options,
        )
        for row in rows:
            all_rows.append({"scenario": scenario, **row})
        survival_pct = (1.0 - summary["terminated"]["mean"]) * 100.0
        print(
            f"[{scenario:6s}] reward={summary['total_reward']['mean']:7.1f}±"
            f"{summary['total_reward']['std']:5.1f} | "
            f"water={summary['total_water_liters']['mean']:5.1f}L | "
            f"days={summary['days_survived']['mean']:4.1f} | "
            f"surv={survival_pct:5.1f}% | "
            f"ideal={summary['ideal_ratio']['mean'] * 100:5.1f}% | "
            f"stress={summary['stress_days']['mean']:4.2f} | "
            f"rain_waste={summary['rain_waste_days']['mean']:4.2f} | "
            f"delay={summary['delay_days']['mean']:4.2f}"
        )

    if args.output is not None:
        try:
            saved = _write_metrics_csv(all_rows, args.output, force=args.force)
        except FileExistsError as exc:
            raise SystemExit(str(exc)) from exc
        print(f"Đã ghi {len(all_rows)} bản ghi đánh giá vào {saved}")


if __name__ == "__main__":
    main()
