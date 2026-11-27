"""Evaluate trained Tabular Q-learning (epsilon=0) against Random and Baseline policies.

All policies are evaluated on identical pre-generated weather sequences and initial
conditions per episode across dry, stormy, and random scenarios.
"""

from __future__ import annotations

import argparse
import csv
from collections.abc import Callable
from pathlib import Path
from typing import Any

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from agriwater.agents.q_agent import QLearningAgent  # noqa: E402
from agriwater.api import runtime  # noqa: E402
from agriwater.environment.agriwater_env import AgriWaterEnv  # noqa: E402
from agriwater.environment.weather import generate_weather  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_PATH = ROOT / "models" / "q_table.npz"
DEFAULT_CSV_OUT = ROOT / "results" / "q_learning_eval_comparison.csv"
DEFAULT_PLOT_OUT = ROOT / "results" / "q_learning_eval_comparison.png"
SCENARIOS: tuple[str, ...] = ("dry", "stormy", "random")


def _run_episode(
    env: AgriWaterEnv,
    policy_fn: Callable[[np.ndarray], int],
    *,
    seed: int,
    crop_type: int,
    weather: list[dict[str, float]],
) -> dict[str, Any]:
    state, _ = env.reset(seed=seed, options={"crop_type": crop_type, "weather": weather})
    total_reward = 0.0
    total_water = 0.0
    ideal_days = 0
    stress_days = 0
    steps = 0
    survived = True

    while True:
        action = int(policy_fn(state))
        next_state, reward, terminated, truncated, info = env.step(action)
        total_reward += float(reward)
        total_water += float(info["water_used_liters"])
        ideal_days += int(bool(info["is_ideal"]))
        stress_days += int(bool(info["is_stressed"]))
        steps += 1
        state = next_state
        if terminated or truncated:
            survived = not bool(terminated)
            break

    return {
        "reward": total_reward,
        "water_liters": total_water,
        "ideal_ratio": ideal_days / max(1, steps),
        "stress_days": stress_days,
        "steps": steps,
        "survived": survived,
    }


def evaluate_policies(
    *,
    model_path: str | Path = DEFAULT_MODEL_PATH,
    episodes: int = 100,
    seed: int = 1000,
    csv_out: str | Path = DEFAULT_CSV_OUT,
    plot_out: str | Path = DEFAULT_PLOT_OUT,
    verbose: bool = True,
) -> list[dict[str, Any]]:
    """Run paired evaluation of Q-Learning (eps=0), Random, and Baseline across all 3 scenarios."""
    q_agent = QLearningAgent.load(model_path, seed=seed)
    q_agent.epsilon = 0.0  # Explicitly enforce greedy evaluation.

    summary_rows: list[dict[str, Any]] = []

    for scenario in SCENARIOS:
        env = AgriWaterEnv(scenario=scenario, render_mode=None)
        max_days = env.max_days
        random_rng = np.random.default_rng(seed + hash(scenario) % 10000)

        policies: dict[str, Callable[[np.ndarray], int]] = {
            "Q-Learning": lambda obs: q_agent.select_action(obs, training=False),
            "Random": lambda _obs: int(random_rng.integers(0, 6)),
            "Baseline": runtime.baseline_action,
        }

        per_policy_runs: dict[str, list[dict[str, Any]]] = {name: [] for name in policies}

        try:
            for idx in range(episodes):
                ep_seed = seed + idx
                crop_type = idx % 4
                weather = generate_weather(scenario, max_days + 1, seed=ep_seed + 100_000)
                for name, fn in policies.items():
                    res = _run_episode(env, fn, seed=ep_seed, crop_type=crop_type, weather=weather)
                    per_policy_runs[name].append(res)
        finally:
            env.close()

        for name, runs in per_policy_runs.items():
            rewards = np.array([r["reward"] for r in runs], dtype=np.float64)
            waters = np.array([r["water_liters"] for r in runs], dtype=np.float64)
            ideals = np.array([r["ideal_ratio"] * 100.0 for r in runs], dtype=np.float64)
            stresses = np.array([r["stress_days"] for r in runs], dtype=np.float64)
            survivals = np.array([100.0 if r["survived"] else 0.0 for r in runs], dtype=np.float64)
            summary_rows.append(
                {
                    "scenario": scenario,
                    "policy": name,
                    "episodes": episodes,
                    "mean_reward": round(float(np.mean(rewards)), 2),
                    "std_reward": round(float(np.std(rewards)), 2),
                    "survival_rate_pct": round(float(np.mean(survivals)), 1),
                    "ideal_moisture_pct": round(float(np.mean(ideals)), 1),
                    "mean_stress_days": round(float(np.mean(stresses)), 2),
                    "mean_water_liters": round(float(np.mean(waters)), 1),
                }
            )

    _save_csv(summary_rows, csv_out)
    _plot_comparison(summary_rows, plot_out)

    if verbose:
        _print_table(summary_rows)
        print(f"\nSaved evaluation CSV:  {csv_out}")
        print(f"Saved comparison plot: {plot_out}")

    return summary_rows


