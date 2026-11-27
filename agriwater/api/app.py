"""Máy chủ HTTP cho dashboard 2D: mỗi ngày mô phỏng do Python tính, không phải JS.

Chạy từ thư mục gốc repo:

    .venv/bin/uvicorn agriwater.api.app:app --reload --port 8000

Endpoint mô phỏng:

    GET  /api/health    kiểm tra sống chết — client dùng để biết có backend không
    GET  /api/meta      ngưỡng, 6 mức nước, mốc giai đoạn, nguồn số vật lý
    POST /api/session   {scenario, seed, crop, initial_action?, start_day?} → một ván mới
    POST /api/step      {session_id, action} → chạy đúng MỘT ngày
    POST /api/weather   {session_id, day, mode} → chỉnh thời tiết các bước chưa chạy

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
from agriwater.environment.weather import WeatherDay

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


WeatherMode = Literal["sun", "rain", "storm", "random"]
WEATHER_PRESETS: dict[str, WeatherDay] = {
    "sun": dict(temperature=36, rain_probability=0, rain_forecast_mm=0, actual_rain_mm=0),
    "rain": dict(temperature=28, rain_probability=.65, rain_forecast_mm=4, actual_rain_mm=3),
    "storm": dict(temperature=25, rain_probability=.95, rain_forecast_mm=25, actual_rain_mm=22),
}


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
    weather_mode: WeatherMode | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


_SESSIONS: dict[str, Session] = {}
_SESSIONS_LOCK = threading.Lock()


class InitialState(BaseModel):
    growth_stage: int = Field(ge=0, le=3)
    soil_moisture: float = Field(ge=0, le=1)
    temperature: float | None = Field(default=None, ge=15, le=45)
    rain_probability: float | None = Field(default=None, ge=0, le=1)
    rain_forecast_mm: float | None = Field(default=None, ge=0, le=50)
    actual_rain_mm: float | None = Field(default=None, ge=0, le=50)
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
    #: Ngày đầu tiên trôi qua ngay khi mở ván, để giao diện luôn có dữ liệu để vẽ.
    initial_action: int | None = Field(default=None, ge=0, le=5)
    start_day: int = Field(default=1, ge=1)
    initial_state: InitialState | None = None
    weather: list[WeatherRecord] | None = None


class StepRequest(BaseModel):
    session_id: str = Field(min_length=1)
    action: int = Field(ge=0, le=5)
    automatic: bool = False


class WeatherRequest(BaseModel):
    session_id: str = Field(min_length=1)
    day: int = Field(ge=1)
    mode: WeatherMode


def _upcoming_weather(session: Session) -> dict[str, Any] | None:
    if session.done or session.weather_mode is None:
        return None
    weather = session.env.upcoming_weather()
    return {
        "day": session.env.day + 1,
        "mode": session.weather_mode,
        "temperature": weather["temperature"],
        "rainProbability": weather["rain_probability"],
        "rainForecastMm": weather["rain_forecast_mm"],
        "actualRainMm": weather["actual_rain_mm"],
    }


def _payload(session: Session) -> dict[str, Any]:
    body = runtime.build_payload(
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
    if session.weather_mode is not None:
        body["upcomingWeather"] = _upcoming_weather(session)
    return body


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
    )
    if payload.initial_action is not None:
        action = payload.initial_action
    else:
        action = runtime.baseline_action(session.obs) if payload.start_day > 1 else 0
    _step(session, action)
    while len(session.series) < payload.start_day and not session.done:
        _step(session, runtime.baseline_action(session.obs))

    session_id = uuid.uuid4().hex
    with _SESSIONS_LOCK:
        _SESSIONS[session_id] = session
    return {"session_id": session_id, **_payload(session)}


@app.post("/api/step")
def step(payload: StepRequest) -> dict[str, Any]:
    """Chạy một ngày với mức tưới chỉ định hoặc theo chính sách baseline."""
    session = _lookup(payload.session_id)
    with session.lock:
        action = runtime.baseline_action(session.obs) if payload.automatic else payload.action
        _step(session, action)
        body = _payload(session)
    return {"session_id": payload.session_id, **body}



@app.post("/api/weather")
def change_weather(payload: WeatherRequest) -> dict[str, Any]:
    """Đổi thời tiết từ bước kế tiếp, giữ nguyên các bước đã ghi."""
    session = _lookup(payload.session_id)
    with session.lock:
        if session.done or payload.day != session.env.day + 1:
            raise HTTPException(status_code=409, detail="Ngày cần đổi thời tiết đã qua hoặc vụ đã kết thúc")
        count = session.env.max_days - session.env.day + 1
        weather = (
            runtime.resolve_weather("random", count, session.seed + payload.day)
            if payload.mode == "random"
            else [WEATHER_PRESETS[payload.mode]] * count
        )
        session.obs = session.env.replace_upcoming_weather(weather)
        session.weather_mode = payload.mode
        return {"upcomingWeather": _upcoming_weather(session)}
