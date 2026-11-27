"""Unit tests for the Web3D HTTP API serving real AgriWaterEnv + DQNAgent rollouts."""

from pathlib import Path

import pytest

from agriwater.agents.dqn import DQNAgent
from agriwater.dashboard.api import build_meta, build_session


def _save_tiny_checkpoint(path: Path) -> Path:
    agent = DQNAgent(
        {
            "gamma": 0.99,
            "learning_rate": 0.001,
            "epsilon_start": 1.0,
            "epsilon_end": 0.05,
            "epsilon_decay": 0.99,
            "batch_size": 4,
            "replay_buffer_size": 16,
            "target_update_steps": 4,
            "hidden_sizes": [16],
            "device": "cpu",
        },
        seed=42,
    )
    return agent.save(path)


def test_build_meta_reflects_checkpoint_availability(tmp_path: Path) -> None:
    missing = build_meta(tmp_path / "missing.pt")
    dqn_missing = next(a for a in missing["agents"] if a["key"] == "dqn")
    assert dqn_missing["available"] is False

    ckpt = _save_tiny_checkpoint(tmp_path / "dqn.pt")
    present = build_meta(ckpt)
    dqn_present = next(a for a in present["agents"] if a["key"] == "dqn")
    assert dqn_present["available"] is True
    assert present["actionLiters"] == [0, 5, 10, 15, 20, 25]


def test_build_session_runs_real_dqn_random_and_fixed(tmp_path: Path) -> None:
    ckpt = _save_tiny_checkpoint(tmp_path / "dqn.pt")
    for agent_key in ("dqn", "random", "fixed"):
        session = build_session(
            scenario="dry",
            seed=42,
            crop=0,
            agent=agent_key,
            model_path=ckpt,
        )
        assert session["agent"] == agent_key
        assert 1 <= len(session["series"]) <= 30
        first = session["series"][0]
        assert set(first["rewardParts"]) == {
            "R_health",
            "R_stress",
            "R_water",
            "R_waste",
            "R_rain",
            "R_delay",
        }
        assert first["day"] == 1
        assert 0 <= first["action"] <= 5
        assert first["waterLiters"] == first["action"] * 5


def test_build_session_rejects_invalid_arguments(tmp_path: Path) -> None:
    ckpt = _save_tiny_checkpoint(tmp_path / "dqn.pt")
    with pytest.raises(ValueError, match="scenario"):
        build_session(scenario="invalid", model_path=ckpt)
    with pytest.raises(ValueError, match="agent"):
        build_session(agent="unknown", model_path=ckpt)
    with pytest.raises(ValueError, match="crop"):
        build_session(crop=9, model_path=ckpt)
    with pytest.raises(FileNotFoundError):
        build_session(agent="dqn", model_path=tmp_path / "absent.pt")
