"""DQN interface; network, replay and learning are pending."""

import numpy as np

from agriwater.agents.base_agent import BaseAgent


class DQNAgent(BaseAgent):
    """Future CPU-based deep Q-network policy."""

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Choose an action; training controls future exploration."""
        raise NotImplementedError("DQN is not implemented")
