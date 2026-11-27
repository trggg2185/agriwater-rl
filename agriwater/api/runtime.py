"""Phần dùng chung của API và script xuất episode cho cảnh 3D.

Một chỗ duy nhất quyết định: lấy số vật lý ở đâu, sinh thời tiết thế nào, giải
mã vector 7 chiều ra sao, và một bản ghi ngày gồm những trường gì. Nhờ vậy file
JSON mà `web3d/scripts/export_episode.py` ghi ra và phản hồi của `/api/step`
luôn cùng một định dạng — đổi một chỗ là cả hai đổi theo.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np

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

#: Luật baseline v0.1 trong docs/DESIGN_CONTRACT.md — dùng để tạo ván mẫu khi
#: chưa có agent thật. Không phải hành vi của agent nào đang chạy.
BASELINE_THRESHOLD = 0.30
BASELINE_ACTION = 4

SCENARIOS = ("dry", "stormy", "random")


def baseline_action(observation: np.ndarray) -> int:
    """Chọn mức tưới của baseline theo độ ẩm trước bước mô phỏng."""
    return BASELINE_ACTION if decode_observation(observation)["moisture"] < BASELINE_THRESHOLD else 0


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
        for key in ("temperature", "rain_probability", "rain_forecast_mm")
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
