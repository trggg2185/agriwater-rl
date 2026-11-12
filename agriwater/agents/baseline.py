"""Fixed-rule baseline interface; rules are pending."""

import numpy as np

from agriwater.agents.base_agent import BaseAgent


class BaselineAgent(BaseAgent):
    """Non-learning irrigation policy."""

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Choose an action using agreed moisture and weather rules."""
        raise NotImplementedError("Baseline rules are not implemented")
