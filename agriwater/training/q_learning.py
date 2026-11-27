"""Headless Tabular Q-learning training script for AgriWater-RL.

Runs AgriWaterEnv with render_mode=None, saves the trained Q-table (.npz),
exports a Web-UI-compatible training log CSV (episode,reward,loss,...),
and renders the Learning Curve PNG.
"""

from __future__ import annotations

import argparse
import csv
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from agriwater.agents.base_agent import BaseAgent
from agriwater.agents.q_agent import QLearningAgent
from agriwater.config import load_config
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.weather import generate_weather

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_PATH = ROOT / "models" / "q_table.npz"
DEFAULT_LOG_PATH = ROOT / "results" / "q_learning_training_log.csv"
DEFAULT_PLOT_PATH = ROOT / "results" / "q_learning_learning_curve.png"

MIXED_SCENARIOS: tuple[str, ...] = ("random", "dry", "stormy")
MIXED_PROBS: tuple[float, ...] = (0.50, 0.25, 0.25)


def _moving_average(values: np.ndarray, window: int = 100) -> np.ndarray:
    if values.size == 0:
        return values
    effective = min(window, values.size)
    cumsum = np.cumsum(np.insert(values, 0, 0.0))
    ma = (cumsum[effective:] - cumsum[:-effective]) / float(effective)
    # Pad prefix with expanding mean so x-axis aligns 1:1 with episodes.
    prefix = np.array(
        [float(np.mean(values[: i + 1])) for i in range(effective - 1)], dtype=np.float64
    )
    return np.concatenate([prefix, ma])


