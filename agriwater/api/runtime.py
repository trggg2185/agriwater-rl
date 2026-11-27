"""Phần dùng chung của API và script xuất episode cho cảnh 3D.

Một chỗ duy nhất quyết định: lấy số vật lý ở đâu, sinh thời tiết thế nào, giải
mã vector 7 chiều ra sao, và một bản ghi ngày gồm những trường gì. Nhờ vậy file
JSON mà `web3d/scripts/export_episode.py` ghi ra và phản hồi của `/api/step`
luôn cùng một định dạng — đổi một chỗ là cả hai đổi theo.
"""

from __future__ import annotations

from collections.abc import Callable
from copy import copy
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np

from agriwater.agents.base_agent import BaseAgent
from agriwater.agents.baseline import BaselineAgent
from agriwater.agents.q_agent import QLearningAgent
from agriwater.config import load_config
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.observation import (
    CROP_TYPE,
    GROWTH_STAGE,
    LAST_IRRIGATION,
    RAIN_FORECAST_MM,
    RAIN_PROBABILITY,
    SOIL_MOISTURE,
    TEMPERATURE,
    decode_code,
    decode_irrigation,
    decode_rain_forecast,
    decode_temperature,
)
from agriwater.environment.weather import generate_weather

#: Định danh định dạng payload. Client kiểm tra chuỗi này trước khi đọc.
SCHEMA = "agriwater.episode/1"

#: Cấu hình luật Baseline dùng trong mô phỏng và replay.
BASELINE_THRESHOLD = 0.30
BASELINE_ACTION = 4

SCENARIOS = ("dry", "stormy", "random")
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_Q_TABLE_PATH = ROOT / "models" / "q_table.npz"

DEFAULT_DQN_PATH = ROOT / "models" / "dqn_best.pt"

_Q_AGENT_CACHE: dict[tuple[str, int, int], QLearningAgent] = {}
_DQN_AGENT_CACHE: dict[tuple[str, int, int], Any] = {}
_MODEL_LOCK = Lock()
POLICY_LABELS = {"baseline": "Baseline", "q_learning": "Q-Learning", "dqn": "DQN"}

_BASELINE_AGENT = BaselineAgent(
    moisture_threshold=BASELINE_THRESHOLD, irrigation_action=BASELINE_ACTION
)


def baseline_action(observation: np.ndarray) -> int:
    """Chọn mức tưới bằng BaselineAgent."""
    return _BASELINE_AGENT.select_action(observation, training=False)


def model_path(policy: str) -> Path:
    return {"q_learning": DEFAULT_Q_TABLE_PATH, "dqn": DEFAULT_DQN_PATH}[policy]


def _load_dqn(path: Path) -> Any:
    from agriwater.agents.dqn import DQNAgent

    agent = DQNAgent.from_checkpoint(path, device="cpu")
    agent.select_action(np.zeros(7, dtype=np.float32), training=False)
    return agent


def _load_model(path: Path, cache: dict, loader: Callable) -> Any:
    with _MODEL_LOCK:
        try:
            stat = path.stat()
        except FileNotFoundError:
            return None

        key = (str(path.resolve()), stat.st_ino, stat.st_mtime_ns)
        if key not in cache:
            agent = loader(path)
            cache.clear()
            cache[key] = agent
        return cache[key]


def get_q_agent(q_table_path: Path | None = None) -> QLearningAgent | None:
    agent = _load_model(
        Path(q_table_path) if q_table_path is not None else DEFAULT_Q_TABLE_PATH,
        _Q_AGENT_CACHE,
        lambda path: QLearningAgent.load(path, seed=0),
    )
    if agent is not None and (agent.n_actions != 6 or not np.isfinite(agent.q_table).all()):
        raise ValueError("Invalid Q-table for AgriWaterEnv")
    return agent


def get_policy_agent(policy: str, q_table_path: Path | None = None) -> Any:
    if policy == "baseline":
        return _BASELINE_AGENT
    try:
        agent = (
            get_q_agent(q_table_path)
            if policy == "q_learning"
            else _load_model(DEFAULT_DQN_PATH, _DQN_AGENT_CACHE, _load_dqn)
        )
    except Exception as exc:
        raise RuntimeError(
            f"Không đọc được mô hình {POLICY_LABELS[policy]}. Hãy huấn luyện lại."
        ) from exc
    if agent is None:
        raise RuntimeError(f"Chưa có mô hình {POLICY_LABELS[policy]}. Hãy huấn luyện trước.")
    return agent


