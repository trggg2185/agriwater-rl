"""Thuật toán Baseline (Rule-based Control) — Vũ Tuấn Khanh.

Bám theo mục "3. Thuật toán Baseline" trong docs/HocTangCuongN10_HoanChinh.docx:

    π_Baseline(s_t) = 4  nếu soil_moisture_t <  0.30   (tưới 20 lít)
    π_Baseline(s_t) = 0  nếu soil_moisture_t >= 0.30   (không tưới)

Baseline là chính sách tất định, KHÔNG học: không Q-table, không mạng nơ-ron,
không replay buffer, không ε-greedy. Reward chỉ được ghi nhận để đánh giá và so
sánh với Q-Learning/DQN, không dùng để cập nhật chính sách.

Cấu trúc module giống mã giả 3.2.2:
    1. BaselineAgent           — chọn hành động theo ngưỡng cố định.
    2. run_baseline_episode()  — chạy một episode và gom chỉ số.
    3. evaluate_baseline()     — đánh giá qua nhiều episode.

Chạy thử:
    python -m agriwater.agents.baseline --scenario dry --episodes 100 --seed 42
"""

from __future__ import annotations

import argparse
import csv
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np

from agriwater.agents.base_agent import BaseAgent

#: Vị trí soil_moisture trong vector trạng thái 7 chiều (S_t[2]).
SOIL_MOISTURE_INDEX = 2
#: Ngưỡng độ ẩm cần tưới m_threshold = 0.30 (30%).
DEFAULT_MOISTURE_THRESHOLD = 0.30
#: Action 4 tương ứng tưới 20 lít.
DEFAULT_IRRIGATION_ACTION = 4
#: V = {0, 5, 10, 15, 20, 25} lít cho A = {0, 1, 2, 3, 4, 5}.
DEFAULT_WATER_LEVELS = (0, 5, 10, 15, 20, 25)

EPISODE_COLUMNS = (
    "episode",
    "seed",
    "total_reward",
    "total_water",
    "stress_count",
    "ideal_count",
    "ideal_ratio",
    "steps",
    "terminated",
)


# ============================================================
# 1. Baseline Agent
# ============================================================
class BaselineAgent(BaseAgent):
    """Tác tử tưới theo ngưỡng độ ẩm cố định (Fixed-threshold Policy)."""

    def __init__(
        self,
        moisture_threshold: float = DEFAULT_MOISTURE_THRESHOLD,
        irrigation_action: int = DEFAULT_IRRIGATION_ACTION,
        water_levels: Sequence[float] = DEFAULT_WATER_LEVELS,
    ) -> None:
        if isinstance(moisture_threshold, bool) or not isinstance(
            moisture_threshold, (int, float, np.floating)
        ):
            raise TypeError("moisture_threshold must be a number")
        if not 0.0 <= float(moisture_threshold) <= 1.0:
            raise ValueError("moisture_threshold must be in [0, 1]")
        levels = tuple(float(v) for v in water_levels)
        if len(levels) != 6:
            raise ValueError("water_levels must have 6 values for actions 0..5")
        if isinstance(irrigation_action, (bool, np.bool_)) or not isinstance(
            irrigation_action, (int, np.integer)
        ):
            raise TypeError("irrigation_action must be an integer")
        if not 0 <= int(irrigation_action) < len(levels):
            raise ValueError("irrigation_action must be an integer from 0 to 5")

        # Ngưỡng độ ẩm cần tưới
        self.moisture_threshold = float(moisture_threshold)
        # Action 4 tương ứng với tưới 20 lít
        self.irrigation_action = int(irrigation_action)
        # Lượng nước tương ứng với 6 hành động
        self.water_levels = levels

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Chọn hành động theo ngưỡng độ ẩm cố định; state[2] là soil_moisture.

        `training` chỉ để khớp interface BaseAgent: Baseline không có khám phá
        nên training=True hay False đều cho cùng một hành động.
        """
        state = np.asarray(state, dtype=np.float32)
        if state.shape != (7,):
            raise ValueError("state must be the 7-dimensional observation vector")
        soil_moisture = state[SOIL_MOISTURE_INDEX]
        # So sánh theo float32 như hợp đồng môi trường (DESIGN_CONTRACT).
        if soil_moisture < np.float32(self.moisture_threshold):
            return self.irrigation_action
        return 0

    def get_water_amount(self, action: int) -> float:
        """Quy đổi chỉ số hành động thành lượng nước (lít)."""
        return self.water_levels[action]

    @classmethod
    def from_config(cls, config: dict[str, Any] | None = None, **kwargs: Any) -> BaselineAgent:
        """Lấy bảng lít từ `action_liters` trong configs/environment.yaml."""
        if config is None:
            from agriwater.config import load_config

            config = load_config("environment")
        return cls(water_levels=config["action_liters"], **kwargs)


# ============================================================
# 2. Chạy một episode bằng Baseline
# ============================================================
def run_baseline_episode(
    env: Any,
    agent: BaseAgent,
    max_steps: int = 500,
    *,
    seed: int | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Chạy một episode, trả total_reward, total_water, stress_count, ideal_ratio, steps.

    Vùng lý tưởng/stress đọc từ `info["is_ideal"]`/`info["is_stressed"]` của môi
    trường — cùng định nghĩa mà reward dùng (stress: m < 0.20 hoặc m > 0.85;
    lý tưởng: [0.40; 0.70], riêng giai đoạn 2 là [0.50; 0.75]). Nhờ vậy chỉ số của
    Baseline, Q-Learning và DQN được tính cùng một cách.
    """
    if isinstance(max_steps, bool) or not isinstance(max_steps, int) or max_steps < 1:
        raise ValueError("max_steps must be a positive integer")
    state, _ = env.reset(seed=seed, options=options)

    total_reward = 0.0
    total_water = 0.0
    stress_count = 0
    ideal_count = 0
    step_count = 0
    terminated = truncated = False

    for _ in range(max_steps):
        # 1. Chọn hành động theo chính sách Baseline (không khám phá)
        action = agent.select_action(state, training=False)
        # 2. Tương tác với môi trường
        next_state, reward, terminated, truncated, info = env.step(action)
        # 3. Cập nhật tổng phần thưởng và lượng nước
        total_reward += float(reward)
        total_water += float(agent.get_water_amount(action))
        step_count += 1
        # 4–6. Ghi nhận stress và độ ẩm lý tưởng ở trạng thái kế tiếp
        if info["is_stressed"]:
            stress_count += 1
        if info["is_ideal"]:
            ideal_count += 1
        # 7. Cập nhật trạng thái
        state = next_state
        # 8. Kiểm tra kết thúc episode
        if terminated or truncated:
            break

    ideal_ratio = ideal_count / step_count if step_count > 0 else 0.0
    return {
        "total_reward": total_reward,
        "total_water": total_water,
        "stress_count": stress_count,
        "ideal_count": ideal_count,
        "ideal_ratio": ideal_ratio,
        "steps": step_count,
        "terminated": bool(terminated),
    }


