"""Shared configuration loader: names, paths, YAML safety and error cases."""

from pathlib import Path

import pytest

import agriwater.config as config_module
from agriwater.config import load_config

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("name", ["environment", "scenarios", "training"])
def test_loads_each_allowed_config(name: str) -> None:
    config = load_config(name)
    assert isinstance(config, dict)
    assert config


def test_path_is_independent_of_current_working_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    assert load_config("environment")["max_days"] == 30


@pytest.mark.parametrize(
    "name",
    ["unknown", "", "../environment", "environment.yaml", "ENVIRONMENT", None, 42, ["environment"]],
)
def test_rejects_unknown_name(name: object) -> None:
    with pytest.raises(ValueError, match="unknown configuration name"):
        load_config(name)  # type: ignore[arg-type]


def test_reports_missing_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(config_module, "_CONFIG_DIR", tmp_path)
    with pytest.raises(FileNotFoundError, match="environment.yaml"):
        load_config("environment")


def test_reports_malformed_yaml(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    (tmp_path / "environment.yaml").write_text("reward: [unclosed\n", encoding="utf-8")
    monkeypatch.setattr(config_module, "_CONFIG_DIR", tmp_path)
    with pytest.raises(ValueError, match="invalid YAML"):
        load_config("environment")


@pytest.mark.parametrize("text", ["", "  \n", "- one\n- two\n", "just a string\n", "42\n"])
def test_rejects_non_mapping_yaml(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, text: str
) -> None:
    (tmp_path / "environment.yaml").write_text(text, encoding="utf-8")
    monkeypatch.setattr(config_module, "_CONFIG_DIR", tmp_path)
    with pytest.raises(ValueError, match="top-level mapping"):
        load_config("environment")


def test_preserves_null_values_instead_of_zero() -> None:
    config = load_config("environment")
    assert config["water_balance"]["plot_area_m2"] is None
    assert config["water_balance"]["soil_capacity_liters"] is None
    assert config["growth_stage_days"] is None
    assert config["biological_termination"] is None


def test_returns_a_fresh_mapping_per_call() -> None:
    first = load_config("environment")
    first["max_days"] = 999
    first["reward"]["health"] = 0
    second = load_config("environment")
    assert second["max_days"] == 30
    assert second["reward"]["health"] == 10 == 10


def test_reads_the_tracked_repository_file() -> None:
    config = load_config("environment")
    assert config["action_liters"] == [0, 5, 10, 15, 20, 25]
    assert config["moisture"]["ideal_stage_2"] == [0.5, 0.75]
    assert (ROOT / "configs" / "environment.yaml").is_file()