def session_agent(policy: str, seed: int) -> BaseAgent:
    agent = get_policy_agent(policy)
    if isinstance(agent, QLearningAgent):
        # Share the checkpoint table while keeping tie-breaking reproducible per session.
        agent = copy(agent)
        agent.rng = np.random.default_rng(seed)
    return agent


def policy_statuses(q_table_path: Path | None = None) -> list[dict[str, Any]]:
    statuses = []
    for key, label in POLICY_LABELS.items():
        try:
            get_policy_agent(key, q_table_path)
        except RuntimeError as exc:
            statuses.append({"key": key, "label": label, "available": False, "reason": str(exc)})
        else:
            statuses.append({"key": key, "label": label, "available": True})
    return statuses


def available_policies(q_table_path: Path | None = None) -> list[str]:
    return [policy["key"] for policy in policy_statuses(q_table_path) if policy["available"]]


def select_policy_action(
    policy: str, observation: np.ndarray, q_table_path: Path | None = None
) -> int:
    return get_policy_agent(policy, q_table_path).select_action(observation, training=False)


def _round(value: Any, digits: int = 6) -> float:
    return round(float(value), digits)


# --------------------------------------------------------------------------- #
# Cấu hình và thời tiết
# --------------------------------------------------------------------------- #
def _balance_is_complete(config: dict[str, Any]) -> bool:
    balance = config.get("water_balance")
    if not isinstance(balance, dict) or any(value is None for value in balance.values()):
        return False
    return all(
        config.get(key) is not None
        for key in ("growth_stage_days", "biological_termination", "initial_state")
    )


@lru_cache(maxsize=1)
def resolve_config() -> tuple[dict[str, Any], str]:
    """Trả về (config, nhãn nguồn số).

    Ưu tiên `configs/environment.yaml`. Khi file đó còn `null` (hai thành viên
    chưa chốt số), dùng lại đúng bộ số minh họa v0.1 trong bộ nhớ mà dashboard
    đang dùng — không ghi gì xuống đĩa, không sửa YAML.

    Có cache: sửa YAML thì phải gọi `resolve_config.cache_clear()` hoặc khởi
    động lại tiến trình (giống `reward._reward_settings`).
    """
    committed = load_config("environment")
    if _balance_is_complete(committed):
        return committed, "configs/environment.yaml"

    try:
        from agriwater.dashboard.demo_config import build_demo_config
    except ImportError as exc:  # pragma: no cover - chỉ khi thiếu overlay
        raise RuntimeError(
            "configs/environment.yaml còn null và không tìm thấy bộ số minh họa v0.1"
        ) from exc

    config = build_demo_config()
    if not _balance_is_complete(config):
        raise RuntimeError("Bộ số minh họa v0.1 chưa đầy đủ, không chạy được môi trường")
    return config, "demo v0.1 (configs/environment.yaml còn null)"


def resolve_weather(scenario: str, days: int, seed: int) -> list[dict[str, float]]:
    """Sinh thời tiết; `scenarios.yaml` còn null thì mượn dải v0.1."""
    try:
        return generate_weather(scenario, days, seed=seed)
    except ValueError:
        from agriwater.dashboard.demo_config import demo_scenario_ranges

        return generate_weather(scenario, days, seed=seed, ranges=demo_scenario_ranges(scenario))


def build_meta(config: dict[str, Any]) -> dict[str, Any]:
    """Ngưỡng/mức nước để giao diện vẽ, không kèm nhãn hiển thị (UI tự có)."""
    moisture = config["moisture"]
    return {
        "maxDays": int(config["max_days"]),
        "actionLiters": list(config["action_liters"]),
        "moisture": {
            "idealDefault": list(moisture["ideal_default"]),
            "idealStage2": list(moisture["ideal_stage_2"]),
            "stressBounds": list(moisture["stress_bounds"]),
        },
        "growthStageDays": list(config["growth_stage_days"]),
    }