def plot_learning_curve(
    rewards: list[float],
    losses: list[float],
    epsilons: list[float],
    output_path: str | Path,
    window: int = 100,
) -> Path:
    """Save a headless 2-panel Learning Curve figure (Reward + Epsilon/TD Error)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    episodes = np.arange(1, len(rewards) + 1)
    reward_arr = np.asarray(rewards, dtype=np.float64)
    loss_arr = np.asarray(losses, dtype=np.float64)
    eps_arr = np.asarray(epsilons, dtype=np.float64)
    ma_reward = _moving_average(reward_arr, window=window)
    ma_loss = _moving_average(loss_arr, window=window)

    fig, (ax1, ax2) = plt.subplots(
        2, 1, figsize=(10, 7), sharex=True, gridspec_kw={"height_ratios": [2, 1]}
    )

    ax1.plot(
        episodes, reward_arr, color="#9ecae1", alpha=0.35, linewidth=0.8, label="Episode Reward"
    )
    ax1.plot(
        episodes, ma_reward, color="#08519c", linewidth=2.0, label=f"Moving Average ({window} ep)"
    )
    ax1.set_ylabel("Total Reward")
    ax1.set_title("Tabular Q-Learning · Learning Curve (AgriWater-RL)")
    ax1.grid(True, linestyle="--", alpha=0.4)
    ax1.legend(loc="lower right")

    ax2.plot(
        episodes, ma_loss, color="#d95f0e", linewidth=1.6, label=f"Mean |TD Error| (MA {window})"
    )
    ax2.set_xlabel("Episode")
    ax2.set_ylabel("Mean |TD Error|", color="#d95f0e")
    ax2.tick_params(axis="y", labelcolor="#d95f0e")
    ax2.grid(True, linestyle="--", alpha=0.4)

    ax2_right = ax2.twinx()
    ax2_right.plot(
        episodes, eps_arr, color="#2ca25f", linestyle="--", linewidth=1.5, label="Epsilon (ε)"
    )
    ax2_right.set_ylabel("Epsilon (ε)", color="#2ca25f")
    ax2_right.set_ylim(0.0, 1.05)
    ax2_right.tick_params(axis="y", labelcolor="#2ca25f")

    lines1, labels1 = ax2.get_legend_handles_labels()
    lines2, labels2 = ax2_right.get_legend_handles_labels()
    ax2.legend(lines1 + lines2, labels1 + labels2, loc="upper right")

    fig.tight_layout()
    fig.savefig(target, dpi=150)
    plt.close(fig)
    return target


def save_training_log(records: list[dict[str, Any]], output_path: str | Path) -> Path:
    """Write training log CSV compatible with Web UI ResearchWorkspace trainingLog()."""
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["episode", "reward", "loss", "epsilon", "steps", "scenario", "crop_type"]
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)
    return target


def train_q_learning(
    *,
    scenario: str = "mixed",
    episodes: int = 15000,
    total_timesteps: int | None = None,
    alpha: float = 0.1,
    gamma: float = 0.99,
    epsilon_start: float = 1.0,
    epsilon_end: float = 0.05,
    epsilon_decay: float = 0.9997,
    seed: int = 42,
    model_out: str | Path = DEFAULT_MODEL_PATH,
    log_out: str | Path | None = DEFAULT_LOG_PATH,
    plot_out: str | Path | None = DEFAULT_PLOT_PATH,
    verbose: bool = True,
    on_episode: Callable[[dict[str, Any]], None] | None = None,
) -> tuple[QLearningAgent, list[dict[str, Any]]]:
    """Train a Tabular Q-learning agent headless and persist model, CSV log, and plot."""
    if scenario not in {"mixed", "dry", "stormy", "random"}:
        raise ValueError("scenario must be one of: mixed, dry, stormy, random")

    if total_timesteps is not None and total_timesteps < 1:
        raise ValueError("total_timesteps must be positive")
    episode_limit = total_timesteps if total_timesteps is not None else episodes

    rng = np.random.default_rng(seed)
    agent = QLearningAgent(
        n_actions=6,
        alpha=alpha,
        gamma=gamma,
        epsilon_start=epsilon_start,
        epsilon_end=epsilon_end,
        epsilon_decay=epsilon_decay,
        seed=seed,
    )

    # Load configs once to avoid tens of thousands of repeated YAML disk reads.
    env_config = load_config("environment")
    scenarios_config = load_config("scenarios")
    max_days = int(env_config["max_days"])

    # Create headless environments (render_mode=None) once per scenario to avoid overhead.
    scenario_list = MIXED_SCENARIOS if scenario == "mixed" else (scenario,)
    envs = {
        sc: AgriWaterEnv(scenario=sc, max_days=max_days, render_mode=None, config=env_config)
        for sc in scenario_list
    }

    records: list[dict[str, Any]] = []
    rewards_hist: list[float] = []
    losses_hist: list[float] = []
    epsilons_hist: list[float] = []

    start_time = time.perf_counter()
    timesteps = 0
    try:
        for ep in range(1, episode_limit + 1):
            if scenario == "mixed":
                ep_scenario = str(rng.choice(MIXED_SCENARIOS, p=MIXED_PROBS))
            else:
                ep_scenario = scenario
            env = envs[ep_scenario]

            ep_seed = int(rng.integers(0, 2**31 - 1))
            weather_seed = int(rng.integers(0, 2**31 - 1))
            crop_type = int(rng.integers(0, 4))
            weather = generate_weather(
                ep_scenario, max_days + 1, seed=weather_seed, ranges=scenarios_config[ep_scenario]
            )
            state, _ = env.reset(seed=ep_seed, options={"crop_type": crop_type, "weather": weather})

            ep_reward = 0.0
            td_abs_sum = 0.0
            steps = 0

            while True:
                action = agent.select_action(state, training=True)
                next_state, reward, terminated, truncated, _ = env.step(action)
                timesteps += 1
                budget_reached = timesteps == total_timesteps
                td_error = agent.update(
                    state, action, reward, next_state, terminated, truncated or budget_reached
                )

                ep_reward += float(reward)
                td_abs_sum += abs(td_error)
                steps += 1
                state = next_state

                if terminated or truncated or budget_reached:
                    break

            mean_loss = td_abs_sum / max(1, steps)
            current_eps = agent.epsilon
            agent.decay_epsilon()

            rewards_hist.append(ep_reward)
            losses_hist.append(mean_loss)
            epsilons_hist.append(current_eps)
            records.append(
                {
                    "episode": ep,
                    "reward": round(ep_reward, 4),
                    "loss": round(mean_loss, 6),
                    "epsilon": round(current_eps, 6),
                    "steps": steps,
                    "scenario": ep_scenario,
                    "crop_type": crop_type,
                }
            )

            if on_episode is not None:
                on_episode(records[-1])

            if verbose and (ep == 1 or ep % max(1, episodes // 10) == 0 or ep == episodes):
                recent_avg = float(np.mean(rewards_hist[-100:]))
                print(
                    f"[Ep {ep:>6}/{episodes}] avg100_reward={recent_avg:7.2f} | "
                    f"ep_reward={ep_reward:7.2f} | loss={mean_loss:6.3f} | eps={current_eps:.4f}",
                    flush=True,
                )
            if budget_reached:
                break
    finally:
        for env in envs.values():
            env.close()

    elapsed = time.perf_counter() - start_time
    nonzero_ratio = float(np.mean(agent.q_table != 0.0))

    agent.save(
        model_out,
        metadata={
            "scenario": scenario,
            "episodes": len(records),
            "timesteps": timesteps,
            "seed": seed,
            "elapsed_seconds": round(elapsed, 3),
            "num_states": agent.discretizer.num_states,
            "nonzero_q_ratio": round(nonzero_ratio, 4),
        },
    )
    if log_out is not None:
        save_training_log(records, log_out)
    if plot_out is not None:
        plot_learning_curve(rewards_hist, losses_hist, epsilons_hist, plot_out)

    if verbose:
        print(
            f"\nDone in {elapsed:.2f}s | States={agent.discretizer.num_states} | "
            f"Non-zero Q entries={nonzero_ratio * 100:.1f}%"
        )
        print(f"Saved Q-table:        {model_out}")
        print(f"Saved training CSV:   {log_out}")
        print(f"Saved learning curve: {plot_out}")

    return agent, records


def train(agent: BaseAgent, env: AgriWaterEnv, config_path: Path | None) -> None:
    """Train a QLearningAgent on a provided env using hyperparameters from a YAML config."""
    if not isinstance(agent, QLearningAgent):
        raise TypeError("Only QLearningAgent is supported by tabular train()")
    cfg = (
        load_config("training")
        if config_path is None
        else yaml.safe_load(config_path.read_text(encoding="utf-8"))
    )
    q_cfg = cfg.get("q_learning", {})
    episodes = int(q_cfg.get("episodes", 1000))
    seed = int(cfg.get("seed", 42))
    rng = np.random.default_rng(seed)

    for _ in range(episodes):
        ep_seed = int(rng.integers(0, 2**31 - 1))
        crop_type = int(rng.integers(0, 4))
        state, _ = env.reset(seed=ep_seed, options={"crop_type": crop_type})
        while True:
            action = agent.select_action(state, training=True)
            next_state, reward, terminated, truncated, _ = env.step(action)
            agent.update(state, action, reward, next_state, terminated, truncated)
            state = next_state
            if terminated or truncated:
                break
        agent.decay_epsilon()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train Tabular Q-learning for AgriWater-RL (headless)."
    )
    parser.add_argument("--scenario", choices=["mixed", "dry", "stormy", "random"], default="mixed")
    parser.add_argument("--episodes", type=int, default=15000)
    parser.add_argument("--alpha", type=float, default=0.1)
    parser.add_argument("--gamma", type=float, default=0.99)
    parser.add_argument("--epsilon-start", type=float, default=1.0)
    parser.add_argument("--epsilon-end", type=float, default=0.05)
    parser.add_argument("--epsilon-decay", type=float, default=0.9997)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--model-out", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--log-out", type=Path, default=DEFAULT_LOG_PATH)
    parser.add_argument("--plot-out", type=Path, default=DEFAULT_PLOT_PATH)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    train_q_learning(
        scenario=args.scenario,
        episodes=args.episodes,
        alpha=args.alpha,
        gamma=args.gamma,
        epsilon_start=args.epsilon_start,
        epsilon_end=args.epsilon_end,
        epsilon_decay=args.epsilon_decay,
        seed=args.seed,
        model_out=args.model_out,
        log_out=args.log_out,
        plot_out=args.plot_out,
    )


if __name__ == "__main__":
    main()
