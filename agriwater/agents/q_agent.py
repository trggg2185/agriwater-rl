"""Tabular Q-learning agent and domain-aligned state discretizer for AgriWaterEnv.

State vector (7D, normalized to [0.0, 1.0]):
  0 CROP_TYPE         -> 4 discrete bins {0, 1, 2, 3}
  1 GROWTH_STAGE      -> 2 discrete bins ({0, 1, 3} -> 0, {2} -> 1)
  2 SOIL_MOISTURE     -> 9 bins aligned with stress/ideal/waste/drainage bounds
  3 TEMPERATURE       -> 3 bins (15-25, 25-35, 35-45 C)
  4 RAIN_PROBABILITY  -> 3 bins (<0.35, 0.35-0.70, >=0.70)
  5 RAIN_FORECAST_MM  -> 3 bins (<15, 15-30, >=30 mm)
  6 LAST_IRRIGATION   -> 2 bins (<12.5 L, >=12.5 L)

Total discrete states: 4 * 2 * 9 * 3 * 3 * 3 * 2 = 3,888
Q-table entries:       3,888 * 6 = 23,328 float64 values
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from agriwater.agents.base_agent import BaseAgent
from agriwater.environment.observation import (
    CROP_TYPE,
    GROWTH_STAGE,
    LAST_IRRIGATION,
    OBSERVATION_SIZE,
    RAIN_FORECAST_MM,
    RAIN_PROBABILITY,
    SOIL_MOISTURE,
    TEMPERATURE,
    decode_code,
)

DEFAULT_MOISTURE_EDGES: tuple[float, ...] = (0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.85)
DEFAULT_TEMPERATURE_EDGES: tuple[float, ...] = (1.0 / 3.0, 2.0 / 3.0)
DEFAULT_RAIN_PROB_EDGES: tuple[float, ...] = (0.35, 0.70)
DEFAULT_RAIN_MM_EDGES: tuple[float, ...] = (0.30, 0.60)
DEFAULT_LAST_IRRIGATION_EDGES: tuple[float, ...] = (0.50,)


@dataclass(frozen=True)
class StateDiscretizer:
    """Discretizes normalized 7D AgriWater observations into a 7-tuple index."""

    moisture_edges: tuple[float, ...] = DEFAULT_MOISTURE_EDGES
    temperature_edges: tuple[float, ...] = DEFAULT_TEMPERATURE_EDGES
    rain_prob_edges: tuple[float, ...] = DEFAULT_RAIN_PROB_EDGES
    rain_mm_edges: tuple[float, ...] = DEFAULT_RAIN_MM_EDGES
    last_irrigation_edges: tuple[float, ...] = DEFAULT_LAST_IRRIGATION_EDGES
    crop_bins: int = 4
    stage_bins: int = 2

    def __post_init__(self) -> None:
        # Pre-convert bin edges to float32 once to avoid per-step allocations
        # and match reward.py / agriwater_env.py float32 threshold semantics.
        object.__setattr__(self, "_moisture_f32", np.asarray(self.moisture_edges, dtype=np.float32))
        object.__setattr__(
            self, "_temperature_f32", np.asarray(self.temperature_edges, dtype=np.float32)
        )
        object.__setattr__(
            self, "_rain_prob_f32", np.asarray(self.rain_prob_edges, dtype=np.float32)
        )
        object.__setattr__(self, "_rain_mm_f32", np.asarray(self.rain_mm_edges, dtype=np.float32))
        object.__setattr__(
            self, "_last_irr_f32", np.asarray(self.last_irrigation_edges, dtype=np.float32)
        )

    @property
    def shape(self) -> tuple[int, ...]:
        """Grid dimensions for the Q-table state axes."""
        return (
            self.crop_bins,
            self.stage_bins,
            len(self.moisture_edges) + 1,
            len(self.temperature_edges) + 1,
            len(self.rain_prob_edges) + 1,
            len(self.rain_mm_edges) + 1,
            len(self.last_irrigation_edges) + 1,
        )

    @property
    def num_states(self) -> int:
        """Total number of discrete states."""
        return int(np.prod(self.shape))

    def discretize(self, state: np.ndarray) -> tuple[int, int, int, int, int, int, int]:
        """Clip state to [0, 1] and map each of the 7 dimensions to its bin index."""
        arr = np.asarray(state, dtype=np.float32).reshape(-1)
        if arr.size != OBSERVATION_SIZE:
            raise ValueError(f"Expected {OBSERVATION_SIZE}-D state, got shape {np.shape(state)}")

        # Always clip continuous/normalized values to [0.0, 1.0] before binning.
        s = np.clip(arr, 0.0, 1.0)

        crop_bin = int(np.clip(decode_code(float(s[CROP_TYPE])), 0, self.crop_bins - 1))
        stage_code = int(np.clip(decode_code(float(s[GROWTH_STAGE])), 0, 3))
        stage_bin = 1 if stage_code == 2 else 0

        # Compare in float32 to match reward.py / agriwater_env.py threshold semantics.
        moisture_bin = int(np.searchsorted(self._moisture_f32, s[SOIL_MOISTURE], side="right"))
        temp_bin = int(np.searchsorted(self._temperature_f32, s[TEMPERATURE], side="right"))
        rain_prob_bin = int(np.searchsorted(self._rain_prob_f32, s[RAIN_PROBABILITY], side="right"))
        rain_mm_bin = int(np.searchsorted(self._rain_mm_f32, s[RAIN_FORECAST_MM], side="right"))
        last_irr_bin = int(np.searchsorted(self._last_irr_f32, s[LAST_IRRIGATION], side="right"))

        return (
            crop_bin,
            stage_bin,
            moisture_bin,
            temp_bin,
            rain_prob_bin,
            rain_mm_bin,
            last_irr_bin,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize bin configuration to JSON-compatible dictionary."""
        return {
            "moisture_edges": list(self.moisture_edges),
            "temperature_edges": list(self.temperature_edges),
            "rain_prob_edges": list(self.rain_prob_edges),
            "rain_mm_edges": list(self.rain_mm_edges),
            "last_irrigation_edges": list(self.last_irrigation_edges),
            "crop_bins": self.crop_bins,
            "stage_bins": self.stage_bins,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StateDiscretizer:
        """Reconstruct a StateDiscretizer from serialized configuration."""
        return cls(
            moisture_edges=tuple(float(x) for x in data["moisture_edges"]),
            temperature_edges=tuple(float(x) for x in data["temperature_edges"]),
            rain_prob_edges=tuple(float(x) for x in data["rain_prob_edges"]),
            rain_mm_edges=tuple(float(x) for x in data["rain_mm_edges"]),
            last_irrigation_edges=tuple(float(x) for x in data["last_irrigation_edges"]),
            crop_bins=int(data.get("crop_bins", 4)),
            stage_bins=int(data.get("stage_bins", 2)),
        )


class QLearningAgent(BaseAgent):
    """Tabular Q-learning agent with epsilon-greedy exploration and random tie-breaking."""

    def __init__(
        self,
        n_actions: int = 6,
        alpha: float = 0.1,
        gamma: float = 0.99,
        epsilon_start: float = 1.0,
        epsilon_end: float = 0.05,
        epsilon_decay: float = 0.9997,
        discretizer: StateDiscretizer | None = None,
        seed: int | None = None,
    ) -> None:
        if n_actions < 1:
            raise ValueError("n_actions must be >= 1")
        if not 0.0 < alpha <= 1.0:
            raise ValueError("alpha must be in (0, 1]")
        if not 0.0 <= gamma <= 1.0:
            raise ValueError("gamma must be in [0, 1]")
        if not 0.0 <= epsilon_end <= epsilon_start <= 1.0:
            raise ValueError("epsilon bounds must satisfy 0 <= epsilon_end <= epsilon_start <= 1")
        if not 0.0 < epsilon_decay <= 1.0:
            raise ValueError("epsilon_decay must be in (0, 1]")

        self.n_actions = int(n_actions)
        self.alpha = float(alpha)
        self.gamma = float(gamma)
        self.epsilon_start = float(epsilon_start)
        self.epsilon_end = float(epsilon_end)
        self.epsilon_decay = float(epsilon_decay)
        self.epsilon = float(epsilon_start)
        self.discretizer = discretizer if discretizer is not None else StateDiscretizer()
        self.rng = np.random.default_rng(seed)
        self.q_table = np.zeros((*self.discretizer.shape, self.n_actions), dtype=np.float64)

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Choose an action index in 0..5 using epsilon-greedy with random tie-breaking.

        When training=False, acts strictly greedily (equivalent to epsilon=0).
        """
        if training and self.rng.random() < self.epsilon:
            return int(self.rng.integers(0, self.n_actions))

        state_idx = self.discretizer.discretize(state)
        q_values = self.q_table[state_idx]
        max_q = float(np.max(q_values))
        best_actions = np.flatnonzero(np.isclose(q_values, max_q, rtol=0.0, atol=1e-12))
        if best_actions.size == 1:
            return int(best_actions[0])
        return int(self.rng.choice(best_actions))

    def update(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        terminated: bool,
        truncated: bool = False,
    ) -> float:
        """Apply one Q-learning TD update, distinguishing terminated from truncated.

        - terminated=True  (biological death): no bootstrap, target = reward.
        - terminated=False, including time limits: bootstrap with gamma * max_a' Q(s', a').
        """
        _ = truncated  # Only biological termination cuts off bootstrapping.
        s_idx = self.discretizer.discretize(state)
        action_int = int(action)
        current_q = float(self.q_table[s_idx][action_int])

        if terminated:
            td_target = float(reward)
        else:
            ns_idx = self.discretizer.discretize(next_state)
            td_target = float(reward) + self.gamma * float(np.max(self.q_table[ns_idx]))

        td_error = td_target - current_q
        self.q_table[s_idx][action_int] = current_q + self.alpha * td_error
        return float(td_error)

    def decay_epsilon(self) -> float:
        """Exponentially decay epsilon at the end of an episode."""
        self.epsilon = max(self.epsilon_end, self.epsilon * self.epsilon_decay)
        return self.epsilon

    def save(self, path: str | Path, metadata: dict[str, Any] | None = None) -> Path:
        """Persist Q-table, discretizer edges, and hyperparameters into a compressed .npz file."""
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "n_actions": self.n_actions,
            "alpha": self.alpha,
            "gamma": self.gamma,
            "epsilon_start": self.epsilon_start,
            "epsilon_end": self.epsilon_end,
            "epsilon_decay": self.epsilon_decay,
            "epsilon": self.epsilon,
            "discretizer": self.discretizer.to_dict(),
            "metadata": metadata or {},
        }
        np.savez_compressed(
            target,
            q_table=self.q_table,
            config_json=np.array(json.dumps(payload), dtype=np.str_),
        )
        return target

    @classmethod
    def load(cls, path: str | Path, seed: int | None = None) -> QLearningAgent:
        """Load a saved Q-table from .npz with epsilon set to 0.0 for greedy inference."""
        source = Path(path)
        if not source.exists():
            raise FileNotFoundError(f"Q-table checkpoint not found: {source}")
        with np.load(source, allow_pickle=False) as data:
            q_table = np.array(data["q_table"], dtype=np.float64)
            config = json.loads(str(data["config_json"].item()))

        discretizer = StateDiscretizer.from_dict(config["discretizer"])
        expected_shape = (*discretizer.shape, int(config["n_actions"]))
        if q_table.shape != expected_shape:
            raise ValueError(
                f"Q-table shape mismatch: got {q_table.shape}, expected {expected_shape}"
            )

        agent = cls(
            n_actions=int(config["n_actions"]),
            alpha=float(config["alpha"]),
            gamma=float(config["gamma"]),
            epsilon_start=float(config["epsilon_start"]),
            epsilon_end=float(config["epsilon_end"]),
            epsilon_decay=float(config["epsilon_decay"]),
            discretizer=discretizer,
            seed=seed,
        )
        agent.q_table = q_table
        agent.epsilon = 0.0
        return agent
