"""Single reward entry point; see docs/DESIGN_CONTRACT.md for all six terms."""

import numpy as np


def calculate_reward(
    state: np.ndarray, action: int, next_state: np.ndarray
) -> tuple[float, dict[str, float]]:
    """Return total and R_health/R_stress/R_water/R_waste/R_rain/R_delay."""
    raise NotImplementedError("Reward implementation is assigned to Minh")
