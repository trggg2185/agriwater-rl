"""Reward acceptance examples; enabled when Minh implements the reward."""

import numpy as np
import pytest

from agriwater.agents.reward import calculate_reward


@pytest.mark.skip(reason="Minh has not implemented the six reward components yet")
def test_ideal_without_irrigation() -> None:
    state = np.array([0, 0, 0.5, 0.5, 0, 0, 0], dtype=np.float32)
    reward, parts = calculate_reward(state, 0, state.copy())
    assert reward == 10
    assert parts == dict(R_health=10, R_stress=0, R_water=0, R_waste=0, R_rain=0, R_delay=0)
