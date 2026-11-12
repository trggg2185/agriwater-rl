"""Environment contracts available before simulation implementation."""

import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from agriwater.environment.agriwater_env import AgriWaterEnv


def test_spaces() -> None:
    env = AgriWaterEnv()
    assert env.observation_space.shape == (7,)
    assert env.observation_space.dtype == np.float32
    assert np.all(env.observation_space.low == 0)
    assert np.all(env.observation_space.high == 1)
    assert env.action_space.n == 6


@pytest.mark.parametrize("days", [0, -1, True, 1.5])
def test_invalid_duration(days: object) -> None:
    with pytest.raises(ValueError):
        AgriWaterEnv(max_days=days)


def test_invalid_scenario() -> None:
    with pytest.raises(ValueError):
        AgriWaterEnv(scenario="unknown")


@pytest.mark.skip(reason="Truong must implement reset and step before Gymnasium validation")
def test_gymnasium_contract() -> None:
    check_env(AgriWaterEnv(), skip_render_check=True)
