"""Import, configuration and public signature checks."""

import importlib
import inspect
from pathlib import Path

import pytest
import yaml

from agriwater.agents.base_agent import BaseAgent
from agriwater.agents.baseline import BaselineAgent
from agriwater.agents.dqn import DQNAgent
from agriwater.agents.q_learning import QLearningAgent
from agriwater.agents.reward import calculate_reward

ROOT = Path(__file__).resolve().parents[1]


def test_all_modules_import() -> None:
    for path in (ROOT / "agriwater").rglob("*.py"):
        parts = path.relative_to(ROOT).with_suffix("").parts
        importlib.import_module(".".join(parts))


def test_agent_interface() -> None:
    with pytest.raises(TypeError):
        BaseAgent()
    for cls in (BaselineAgent, QLearningAgent, DQNAgent):
        assert issubclass(cls, BaseAgent)
        signature = inspect.signature(cls.select_action)
        assert list(signature.parameters) == ["self", "state", "training"]
        assert signature.parameters["training"].default is False
    assert not hasattr(BaselineAgent, "learn")
    assert list(inspect.signature(calculate_reward).parameters) == [
        "state",
        "action",
        "next_state",
        "config",
    ]


def test_configuration_contract() -> None:
    configs = {}
    for name in ("environment", "training", "scenarios"):
        configs[name] = yaml.safe_load((ROOT / "configs" / f"{name}.yaml").read_text("utf-8"))
        assert isinstance(configs[name], dict)
    env = configs["environment"]
    assert env["max_days"] == 30
    assert env["action_liters"] == [0, 5, 10, 15, 20, 25]
    assert set(configs["scenarios"]) == {"dry", "stormy", "random"}
    assert env["default_scenario"] in configs["scenarios"]
    assert env["moisture"]["ideal_stage_2"] == [0.5, 0.75]
    assert configs["training"]["dqn"]["device"] == "cpu"
