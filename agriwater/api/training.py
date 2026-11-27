"""Run the existing RL trainers in a background worker for the local dashboard."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock, Thread
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agriwater.api import runtime
from agriwater.config import load_config

router = APIRouter(prefix="/api/training", tags=["training"])
_LOG = logging.getLogger(__name__)
_LOCK = Lock()


class TrainingRequest(BaseModel):
    algorithm: Literal["q_learning", "dqn"]
    scenario: Literal["dry", "stormy", "random", "mixed"] = "mixed"
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    total_timesteps: int = Field(ge=1, le=450000)
    learning_rate: float = Field(gt=0, le=1)
    gamma: float = Field(default=0.99, ge=0, lt=1)
    epsilon_start: float = Field(default=1, ge=0, le=1)


@dataclass
class TrainingJob:
    request: TrainingRequest
    id: str = field(default_factory=lambda: uuid4().hex)
    status: str = "running"
    series: list[dict[str, Any]] = field(default_factory=list)
    steps: int = 0
    error: str | None = None

    def record(self, episode: dict[str, Any]) -> None:
        with _LOCK:
            self.steps += episode["steps"]
            self.series.append(
                {
                    "day": episode["episode"],
                    "reward": episode.get("reward", episode.get("total_reward")),
                    "loss": episode.get("loss", episode.get("mean_loss")),
                }
            )

    def payload(self, *, after: int = 0) -> dict[str, Any]:
        return {
            "id": self.id,
            "algorithm": self.request.algorithm,
            "scenario": self.request.scenario,
            "seed": self.request.seed,
            "targetTimesteps": self.request.total_timesteps,
            "completedEpisodes": len(self.series),
            "timesteps": self.steps,
            "status": self.status,
            "series": self.series[after : after + 2000],
            "error": self.error,
        }


_JOBS: dict[str, TrainingJob] = {}


def _train(job: TrainingJob, checkpoint: Path) -> None:
    request = job.request
    config = load_config("training")[request.algorithm]
    epsilon_end = min(request.epsilon_start, config["epsilon_end"])
    if request.algorithm == "q_learning":
        from agriwater.training.q_learning import train_q_learning

        train_q_learning(
            scenario=request.scenario,
            total_timesteps=request.total_timesteps,
            alpha=request.learning_rate,
            gamma=request.gamma,
            epsilon_start=request.epsilon_start,
            epsilon_end=epsilon_end,
            epsilon_decay=config["epsilon_decay"],
            seed=request.seed,
            model_out=checkpoint,
            log_out=None,
            plot_out=None,
            verbose=False,
            on_episode=job.record,
        )
        return

    import torch

    from agriwater.agents.dqn import DQNAgent
    from agriwater.environment.agriwater_env import AgriWaterEnv
    from agriwater.training.train import MIXED_SCENARIOS, train

    torch.set_num_threads(1)
    agent = DQNAgent(
        {
            **config,
            "device": "cpu",
            "learning_rate": request.learning_rate,
            "gamma": request.gamma,
            "epsilon_start": request.epsilon_start,
            "epsilon_end": epsilon_end,
        },
        seed=request.seed,
    )
    scenarios = MIXED_SCENARIOS if request.scenario == "mixed" else (request.scenario,)
    env = AgriWaterEnv(scenario=scenarios[0])
    try:
        train(
            agent,
            env,
            total_timesteps=request.total_timesteps,
            seed=request.seed,
            scenarios=scenarios,
            randomize_crop=True,
            checkpoint_path=checkpoint,
            eval_episodes=3,
            on_episode=job.record,
        )
    finally:
        env.close()


def _run(job: TrainingJob) -> None:
    try:
        target = runtime.model_path(job.request.algorithm)
        target.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=target.parent) as directory:
            candidate = Path(directory) / target.name
            _train(job, candidate)
            candidate.replace(target)
    except Exception:
        _LOG.exception("Training job %s failed", job.id)
        with _LOCK:
            job.status = "failed"
            job.error = "Huấn luyện thất bại. Xem nhật ký API để biết chi tiết."
    else:
        with _LOCK:
            job.status = "completed"


@router.post("", status_code=202)
def start_training(payload: TrainingRequest) -> dict[str, Any]:
    with _LOCK:
        if any(job.status == "running" for job in _JOBS.values()):
            raise HTTPException(status_code=409, detail="API đang chạy một lượt huấn luyện khác.")
        if len(_JOBS) >= 10:
            _JOBS.pop(next(iter(_JOBS)))
        job = TrainingJob(payload)
        _JOBS[job.id] = job
        Thread(target=_run, args=(job,), name=f"training-{job.id}", daemon=True).start()
        return job.payload()


@router.get("/{job_id}")
def training_status(job_id: str, after: int = 0) -> dict[str, Any]:
    if after < 0:
        raise HTTPException(status_code=422, detail="Số episode đã đọc phải từ 0 trở lên.")
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy lượt huấn luyện.")
        return job.payload(after=after)
