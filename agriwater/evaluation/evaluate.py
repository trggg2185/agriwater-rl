"""Evaluation interface for policies sharing the same daily weather."""

from typing import Any

from agriwater.agents.base_agent import BaseAgent
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.weather import WeatherDay


def evaluate(
    agent: BaseAgent, env: AgriWaterEnv, weather: list[WeatherDay]
) -> list[dict[str, Any]]:
    """Evaluate with training=False and replay the supplied immutable weather data."""
    raise NotImplementedError("Evaluation and weather injection into reset are pending")


def main() -> None:
    """Report bootstrap status instead of creating fictitious metrics."""
    raise SystemExit("Bootstrap only: evaluation is not implemented; see docs/TASKS.md")


if __name__ == "__main__":
    main()
