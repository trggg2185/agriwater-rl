"""Training entry point; shared learning protocol must be agreed first."""

from pathlib import Path

from agriwater.agents.base_agent import BaseAgent
from agriwater.environment.agriwater_env import AgriWaterEnv


def train(agent: BaseAgent, env: AgriWaterEnv, config_path: Path) -> None:
    """Train using a future common learning API, never private agent fields."""
    raise NotImplementedError("Training and the common learning protocol are pending")


def main() -> None:
    """Report bootstrap status instead of pretending to train."""
    raise SystemExit("Bootstrap only: training is not implemented; see docs/TASKS.md")


if __name__ == "__main__":
    main()
