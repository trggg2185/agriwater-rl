"""Shared YAML configuration loading for every component."""

from pathlib import Path
from typing import Any

import yaml

_CONFIG_DIR = Path(__file__).resolve().parents[1] / "configs"
_ALLOWED_NAMES = frozenset({"environment", "scenarios", "training"})


def load_config(name: str) -> dict[str, Any]:
    """Load ``configs/<name>.yaml`` relative to the repository root.

    Only the agreed configuration names are accepted. The file must exist and
    contain a top-level mapping; ``null`` values are preserved as ``None`` so
    consumers can decide which sections they require.
    """
    if not isinstance(name, str) or name not in _ALLOWED_NAMES:
        allowed = ", ".join(sorted(_ALLOWED_NAMES))
        raise ValueError(f"unknown configuration name {name!r}; expected one of: {allowed}")

    path = _CONFIG_DIR / f"{name}.yaml"
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"configuration file not found: {path}") from exc
    except OSError as exc:
        raise OSError(f"cannot read configuration file {path}: {exc}") from exc

    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ValueError(f"invalid YAML in configuration file {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(
            f"configuration file {path} must contain a top-level mapping, got {type(data).__name__}"
        )
    return data
