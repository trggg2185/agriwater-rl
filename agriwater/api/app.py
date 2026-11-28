"""Máy chủ HTTP cho dashboard 2D: mỗi ngày mô phỏng do Python tính, không phải JS.

Chạy từ thư mục gốc repo:

    .venv/bin/uvicorn agriwater.api.app:app --reload --port 8000

Ba endpoint (đúng ba việc, không hơn):

    GET  /api/health    kiểm tra sống chết — client dùng để biết có backend không
    GET  /api/meta      ngưỡng, 6 mức nước, mốc giai đoạn, nguồn số vật lý
    POST /api/session   {scenario, seed, crop, initial_action?, start_day?} → một ván mới
    POST /api/step      {session_id, action} → chạy đúng MỘT ngày

Cả `/api/session` và `/api/step` trả về cùng một payload dạng episode
(`agriwater.api.runtime.build_payload`), nên client chỉ cần một hàm chuẩn hoá.

Ghi chú thiết kế:

* Ván sống trong bộ nhớ tiến trình. Khởi động lại server là mất ván — đúng ý
  đồ: đây là môi trường mô phỏng, không phải cơ sở dữ liệu.
* Mỗi session có khóa riêng: hai tab cùng bấm tưới không chen vào một env.
* Không endpoint nào ghi file, không sửa `configs/`, không sửa `agriwater/`.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agriwater.api import runtime
from agriwater.environment.agriwater_env import AgriWaterEnv

#: Cổng dev của Vite. Proxy `/api` đã có trong web3d/vite.config.js; CORS để
#: trường hợp gọi thẳng http://127.0.0.1:8000/api/... từ trang dev.
DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app = FastAPI(title="AgriWater-RL API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@dataclass
class Session:
    """Một ván đang chạy trong bộ nhớ."""

    env: AgriWaterEnv
    config: dict[str, Any]
    config_source: str
    scenario: str
    seed: int
    crop: int
    #: Observation hiện tại (trước bước kế tiếp) — cần để dựng bản ghi ngày.
    obs: np.ndarray
    policy: str = "manual"
    series: list[dict[str, Any]] = field(default_factory=list)
    done: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)


_SESSIONS: dict[str, Session] = {}
_SESSIONS_LOCK = threading.Lock()


class InitialState(BaseModel):
    growth_stage: int = Field(ge=0, le=3)
    soil_moisture: float = Field(ge=0, le=1)
    temperature: float = Field(ge=15, le=45)
    rain_probability: float | None = Field(default=None, ge=0, le=1)
    rain_forecast_mm: float | None = Field(default=None, ge=0, le=50)
    last_irrigation_liters: float | None = Field(default=None, ge=0, le=25)


class WeatherRecord(BaseModel):
    temperature: float = Field(ge=15, le=45)
    rain_probability: float = Field(ge=0, le=1)
    rain_forecast_mm: float = Field(ge=0, le=50)
    actual_rain_mm: float = Field(ge=0, le=50)


class SessionRequest(BaseModel):
    scenario: Literal["dry", "stormy", "random"] = "dry"
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    crop: int = Field(default=0, ge=0, le=3)
    policy: Literal["baseline", "dqn"] = "baseline"
    #: Ngày đầu tiên trôi qua ngay khi mở ván, để giao diện luôn có dữ liệu để vẽ.
    initial_action: int | None = Field(default=None, ge=0, le=5)
    start_day: int = Field(default=1, ge=1)
    initial_state: InitialState | None = None
    weather: list[WeatherRecord] | None = None


class StepRequest(BaseModel):
    session_id: str = Field(min_length=1)
    action: int = Field(ge=0, le=5)
    automatic: bool = False


class TrainDQNRequest(BaseModel):
    scenario: Literal["dry", "stormy", "random", "mixed"] = "mixed"
    episodes: int = Field(default=50, ge=5, le=2000)
    learning_rate: float = Field(default=0.001, gt=0, le=1)
    gamma: float = Field(default=0.99, ge=0, lt=1)
    epsilon_start: float = Field(default=1.0, ge=0, le=1)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)


def _payload(session: Session) -> dict[str, Any]:
    return runtime.build_payload(
        series=session.series,
        config=session.config,
        scenario=session.scenario,
        seed=session.seed,
        crop=session.crop,
        policy=session.policy,
        config_source=session.config_source,
        kind="api",
        # Ván đang chạy: "ngày hiện tại" là ngày cuối cùng đã tính.
        default_day=len(session.series),
    )


def _step(session: Session, action: int) -> None:
    """Chạy một ngày trong session; gọi bên trong `session.lock`."""
    if session.done:
        raise HTTPException(
            status_code=409,
            detail="Ván đã kết thúc (cây chết hoặc hết ngày); tạo session mới",
        )
    obs_before = session.obs
    obs_after, reward, terminated, truncated, info = session.env.step(int(action))
    session.obs = obs_after
    session.series.append(
        runtime.build_record(
            obs_before=obs_before,
            obs_after=obs_after,
            action=int(action),
            reward=reward,
            info=info,
            terminated=terminated,
            truncated=truncated,
        )
    )
    session.done = bool(terminated or truncated)


def _lookup(session_id: str) -> Session:
    with _SESSIONS_LOCK:
        session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    return session


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Client gọi cái này trước để biết có nên dùng chế độ live không."""
    return {"status": "ok", "sessions": len(_SESSIONS)}