# --------------------------------------------------------------------------- #
# Một bước = một ngày
# --------------------------------------------------------------------------- #
def decode_observation(obs: np.ndarray) -> dict[str, float | int]:
    """Giải mã vector 7 chiều (0–1) về đơn vị người đọc.

    Tên và công thức của từng chiều nằm ở `agriwater.environment.observation`;
    ở đây chỉ ghép lại thành các trường mà giao diện quen đọc.
    """
    return {
        "crop": decode_code(obs[CROP_TYPE]),
        "stage": decode_code(obs[GROWTH_STAGE]),
        "moisture": float(obs[SOIL_MOISTURE]),
        "temperature": decode_temperature(obs[TEMPERATURE]),
        "rainProbability": float(obs[RAIN_PROBABILITY]),
        "rainForecastMm": decode_rain_forecast(obs[RAIN_FORECAST_MM]),
        "lastIrrigation": decode_irrigation(obs[LAST_IRRIGATION]),
    }


def build_record(
    *,
    obs_before: np.ndarray,
    obs_after: np.ndarray,
    action: int,
    reward: float,
    info: dict[str, Any],
    terminated: bool,
    truncated: bool,
) -> dict[str, Any]:
    """Một dòng cho bảng nhật ký / biểu đồ.

    Các trường mô tả **bối cảnh quyết định** (giai đoạn, nhiệt độ, mưa dự báo,
    lần tưới trước) lấy từ observation TRƯỚC khi bấm nút — đúng thứ agent nhìn
    thấy. Độ ẩm và điểm lấy sau bước, vì đó là kết quả cuối ngày.
    """
    before = decode_observation(obs_before)
    after = decode_observation(obs_after)
    components = info.get("reward_components", {})
    balance = info.get("water_balance", {})
    return {
        "day": int(info["day"]),
        "crop": before["crop"],
        "stage": before["stage"],
        "moisture": _round(after["moisture"]),
        "previousMoisture": _round(before["moisture"]),
        "temperature": _round(before["temperature"]),
        "rainProbability": _round(before["rainProbability"]),
        "rainForecastMm": _round(before["rainForecastMm"]),
        "lastIrrigation": _round(before["lastIrrigation"]),
        "action": int(action),
        "waterLiters": _round(info["water_used_liters"]),
        "actualRainMm": _round(info["actual_rain_mm"]),
        "reward": _round(reward),
        "rewardParts": {key: _round(value) for key, value in components.items()},
        "isIdeal": bool(info["is_ideal"]),
        "isStressed": bool(info["is_stressed"]),
        "terminated": bool(terminated),
        "truncated": bool(truncated),
        "waterBalance": {key: _round(value) for key, value in balance.items()},
    }


def open_environment(
    *,
    scenario: str,
    seed: int,
    crop: int,
    config: dict[str, Any],
    initial: dict[str, Any] | None = None,
    weather: list[dict[str, Any]] | None = None,
) -> tuple[AgriWaterEnv, np.ndarray]:
    """Tạo môi trường đã reset, sẵn sàng nhận `step()`."""
    max_days = int(config["max_days"])
    if weather is None:
        weather = resolve_weather(scenario, max_days + 1, seed + 1)
    options = dict(initial or {})
    conditions = {
        key: options.pop(key)
        for key in ("temperature", "rain_probability", "rain_forecast_mm", "actual_rain_mm")
        if key in options
    }
    if conditions and weather:
        weather = [{**weather[0], **conditions}, *weather[1:]]
    env = AgriWaterEnv(scenario=scenario, max_days=max_days, config=config)
    obs, _ = env.reset(seed=seed, options={**options, "weather": weather, "crop_type": crop})
    return env, obs


def build_payload(
    *,
    series: list[dict[str, Any]],
    config: dict[str, Any],
    scenario: str,
    seed: int,
    crop: int,
    policy: str,
    config_source: str,
    kind: str = "episode",
    default_day: int | None = None,
) -> dict[str, Any]:
    """Payload cuối cùng mà client đọc (giống nhau cho file JSON và API)."""
    max_days = int(config["max_days"])
    if default_day is None:
        # Nửa ván: đủ chỗ để tua tới/lui khi mở app.
        default_day = min(len(series), max(1, (len(series) + 1) // 2))
    return {
        "schema": SCHEMA,
        "source": {
            "kind": kind,
            "scenario": scenario,
            "seed": seed,
            "crop": crop,
            "policy": policy,
            "config": config_source,
            "days": len(series),
            "maxDays": max_days,
        },
        "meta": build_meta(config),
        "series": list(series),
        "day": max(1, min(int(default_day), max(1, len(series)))),
        "scenario": scenario,
        "seed": seed,
        "crop": crop,
    }
