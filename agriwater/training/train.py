"""Training loop and CLI using the shared public agent learning protocol."""

import argparse
import csv
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
import torch
import yaml

from agriwater.agents.base_agent import BaseAgent
from agriwater.agents.dqn import DQNAgent
from agriwater.config import load_config
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.demo import _record
from agriwater.environment.weather import generate_weather
from agriwater.evaluation.evaluate import evaluate
from agriwater.evaluation.metrics import calculate_metrics

_TRAIN_LOG_COLUMNS = [
    "episode",
    "steps",
    "total_reward",
    "total_water_liters",
    "ideal_ratio",
    "stress_days",
    "mean_loss",
    "epsilon",
    "terminated",
    "truncated",
]


def _load_training_mapping(config_path: Path | None) -> dict[str, Any]:
    if config_path is None:
        return load_config("training")
    data = yaml.safe_load(Path(config_path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Training config file must contain a top-level mapping")
    return data


def _require_learning_protocol(agent: BaseAgent) -> None:
    for method in ("learn", "end_episode"):
        if not callable(getattr(agent, method, None)):
            raise TypeError(f"Agent {type(agent).__name__} must implement public {method}()")


def _write_training_log(rows: list[dict[str, Any]], log_path: Path) -> Path:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=_TRAIN_LOG_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return log_path


_MIXED_SCENARIOS = ("dry", "random", "stormy")


def _validate_policy(
    agent: BaseAgent,
    max_days: int,
    weathers_by_scenario: dict[str, list[tuple[int, list[Any]]]],
) -> float:
    rewards: list[float] = []
    for scenario, weathers in weathers_by_scenario.items():
        eval_env = AgriWaterEnv(scenario=scenario, max_days=max_days)
        try:
            for val_seed, weather in weathers:
                records = evaluate(agent, eval_env, weather, seed=val_seed)
                rewards.append(calculate_metrics(records)["total_reward"])
        finally:
            eval_env.close()
    return float(np.mean(rewards))


def train(
    agent: BaseAgent,
    env: AgriWaterEnv,
    config_path: Path | None = None,
    *,
    episodes: int | None = None,
    seed: int | None = None,
    checkpoint_path: Path | None = None,
    log_path: Path | None = None,
    eval_episodes: int = 10,
    eval_every: int = 50,
    randomize_crop: bool = False,
    scenarios: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Train a learning agent via public API methods without reading private fields."""
    _require_learning_protocol(agent)
    cfg = _load_training_mapping(config_path)
    base_seed = int(cfg.get("seed", 42) if seed is None else seed)
    if episodes is None:
        dqn_section = cfg.get("dqn") if isinstance(cfg.get("dqn"), dict) else {}
        episodes = int(cfg.get("episodes", dqn_section.get("episodes", 1000)))
    if episodes < 1:
        raise ValueError("episodes must be a positive integer")
    if eval_episodes < 0 or eval_every < 1:
        raise ValueError("eval_episodes must be >= 0 and eval_every must be >= 1")

    scenario_cycle = tuple(scenarios) if scenarios is not None else (env.scenario,)
    if not scenario_cycle:
        raise ValueError("scenarios must not be empty")
    extra_envs: dict[str, AgriWaterEnv] = {}
    env_by_scenario: dict[str, AgriWaterEnv] = {env.scenario: env}
    for sc in scenario_cycle:
        if sc not in env_by_scenario:
            extra = AgriWaterEnv(scenario=sc, max_days=env.max_days)
            extra_envs[sc] = extra
            env_by_scenario[sc] = extra

    crop_rng = np.random.default_rng(base_seed + 7919)
    unique_scenarios = tuple(dict.fromkeys(scenario_cycle))
    val_weathers = {
        sc: [
            (
                base_seed + 100_000 + i,
                generate_weather(sc, env.max_days + 1, seed=base_seed + 100_000 + i),
            )
            for i in range(eval_episodes)
        ]
        for sc in unique_scenarios
        if eval_episodes > 0
    }

    history: list[dict[str, Any]] = []
    best_val_reward = float("-inf")
    best_episode = 0
    saved_path: Path | None = None

    try:
        for episode in range(1, episodes + 1):
            ep_seed = base_seed + episode - 1
            active_env = env_by_scenario[scenario_cycle[(episode - 1) % len(scenario_cycle)]]
            options = {"crop_type": int(crop_rng.integers(0, 4))} if randomize_crop else None
            state, _ = active_env.reset(seed=ep_seed, options=options)
            records: list[dict[str, Any]] = []
            losses: list[float] = []
            terminated = truncated = False

            while not (terminated or truncated):
                action = agent.select_action(state, training=True)
                next_state, reward, terminated, truncated, info = active_env.step(action)
                loss = agent.learn(state, action, reward, next_state, terminated, truncated)
                if loss is not None:
                    losses.append(float(loss))
                records.append(_record(info, action, reward, terminated, truncated))
                state = next_state

            agent.end_episode()
            ep_metrics = calculate_metrics(records)
            epsilon = float(getattr(agent, "epsilon", 0.0))
            history.append(
                {
                    "episode": episode,
                    "steps": int(ep_metrics["days_survived"]),
                    "total_reward": ep_metrics["total_reward"],
                    "total_water_liters": ep_metrics["total_water_liters"],
                    "ideal_ratio": ep_metrics["ideal_ratio"],
                    "stress_days": int(ep_metrics["stress_days"]),
                    "mean_loss": float(np.mean(losses)) if losses else 0.0,
                    "epsilon": epsilon,
                    "terminated": bool(ep_metrics["terminated"]),
                    "truncated": bool(ep_metrics["truncated"]),
                }
            )

            should_eval = bool(val_weathers) and (episode % eval_every == 0 or episode == episodes)
            if should_eval:
                val_reward = _validate_policy(agent, env.max_days, val_weathers)
                if val_reward > best_val_reward:
                    best_val_reward = val_reward
                    best_episode = episode
                    if checkpoint_path is not None and callable(getattr(agent, "save", None)):
                        saved_path = agent.save(checkpoint_path)

        if (
            checkpoint_path is not None
            and saved_path is None
            and callable(getattr(agent, "save", None))
        ):
            saved_path = agent.save(checkpoint_path)
            best_episode = episodes
    finally:
        for extra in extra_envs.values():
            extra.close()

    if log_path is not None:
        _write_training_log(history, log_path)

    return {
        "history": history,
        "best_val_reward": best_val_reward if val_weathers else None,
        "best_episode": best_episode,
        "checkpoint_path": saved_path,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train DQNAgent on AgriWaterEnv")
    parser.add_argument(
        "--scenario",
        choices=("dry", "stormy", "random", "mixed"),
        default="mixed",
    )
    parser.add_argument("--episodes", type=int, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--loss", choices=("mse", "huber"), default=None)
    parser.add_argument("--double-dqn", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("models/dqn_best.pt"))
    parser.add_argument("--log", type=Path, default=Path("logs/dqn_train.csv"))
    parser.add_argument("--eval-every", type=int, default=50)
    parser.add_argument("--eval-episodes", type=int, default=10)
    parser.add_argument("--randomize-crop", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> None:
    """Train a DQN agent from configs/training.yaml and save best checkpoint + CSV log."""
    args = build_parser().parse_args(argv)
    cfg = _load_training_mapping(args.config)
    seed = int(cfg.get("seed", 42) if args.seed is None else args.seed)
    dqn_cfg = dict(cfg.get("dqn") or {})
    if args.loss is not None:
        dqn_cfg["loss"] = args.loss
    if args.double_dqn:
        dqn_cfg["double_dqn"] = True
    if dqn_cfg.get("device", "cpu") == "cpu":
        torch.set_num_threads(1)

    agent = DQNAgent(dqn_cfg, seed=seed)
    scenarios = _MIXED_SCENARIOS if args.scenario == "mixed" else (args.scenario,)
    env = AgriWaterEnv(scenario=scenarios[0])
    try:
        result = train(
            agent,
            env,
            args.config,
            episodes=args.episodes,
            seed=seed,
            checkpoint_path=args.output,
            log_path=args.log,
            eval_episodes=args.eval_episodes,
            eval_every=args.eval_every,
            randomize_crop=args.randomize_crop,
            scenarios=scenarios,
        )
    finally:
        env.close()

    last_window = result["history"][-min(50, len(result["history"])) :]
    mean_tail_reward = float(np.mean([row["total_reward"] for row in last_window]))
    print(f"Hoàn tất huấn luyện DQN ({len(result['history'])} episodes, scenario={args.scenario})")
    print(f"Reward trung bình {len(last_window)} tập cuối: {mean_tail_reward:.2f}")
    if result["best_val_reward"] is not None:
        best_val = result["best_val_reward"]
        best_ep = result["best_episode"]
        print(f"Validation tốt nhất: {best_val:.2f} tại episode {best_ep}")
    if result["checkpoint_path"] is not None:
        print(f"Checkpoint đã lưu: {result['checkpoint_path']}")
    print(f"Log huấn luyện đã lưu: {args.log}")


if __name__ == "__main__":
    main()
