"""Non-learning demo: determinism, stopping, CSV export and CLI summary."""

import csv
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from gymnasium import spaces

import agriwater.environment.demo as demo_module
from agriwater.environment.demo import (
    RECORD_COLUMNS,
    main,
    run_episode,
    write_csv,
)

REWARD_KEYS = RECORD_COLUMNS[-6:]


def install_fake_env(
    monkeypatch: pytest.MonkeyPatch,
    *,
    terminate_after: int = 99,
    truncate_after: int | None = None,
    error_at: int | None = None,
    components_override: dict[str, float] | None = None,
) -> list[Any]:
    """Patch the demo environment with a deterministic fake and return instances."""
    instances: list[Any] = []

    class FakeEnv:
        def __init__(self, scenario: str = "random", max_days: int = 30) -> None:
            self.scenario = scenario
            self.max_days = max_days
            self.action_space = spaces.Discrete(6)
            self.closed = False
            self.seed: int | None = None
            self.steps = 0
            instances.append(self)

        def reset(
            self, *, seed: int | None = None, options: dict | None = None
        ) -> tuple[np.ndarray, dict[str, Any]]:
            self.seed = seed
            self.steps = 0
            return np.zeros(7, dtype=np.float32), {"day": 0}

        def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
            if error_at is not None and self.steps + 1 == error_at:
                raise RuntimeError("simulated failure")
            self.steps += 1
            reward = -2.0 * action
            components = {key: 0.0 for key in REWARD_KEYS}
            components["R_water"] = -2.0 * action
            if components_override is not None:
                components = components_override
            info = {
                "day": self.steps,
                "water_used_liters": 5.0 * action,
                "actual_rain_mm": 1.5,
                "soil_moisture": 0.5,
                "is_ideal": True,
                "is_stressed": False,
                "reward_components": components,
            }
            terminated = self.steps >= terminate_after
            truncated = truncate_after is not None and self.steps >= truncate_after
            return np.zeros(7, dtype=np.float32), reward, terminated, truncated, info

        def close(self) -> None:
            self.closed = True

    monkeypatch.setattr(demo_module, "AgriWaterEnv", FakeEnv)
    return instances


