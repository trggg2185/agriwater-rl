"""Shared configuration interface; agree validation rules before implementation."""

from typing import Any


def load_config(name: str) -> dict[str, Any]:
    """TODO shared: load project YAML safely and validate required parameters."""
    raise NotImplementedError("Agree configuration loading and validation before implementation")
