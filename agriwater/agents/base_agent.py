"""Common action selection API for every policy."""

from abc import ABC, abstractmethod

import numpy as np


class BaseAgent(ABC):
    """A fixed policy need not expose training or persistence methods."""

    @abstractmethod
    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Return an action index from 0 through 5, not water liters."""
        raise NotImplementedError
