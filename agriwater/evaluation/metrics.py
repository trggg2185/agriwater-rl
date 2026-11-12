"""Metrics interface; aggregation conventions are documented for review."""

from collections.abc import Sequence
from typing import Any


def calculate_metrics(transitions: Sequence[dict[str, Any]]) -> dict[str, float]:
    """Aggregate water, reward, ideal days and stressed days from daily records."""
    raise NotImplementedError("Evaluation metrics are not implemented")