# ============================================================
# 3. Đánh giá Baseline qua nhiều episode
# ============================================================
def evaluate_baseline(
    env: Any,
    num_episodes: int = 1000,
    max_steps: int = 500,
    *,
    agent: BaseAgent | None = None,
    seed: int | None = 42,
    verbose: bool = True,
) -> list[dict[str, Any]]:
    """Đánh giá Baseline qua nhiều episode.

    Episode thứ i reset với seed + i, nên trạng thái đầu và chuỗi thời tiết là
    tái lập được: Q-Learning/DQN chạy cùng seed sẽ gặp đúng các điều kiện đó,
    bảo đảm so sánh công bằng.
    """
    if isinstance(num_episodes, bool) or not isinstance(num_episodes, int) or num_episodes < 1:
        raise ValueError("num_episodes must be a positive integer")
    if agent is None:
        agent = BaselineAgent(
            moisture_threshold=DEFAULT_MOISTURE_THRESHOLD,
            irrigation_action=DEFAULT_IRRIGATION_ACTION,
        )

    results = []
    for episode in range(num_episodes):
        episode_seed = None if seed is None else seed + episode
        result = run_baseline_episode(env=env, agent=agent, max_steps=max_steps, seed=episode_seed)
        result = {"episode": episode + 1, "seed": episode_seed, **result}
        results.append(result)
        if verbose:
            print(
                f"Episode {episode + 1} | "
                f"Reward: {result['total_reward']:.2f} | "
                f"Water: {result['total_water']:.2f} L | "
                f"Stress: {result['stress_count']} | "
                f"Ideal ratio: {result['ideal_ratio']:.2%}"
            )
    return results


def summarize_results(results: Sequence[dict[str, Any]]) -> dict[str, float]:
    """Trung bình/độ lệch chuẩn các chỉ số và tỉ lệ episode cây chết (terminated)."""
    if not results:
        raise ValueError("results must not be empty")
    summary: dict[str, float] = {"episodes": float(len(results))}
    for key in ("total_reward", "total_water", "stress_count", "ideal_ratio", "steps"):
        values = np.array([r[key] for r in results], dtype=float)
        summary[f"{key}_mean"] = float(values.mean())
        summary[f"{key}_std"] = float(values.std())
    summary["termination_rate"] = float(np.mean([r["terminated"] for r in results]))
    return summary


def save_results_csv(results: Sequence[dict[str, Any]], path: str | Path) -> Path:
    """Ghi kết quả từng episode ra CSV để vẽ biểu đồ/so sánh."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=EPISODE_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)
    return path


def main(argv: Sequence[str] | None = None) -> None:
    """CLI: đánh giá Baseline trên một kịch bản thời tiết."""
    from agriwater.environment.agriwater_env import AgriWaterEnv

    parser = argparse.ArgumentParser(description="Evaluate the rule-based Baseline")
    parser.add_argument("--scenario", choices=("dry", "stormy", "random"), default="random")
    parser.add_argument("--episodes", type=int, default=100)
    parser.add_argument("--max-steps", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--threshold", type=float, default=DEFAULT_MOISTURE_THRESHOLD)
    parser.add_argument("--action", type=int, default=DEFAULT_IRRIGATION_ACTION)
    parser.add_argument("--output", type=Path, default=None, help="CSV kết quả từng episode")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    env = AgriWaterEnv(scenario=args.scenario)
    agent = BaselineAgent.from_config(
        moisture_threshold=args.threshold, irrigation_action=args.action
    )
    try:
        results = evaluate_baseline(
            env,
            num_episodes=args.episodes,
            max_steps=args.max_steps,
            agent=agent,
            seed=args.seed,
            verbose=not args.quiet,
        )
    finally:
        env.close()

    s = summarize_results(results)
    print(f"\n=== Baseline | scenario={args.scenario} | {args.episodes} episodes ===")
    print(f"Reward TB      : {s['total_reward_mean']:.2f} ± {s['total_reward_std']:.2f}")
    print(f"Nước TB        : {s['total_water_mean']:.2f} ± {s['total_water_std']:.2f} L")
    print(f"Ngày stress TB : {s['stress_count_mean']:.2f}")
    print(f"Tỉ lệ lý tưởng : {s['ideal_ratio_mean']:.2%}")
    print(f"Tỉ lệ cây chết : {s['termination_rate']:.2%}")
    if args.output is not None:
        print(f"Đã ghi {save_results_csv(results, args.output)}")


if __name__ == "__main__":
    main()
