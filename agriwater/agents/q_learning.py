"""Tabular Q-learning interface; no learning algorithm is implemented."""

import numpy as np

from agriwater.agents.base_agent import BaseAgent


class QLearningAgent(BaseAgent):
    """Future tabular policy with agreed state discretization."""

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Choose an action; training controls future exploration."""
        raise NotImplementedError("Q-learning is not implemented")