def test_same_seed_produces_identical_records(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_env(monkeypatch, terminate_after=4)
    first = run_episode("random", seed=11)
    second = run_episode("random", seed=11)
    assert first == second


def test_random_actions_follow_the_dedicated_rng(monkeypatch: pytest.MonkeyPatch) -> None:
    instances = install_fake_env(monkeypatch, terminate_after=5)
    records = run_episode("dry", seed=7)
    expected = np.random.default_rng(7).integers(0, 6, size=5).tolist()
    assert [record["action"] for record in records] == expected
    assert instances[0].seed == 7
    assert instances[0].scenario == "dry"


def test_fixed_action_keeps_the_same_water_level(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_env(monkeypatch, terminate_after=4)
    records = run_episode("stormy", seed=3, action=4)
    assert {record["action"] for record in records} == {4}
    assert {record["water_used_liters"] for record in records} == {20.0}


def test_stops_when_terminated(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_env(monkeypatch, terminate_after=2)
    records = run_episode("random", seed=1, action=0)
    assert len(records) == 2
    assert records[-1]["terminated"] is True
    assert records[-1]["truncated"] is False


def test_stops_when_truncated(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_env(monkeypatch, truncate_after=2)
    records = run_episode("random", seed=1, action=0)
    assert len(records) == 2
    assert records[-1]["truncated"] is True
    assert records[-1]["terminated"] is False


def test_closes_environment_even_when_step_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    instances = install_fake_env(monkeypatch, error_at=2)
    with pytest.raises(RuntimeError, match="simulated failure"):
        run_episode("random", seed=1, action=1)
    assert instances[0].closed is True


def test_records_have_the_documented_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_env(monkeypatch, terminate_after=2)
    records = run_episode("random", seed=5, action=2)
    assert set(records[0]) == set(RECORD_COLUMNS)
    assert isinstance(records[0]["day"], int)
    assert isinstance(records[0]["action"], int)
    assert isinstance(records[0]["reward"], float)
    assert isinstance(records[0]["is_ideal"], bool)
    assert all(isinstance(records[0][key], float) for key in REWARD_KEYS)


def test_missing_reward_component_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_env(
        monkeypatch,
        terminate_after=1,
        components_override={"R_health": 10.0},
    )
    with pytest.raises(KeyError, match="R_stress"):
        run_episode("random", seed=1, action=0)


@pytest.mark.parametrize("action", [-1, 6, True, 1.5, "1"])
def test_rejects_invalid_fixed_action(monkeypatch: pytest.MonkeyPatch, action: object) -> None:
    install_fake_env(monkeypatch, terminate_after=1)
    with pytest.raises((TypeError, ValueError), match="action"):
        run_episode("random", seed=1, action=action)  # type: ignore[arg-type]


@pytest.mark.parametrize("seed", [True, 1.5, "42", None])
def test_rejects_invalid_seed(monkeypatch: pytest.MonkeyPatch, seed: object) -> None:
    install_fake_env(monkeypatch, terminate_after=1)
    with pytest.raises(TypeError, match="seed"):
        run_episode("random", seed=seed)  # type: ignore[arg-type]


def test_rejects_unknown_scenario() -> None:
    with pytest.raises(ValueError, match="scenario"):
        run_episode("unknown", seed=1)


def test_write_csv_schema_and_values(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    install_fake_env(monkeypatch, terminate_after=2)
    records = run_episode("random", seed=9, action=2)
    path = write_csv(records, tmp_path / "demo.csv")

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
    assert reader.fieldnames == RECORD_COLUMNS
    assert len(rows) == 2
    assert rows[0]["action"] == "2"
    assert rows[0]["water_used_liters"] == "10.0"
    assert rows[1]["terminated"] == "True"


def test_write_csv_refuses_to_overwrite_without_force(tmp_path: Path) -> None:
    path = tmp_path / "demo.csv"
    path.write_text("keep me", encoding="utf-8")
    with pytest.raises(FileExistsError, match="--force"):
        write_csv([], path)
    assert path.read_text(encoding="utf-8") == "keep me"


def test_write_csv_overwrites_with_force(tmp_path: Path) -> None:
    path = tmp_path / "demo.csv"
    path.write_text("old", encoding="utf-8")
    write_csv([], path, force=True)
    assert path.read_text(encoding="utf-8").startswith("day,action,")


def test_main_prints_summary(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    install_fake_env(monkeypatch, terminate_after=3)
    main(["--scenario", "dry", "--seed", "7", "--action", "2"])
    output = capsys.readouterr().out
    assert "Demo không học" in output
    assert "Số ngày chạy: 3" in output
    assert "Tổng nước tưới: 30.0 lít" in output
    assert "Tổng reward: -12.0" in output


def test_main_writes_csv(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    install_fake_env(monkeypatch, terminate_after=2)
    path = tmp_path / "out.csv"
    main(["--action", "1", "--output", str(path)])
    assert path.is_file()
    assert "Đã ghi 2 bản ghi" in capsys.readouterr().out


def test_main_reports_existing_csv(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    install_fake_env(monkeypatch, terminate_after=1)
    path = tmp_path / "out.csv"
    path.write_text("old", encoding="utf-8")
    with pytest.raises(SystemExit, match="already exists"):
        main(["--action", "1", "--output", str(path)])


@pytest.mark.parametrize("scenario", ["dry", "stormy", "random"])
def test_real_environment_demo(scenario, tmp_path):
    first = run_episode(scenario, seed=42)
    assert first == run_episode(scenario, seed=42)
    assert 1 <= len(first) <= 30
    assert first[-1]["terminated"] or first[-1]["truncated"]
    for row in first:
        assert row["water_used_liters"] == row["action"] * 5
        assert row["reward"] == sum(row[key] for key in REWARD_KEYS)
        assert 0 <= row["soil_moisture"] <= 1
    path = write_csv(first, tmp_path / "new" / "run.csv")
    with path.open(encoding="utf-8", newline="") as stream:
        assert len(list(csv.DictReader(stream))) == len(first)
