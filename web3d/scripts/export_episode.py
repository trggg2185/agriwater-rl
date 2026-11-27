#!/usr/bin/env python
"""Xuất MỘT ván AgriWater-RL từ Python thành JSON cho cảnh 3D đọc.

Đây là cầu nối ngoại tuyến giữa `agriwater/` và `web3d/`: Python chạy môi
trường thật rồi ghi ra `web3d/public/data/episode-<scenario>-s<seed>.json`.
Cảnh 3D chỉ fetch file đó — không tự tính lại công thức.

    python web3d/scripts/export_episode.py --scenario dry --seed 42 --policy baseline

Muốn bấm tưới là Python tính ngay (không qua file) thì chạy API:

    .venv/bin/uvicorn agriwater.api.app:app --reload --port 8000

Cả hai đường dùng chung `agriwater/api/runtime.py`, nên bản ghi trong file JSON
và bản ghi `/api/step` trả về giống hệt nhau.

Quyền hạn: file này KHÔNG sửa `configs/*.yaml` và KHÔNG sửa mã trong
`agriwater/`. Nếu `water_balance` còn `null`, nó dùng đúng bộ số minh họa v0.1
trong bộ nhớ (như dashboard) và in rõ đang dùng bộ nào.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import numpy as np  # noqa: E402

from agriwater.api import runtime  # noqa: E402

POLICIES = ("baseline", "random", "fixed")


def make_policy(name: str, action: int | None, seed: int) -> Callable[[np.ndarray], int]:
    """Trả về hàm `policy(observation) -> action`; tất định theo seed."""
    if name == "baseline":
        return runtime.baseline_action
    if name == "fixed":
        if action is None:
            raise SystemExit("--policy fixed cần --action 0..5")
        return lambda obs: int(action)
    rng = np.random.default_rng(seed)
    return lambda obs: int(rng.integers(0, 6))


def run_episode(
    *,
    scenario: str,
    seed: int,
    crop: int,
    config: dict[str, Any],
    policy: Callable[[np.ndarray], int],
    max_days: int,
) -> list[dict[str, Any]]:
    env, obs = runtime.open_environment(
        scenario=scenario, seed=seed, crop=crop, config={**config, "max_days": max_days}
    )
    try:
        series: list[dict[str, Any]] = []
        terminated = truncated = False
        while not (terminated or truncated):
            action = int(policy(obs))
            obs_after, reward, terminated, truncated, info = env.step(action)
            series.append(
                runtime.build_record(
                    obs_before=obs,
                    obs_after=obs_after,
                    action=action,
                    reward=reward,
                    info=info,
                    terminated=terminated,
                    truncated=truncated,
                )
            )
            obs = obs_after
        return series
    finally:
        env.close()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Xuất episode AgriWater-RL thành JSON cho web3d")
    parser.add_argument("--scenario", choices=runtime.SCENARIOS, default="dry")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--crop", type=int, choices=range(4), default=0)
    parser.add_argument("--policy", choices=POLICIES, default="baseline")
    parser.add_argument(
        "--action", type=int, choices=range(6), default=None, help="chỉ dùng với --policy fixed"
    )
    parser.add_argument(
        "--max-days", type=int, default=None, help="mặc định lấy max_days trong config"
    )
    parser.add_argument("--out-dir", type=Path, default=Path("web3d/public/data"))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    config, config_source = runtime.resolve_config()
    max_days = int(args.max_days or config["max_days"])
    policy = make_policy(args.policy, args.action, args.seed)

    series = run_episode(
        scenario=args.scenario,
        seed=args.seed,
        crop=args.crop,
        config=config,
        policy=policy,
        max_days=max_days,
    )
    payload = runtime.build_payload(
        series=series,
        config=config,
        scenario=args.scenario,
        seed=args.seed,
        crop=args.crop,
        policy=args.policy,
        config_source=config_source,
    )

    out_dir = (REPO_ROOT / args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    crop_suffix = f"-c{args.crop}" if args.crop else ""
    target = out_dir / f"episode-{args.scenario}-s{args.seed}{crop_suffix}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    water = sum(record["waterLiters"] for record in series)
    reward = sum(record["reward"] for record in series)
    last = series[-1]
    print(f"Nguồn số vật lý : {config_source}")
    print(
        "Chính sách      : "
        + args.policy
        + (f" (action {args.action})" if args.action is not None else "")
    )
    print(f"Số ngày chạy    : {len(series)}/{max_days}")
    print(f"Tổng nước tưới  : {water:.1f} L")
    print(f"Tổng thưởng     : {reward:.1f}")
    print(
        f"Độ ẩm ngày cuối : {last['moisture'] * 100:.1f} %"
        + (" (cây chết)" if last["terminated"] else "")
    )
    try:
        shown = target.relative_to(REPO_ROOT)
    except ValueError:  # --out-dir trỏ ra ngoài repo
        shown = target
    print(f"Đã ghi          : {shown}")


if __name__ == "__main__":
    main()