@app.get("/api/meta")
def meta() -> dict[str, Any]:
    """Ngưỡng và 6 mức nước, kèm nguồn số vật lý đang dùng."""
    try:
        config, config_source = runtime.resolve_config()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "schema": runtime.SCHEMA,
        "meta": runtime.build_meta(config),
        "source": {"kind": "api", "config": config_source},
        "scenarios": [{"key": key} for key in runtime.SCENARIOS],
    }


@app.post("/api/session")
def create_session(payload: SessionRequest) -> dict[str, Any]:
    """Mở ván mới và mô phỏng tuần tự đến ngày yêu cầu hoặc khi vụ kết thúc."""
    try:
        config, config_source = runtime.resolve_config()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if payload.start_day > int(config["max_days"]):
        raise HTTPException(status_code=422, detail="Ngày bắt đầu vượt quá chu kỳ mô phỏng")
    if payload.policy == "dqn":
        try:
            runtime.load_dqn_agent()
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    try:
        env, obs = runtime.open_environment(
            scenario=payload.scenario,
            seed=payload.seed,
            crop=payload.crop,
            config=config,
            initial=payload.initial_state.model_dump(exclude_none=True) if payload.initial_state else None,
            weather=[day.model_dump() for day in payload.weather] if payload.weather is not None else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    session = Session(
        env=env,
        config=config,
        config_source=config_source,
        scenario=payload.scenario,
        seed=payload.seed,
        crop=payload.crop,
        obs=obs,
        policy=payload.policy,
    )
    if payload.initial_action is not None:
        action = payload.initial_action
    elif payload.policy == "dqn" or payload.start_day > 1:
        action = runtime.policy_action(session.policy, session.obs)
    else:
        action = 0
    _step(session, action)
    while len(session.series) < payload.start_day and not session.done:
        _step(session, runtime.policy_action(session.policy, session.obs))

    session_id = uuid.uuid4().hex
    with _SESSIONS_LOCK:
        _SESSIONS[session_id] = session
    return {"session_id": session_id, **_payload(session)}


@app.post("/api/step")
def step(payload: StepRequest) -> dict[str, Any]:
    """Chạy một ngày với mức tưới chỉ định hoặc theo chính sách tự động của session."""
    session = _lookup(payload.session_id)
    with session.lock:
        if payload.automatic:
            try:
                action = runtime.policy_action(session.policy, session.obs)
            except FileNotFoundError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
        else:
            action = payload.action
        _step(session, action)
        body = _payload(session)
    return {"session_id": payload.session_id, **body}


@app.post("/api/train/dqn")
def train_dqn(payload: TrainDQNRequest) -> dict[str, Any]:
    """Huấn luyện DQNAgent trực tiếp từ giao diện, lưu checkpoint và trả về learning curve."""
    from agriwater.agents.dqn import DQNAgent
    from agriwater.config import load_config
    from agriwater.training.train import train

    dqn_cfg = dict(load_config("training").get("dqn") or {})
    dqn_cfg["learning_rate"] = payload.learning_rate
    dqn_cfg["gamma"] = payload.gamma
    dqn_cfg["epsilon_start"] = payload.epsilon_start
    dqn_cfg["epsilon_end"] = min(float(dqn_cfg.get("epsilon_end", 0.05)), payload.epsilon_start)
    scenarios = runtime.SCENARIOS if payload.scenario == "mixed" else (payload.scenario,)
    agent = DQNAgent(dqn_cfg, seed=payload.seed)
    env = AgriWaterEnv(scenario=scenarios[0])
    try:
        result = train(
            agent,
            env,
            episodes=payload.episodes,
            seed=payload.seed,
            checkpoint_path=runtime.DEFAULT_DQN_MODEL,
            eval_episodes=3,
            eval_every=max(10, payload.episodes // 5),
            scenarios=scenarios,
        )
    finally:
        env.close()
    runtime.clear_dqn_cache()
    series = [
        {
            "day": int(row["episode"]),
            "reward": round(float(row["total_reward"]), 4),
            "loss": round(float(row["mean_loss"]), 6),
        }
        for row in result["history"]
    ]
    return {
        "algorithm": "dqn",
        "episodes": len(series),
        "best_val_reward": result["best_val_reward"],
        "best_episode": result["best_episode"],
        "dqn_available": runtime.dqn_available(),
        "series": series,
    }