def _save_csv(rows: list[dict[str, Any]], output_path: str | Path) -> Path:
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "scenario",
        "policy",
        "episodes",
        "mean_reward",
        "std_reward",
        "survival_rate_pct",
        "ideal_moisture_pct",
        "mean_stress_days",
        "mean_water_liters",
    ]
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return target


def _plot_comparison(rows: list[dict[str, Any]], output_path: str | Path) -> Path:
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    policies = ["Q-Learning", "Random", "Baseline"]
    colors = {"Q-Learning": "#1b7837", "Random": "#b2182b", "Baseline": "#2166ac"}
    x = np.arange(len(SCENARIOS))
    width = 0.25

    fig, axes = plt.subplots(1, 3, figsize=(14, 4.8))
    metrics = [
        ("mean_reward", "Mean Episode Reward", None),
        ("survival_rate_pct", "Survival Rate (%)", (0, 108)),
        ("ideal_moisture_pct", "Ideal Moisture Days (%)", (0, 108)),
    ]

    for ax, (key, title, ylim) in zip(axes, metrics):
        for offset_idx, policy in enumerate(policies):
            vals = [
                next(r[key] for r in rows if r["scenario"] == sc and r["policy"] == policy)
                for sc in SCENARIOS
            ]
            bars = ax.bar(x + (offset_idx - 1) * width, vals, width, label=policy, color=colors[policy])
            for bar, v in zip(bars, vals):
                va = "bottom" if v >= 0 else "top"
                ax.text(
                    bar.get_x() + bar.get_width() / 2.0,
                    v,
                    f"{v:.0f}",
                    ha="center",
                    va=va,
                    fontsize=8,
                )
        ax.set_xticks(x)
        ax.set_xticklabels([sc.capitalize() for sc in SCENARIOS])
        ax.set_title(title)
        ax.grid(True, axis="y", linestyle="--", alpha=0.4)
        if ylim is not None:
            ax.set_ylim(*ylim)

    axes[0].legend(loc="lower right")
    fig.suptitle("Policy Evaluation Comparison · AgriWater-RL (ε = 0)", fontsize=12)
    fig.tight_layout()
    fig.savefig(target, dpi=150)
    plt.close(fig)
    return target


def _print_table(rows: list[dict[str, Any]]) -> None:
    header = (
        f"{'Scenario':<9} | {'Policy':<11} | {'Reward (Mean ± Std)':>21} | "
        f"{'Survival%':>9} | {'Ideal%':>7} | {'Stress d':>8} | {'Water (L)':>9}"
    )
    print("\n" + header)
    print("-" * len(header))
    for r in rows:
        rew = f"{r['mean_reward']:8.2f} ± {r['std_reward']:6.2f}"
        print(
            f"{r['scenario']:<9} | {r['policy']:<11} | {rew:>21} | "
            f"{r['survival_rate_pct']:8.1f}% | {r['ideal_moisture_pct']:6.1f}% | "
            f"{r['mean_stress_days']:8.2f} | {r['mean_water_liters']:9.1f}"
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Compare trained Q-Learning vs Random and Baseline policies.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--episodes", type=int, default=100)
    parser.add_argument("--seed", type=int, default=1000)
    parser.add_argument("--csv-out", type=Path, default=DEFAULT_CSV_OUT)
    parser.add_argument("--plot-out", type=Path, default=DEFAULT_PLOT_OUT)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    evaluate_policies(
        model_path=args.model,
        episodes=args.episodes,
        seed=args.seed,
        csv_out=args.csv_out,
        plot_out=args.plot_out,
    )


if __name__ == "__main__":
    main()
