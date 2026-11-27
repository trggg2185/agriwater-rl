"""Lightweight HTTP API serving real AgriWaterEnv + DQNAgent episodes to web3d."""

from copy import deepcopy
from pathlib import Path
from typing import Any

import numpy as np
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from agriwater.config import load_config
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.weather import generate_weather

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_MODEL = _REPO_ROOT / "models" / "dqn_best.pt"
_STAGE_NAMES = ["Cây con", "Sinh trưởng", "Ra hoa", "Chín"]
_CROPS = [
    {"code": 0, "key": "maize", "label": "Ngô", "icon": "crop-maize"},
    {"code": 1, "key": "rice", "label": "Lúa", "icon": "crop-rice"},
]
_SCENARIO_LABELS = {"dry": "Khô hạn", "stormy": "Mưa nhiều", "random": "Ngẫu nhiên"}

_cached_agent: tuple[Path, int, Any] | None = None


def _resolve_model(model_path: str | Path | None = None) -> Path:
    if model_path is None:
        return _DEFAULT_MODEL
    path = Path(model_path)
    return path if path.is_absolute() else _REPO_ROOT / path


def _get_dqn_agent(model_path: Path) -> Any:
    global _cached_agent
    if not model_path.is_file():
        raise FileNotFoundError(
            f"DQN checkpoint not found: {model_path}. Run `python -m agriwater.training.train`."
        )
    mtime = model_path.stat().st_mtime_ns
    if _cached_agent is not None and _cached_agent[0] == model_path and _cached_agent[1] == mtime:
        return _cached_agent[2]
    from agriwater.agents.dqn import DQNAgent

    agent = DQNAgent.from_checkpoint(model_path)
    _cached_agent = (model_path, mtime, agent)
    return agent


def build_meta(model_path: str | Path | None = None) -> dict[str, Any]:
    """Return UI metadata synchronized with configs/*.yaml and DQN checkpoint status."""
    env_cfg = load_config("environment")
    scenarios_cfg = load_config("scenarios")
    dqn_ready = _resolve_model(model_path).is_file()
    return {
        "maxDays": int(env_cfg["max_days"]),
        "actionLiters": [int(x) for x in env_cfg["action_liters"]],
        "moisture": {
            "idealDefault": [float(x) for x in env_cfg["moisture"]["ideal_default"]],
            "idealStage2": [float(x) for x in env_cfg["moisture"]["ideal_stage_2"]],
            "stressBounds": [float(x) for x in env_cfg["moisture"]["stress_bounds"]],
        },
        "growthStageDays": [int(x) for x in env_cfg["growth_stage_days"]],
        "stages": list(_STAGE_NAMES),
        "crops": deepcopy(_CROPS),
        "scenarios": [
            {"key": key, "label": _SCENARIO_LABELS.get(key, key)}
            for key in ("dry", "stormy", "random")
            if key in scenarios_cfg
        ],
        "agents": [
            {
                "key": "dqn",
                "label": "DQN (Deep Q-Network)",
                "available": dqn_ready,
                **({} if dqn_ready else {"reason": "chưa huấn luyện checkpoint"}),
            },
            {"key": "random", "label": "Ngẫu nhiên (demo)", "available": True},
            {"key": "fixed", "label": "Cố định 10 L", "available": True},
            {
                "key": "baseline",
                "label": "Baseline",
                "available": False,
                "reason": "chưa triển khai",
            },
            {
                "key": "q_learning",
                "label": "Q-Learning",
                "available": False,
                "reason": "chưa triển khai",
            },
        ],
        "stepLabel": "1 step = 1 ngày",
        "isIllustrative": False,
    }


def build_session(
    *,
    scenario: str = "dry",
    seed: int = 42,
    crop: int = 0,
    agent: str = "dqn",
    fixed_action: int = 2,
    model_path: str | Path | None = None,
) -> dict[str, Any]:
    """Run one real AgriWaterEnv episode and return records formatted for web3d."""
    if scenario not in _SCENARIO_LABELS:
        raise ValueError("scenario must be dry, stormy or random")
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a non-negative integer")
    if isinstance(crop, bool) or not isinstance(crop, int) or not 0 <= crop <= 3:
        raise ValueError("crop must be an integer 0..3")
    if agent not in {"dqn", "random", "fixed"}:
        raise ValueError("agent must be dqn, random or fixed")
    if (
        isinstance(fixed_action, bool)
        or not isinstance(fixed_action, int)
        or not 0 <= fixed_action <= 5
    ):
        raise ValueError("fixed_action must be an integer 0..5")

    dqn_agent = _get_dqn_agent(_resolve_model(model_path)) if agent == "dqn" else None
    action_rng = np.random.default_rng(seed)

    env = AgriWaterEnv(scenario=scenario)
    series: list[dict[str, Any]] = []
    try:
        weather = generate_weather(scenario, env.max_days + 1, seed=seed)
        state, _ = env.reset(seed=seed, options={"crop_type": crop, "weather": weather})
        terminated = truncated = False
        day_index = 0
        while not (terminated or truncated):
            prev_moisture = float(state[2])
            w_day = weather[day_index]
            if dqn_agent is not None:
                chosen = dqn_agent.select_action(state, training=False)
            elif agent == "random":
                chosen = int(action_rng.integers(0, env.action_space.n))
            else:
                chosen = fixed_action

            next_state, reward, terminated, truncated, info = env.step(chosen)
            stage = round(float(next_state[1]) * 3)
            series.append(
                {
                    "day": int(info["day"]),
                    "stage": int(stage),
                    "action": int(chosen),
                    "waterLiters": float(info["water_used_liters"]),
                    "moisture": float(info["soil_moisture"]),
                    "previousMoisture": prev_moisture,
                    "temperature": float(w_day["temperature"]),
                    "rainProbability": float(w_day["rain_probability"]),
                    "rainForecastMm": float(w_day["rain_forecast_mm"]),
                    "actualRainMm": float(info["actual_rain_mm"]),
                    "reward": float(reward),
                    "rewardParts": {k: float(v) for k, v in info["reward_components"].items()},
                    "isIdeal": bool(info["is_ideal"]),
                    "isStressed": bool(info["is_stressed"]),
                    "terminated": bool(terminated),
                    "truncated": bool(truncated),
                }
            )
            state = next_state
            day_index += 1
    finally:
        env.close()

    return {
        "meta": build_meta(model_path),
        "series": series,
        "day": 1,
        "scenario": scenario,
        "seed": seed,
        "crop": crop,
        "agent": agent,
    }


async def _handle_meta(_request: Request) -> JSONResponse:
    return JSONResponse(build_meta())


async def _handle_session(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise ValueError("Request body must be a JSON object")
        payload = build_session(
            scenario=str(body.get("scenario", "dry")),
            seed=int(body.get("seed", 42)),
            crop=int(body.get("crop", 0)),
            agent=str(body.get("agent", "dqn")),
            fixed_action=int(body.get("fixedAction", 2)),
        )
    except (ValueError, TypeError, FileNotFoundError) as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return JSONResponse(payload)


def create_app() -> Starlette:
    app = Starlette(
        routes=[
            Route("/api/meta", _handle_meta, methods=["GET"]),
            Route("/api/session", _handle_session, methods=["POST"]),
        ]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    return app


app = create_app()


def main() -> None:
    """Start the local backend server for web3d on http://127.0.0.1:8000."""
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
