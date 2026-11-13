"""Demo interface for Minh; no action-selection or simulation loop yet."""


def run_episode(scenario: str = "random", seed: int = 42, action: int | None = None) -> list[dict]:
    """TODO Minh: run fixed/random actions and return daily records, without learning."""
    raise NotImplementedError("Minh: implement the environment demo after integration")


def main() -> None:
    """Explain that the demonstration is still assigned work."""
    raise SystemExit("Demo not implemented yet; see docs/TASKS.md")


if __name__ == "__main__":
    main()
