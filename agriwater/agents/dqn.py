"""CPU-based Deep Q-Network (DQN) agent for the 7D continuous AgriWater environment."""

from collections.abc import Sequence
from copy import deepcopy
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

from agriwater.agents.base_agent import BaseAgent
from agriwater.config import load_config

_STATE_DIM = 7
_ACTION_DIM = 6
_MAX_GRAD_NORM = 10.0


def _positive_int(value: Any, label: str) -> int:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, (int, np.integer)):
        raise ValueError(f"{label} must be a positive integer")
    number = int(value)
    if number < 1:
        raise ValueError(f"{label} must be a positive integer")
    return number


def _finite_float(
    value: Any,
    label: str,
    low: float | None = None,
    high: float | None = None,
    *,
    low_inclusive: bool = True,
    high_inclusive: bool = True,
) -> float:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, (int, float, np.number)):
        raise ValueError(f"{label} must be a finite number")
    number = float(value)
    if not np.isfinite(number):
        raise ValueError(f"{label} must be a finite number")
    if low is not None and (number < low if low_inclusive else number <= low):
        raise ValueError(f"{label} out of range")
    if high is not None and (number > high if high_inclusive else number >= high):
        raise ValueError(f"{label} out of range")
    return number


def _validate_state(state: Any, state_dim: int, label: str = "state") -> np.ndarray:
    if not isinstance(state, np.ndarray):
        raise TypeError(f"{label} must be a numpy.ndarray")
    if state.shape != (state_dim,):
        raise ValueError(f"{label} must have shape ({state_dim},), got {state.shape}")
    if not np.all(np.isfinite(state)):
        raise ValueError(f"{label} must contain only finite values")
    return np.asarray(state, dtype=np.float32)


def _validate_action(action: Any, action_dim: int) -> int:
    if isinstance(action, (bool, np.bool_)) or not isinstance(action, (int, np.integer)):
        raise TypeError(f"action must be an integer in 0..{action_dim - 1}")
    index = int(action)
    if not 0 <= index < action_dim:
        raise ValueError(f"action must be an integer in 0..{action_dim - 1}")
    return index


class QNetwork(nn.Module):
    """MLP approximating Q(s, a) for continuous state inputs and discrete actions."""

    def __init__(
        self,
        state_dim: int = _STATE_DIM,
        action_dim: int = _ACTION_DIM,
        hidden_sizes: Sequence[int] = (64, 64),
    ) -> None:
        super().__init__()
        in_dim = _positive_int(state_dim, "state_dim")
        out_dim = _positive_int(action_dim, "action_dim")
        if not isinstance(hidden_sizes, Sequence) or isinstance(hidden_sizes, (str, bytes)):
            raise ValueError("hidden_sizes must be a non-empty sequence of positive integers")
        dims = [_positive_int(h, "hidden_sizes") for h in hidden_sizes]
        if not dims:
            raise ValueError("hidden_sizes must not be empty")

        layers: list[nn.Module] = []
        prev = in_dim
        for width in dims:
            layers.append(nn.Linear(prev, width))
            layers.append(nn.ReLU())
            prev = width
        layers.append(nn.Linear(prev, out_dim))
        self.net = nn.Sequential(*layers)

    def forward(self, states: torch.Tensor) -> torch.Tensor:
        return self.net(states)


class ReplayBuffer:
    """Fixed-capacity O(1) NumPy ring buffer with seeded mini-batch sampling."""

    def __init__(self, capacity: int, state_dim: int = _STATE_DIM) -> None:
        self._capacity = _positive_int(capacity, "replay_buffer_size")
        self._state_dim = _positive_int(state_dim, "state_dim")
        self._states = np.empty((self._capacity, self._state_dim), dtype=np.float32)
        self._actions = np.empty(self._capacity, dtype=np.int64)
        self._rewards = np.empty(self._capacity, dtype=np.float32)
        self._next_states = np.empty((self._capacity, self._state_dim), dtype=np.float32)
        self._terminateds = np.empty(self._capacity, dtype=np.float32)
        self._pos = 0
        self._size = 0

    def push(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        terminated: bool,
    ) -> None:
        idx = self._pos
        self._states[idx] = np.asarray(state, dtype=np.float32)
        self._actions[idx] = int(action)
        self._rewards[idx] = float(reward)
        self._next_states[idx] = np.asarray(next_state, dtype=np.float32)
        self._terminateds[idx] = 1.0 if terminated else 0.0
        self._pos = (idx + 1) % self._capacity
        if self._size < self._capacity:
            self._size += 1

    def sample(
        self, batch_size: int, rng: np.random.Generator
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        size = _positive_int(batch_size, "batch_size")
        if size > self._size:
            raise ValueError("Not enough transitions in replay buffer to sample batch")
        indices = rng.choice(self._size, size=size, replace=False)
        return (
            self._states[indices].copy(),
            self._actions[indices].copy(),
            self._rewards[indices].copy(),
            self._next_states[indices].copy(),
            self._terminateds[indices].copy(),
        )

    def __len__(self) -> int:
        return self._size


class DQNAgent(BaseAgent):
    """Deep Q-Network with experience replay, target network and epsilon-greedy exploration."""

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        *,
        seed: int | None = None,
        state_dim: int = _STATE_DIM,
        action_dim: int = _ACTION_DIM,
    ) -> None:
        defaults = load_config("training") if config is None or seed is None else {}
        raw_cfg = deepcopy(defaults["dqn"] if config is None else config)
        if not isinstance(raw_cfg, dict):
            raise ValueError("DQN config must be a mapping")
        if seed is None:
            seed = defaults.get("seed", 42)
        if isinstance(seed, (bool, np.bool_)) or not isinstance(seed, (int, np.integer)):
            raise ValueError("seed must be an integer")

        self._seed = int(seed)
        self._state_dim = _positive_int(state_dim, "state_dim")
        self._action_dim = _positive_int(action_dim, "action_dim")
        self._gamma = _finite_float(raw_cfg.get("gamma"), "gamma", 0.0, 1.0, high_inclusive=False)
        self._learning_rate = _finite_float(
            raw_cfg.get("learning_rate"), "learning_rate", 0.0, low_inclusive=False
        )
        self._epsilon_start = _finite_float(raw_cfg.get("epsilon_start"), "epsilon_start", 0.0, 1.0)
        self._epsilon_end = _finite_float(
            raw_cfg.get("epsilon_end"), "epsilon_end", 0.0, self._epsilon_start
        )
        self._epsilon_decay = _finite_float(
            raw_cfg.get("epsilon_decay"), "epsilon_decay", 0.0, 1.0, low_inclusive=False
        )
        self._batch_size = _positive_int(raw_cfg.get("batch_size"), "batch_size")
        self._replay_buffer_size = _positive_int(
            raw_cfg.get("replay_buffer_size"), "replay_buffer_size"
        )
        if self._replay_buffer_size < self._batch_size:
            raise ValueError("replay_buffer_size must be at least batch_size")
        self._target_update_steps = _positive_int(
            raw_cfg.get("target_update_steps"), "target_update_steps"
        )
        hidden = raw_cfg.get("hidden_sizes")
        if not isinstance(hidden, Sequence) or isinstance(hidden, (str, bytes)) or not hidden:
            raise ValueError("hidden_sizes must be a non-empty sequence of positive integers")
        self._hidden_sizes = [_positive_int(h, "hidden_sizes") for h in hidden]
        device_name = raw_cfg.get("device", "cpu")
        if not isinstance(device_name, str) or not device_name:
            raise ValueError("device must be a non-empty string")
        self._device = torch.device(device_name)
        loss_name = raw_cfg.get("loss", "mse")
        if loss_name not in {"mse", "huber"}:
            raise ValueError("loss must be 'mse' or 'huber'")
        self._loss_name = loss_name
        self._double_dqn = bool(raw_cfg.get("double_dqn", False))

        self._config: dict[str, Any] = {
            "gamma": self._gamma,
            "learning_rate": self._learning_rate,
            "epsilon_start": self._epsilon_start,
            "epsilon_end": self._epsilon_end,
            "epsilon_decay": self._epsilon_decay,
            "batch_size": self._batch_size,
            "replay_buffer_size": self._replay_buffer_size,
            "target_update_steps": self._target_update_steps,
            "hidden_sizes": list(self._hidden_sizes),
            "device": str(self._device),
            "loss": self._loss_name,
            "double_dqn": self._double_dqn,
        }

        self._rng = np.random.default_rng(self._seed)
        torch.manual_seed(self._seed)
        self._online_net = QNetwork(self._state_dim, self._action_dim, self._hidden_sizes).to(
            self._device
        )
        self._target_net = QNetwork(self._state_dim, self._action_dim, self._hidden_sizes).to(
            self._device
        )
        self._target_net.load_state_dict(self._online_net.state_dict())
        self._target_net.eval()

        self._optimizer = torch.optim.Adam(self._online_net.parameters(), lr=self._learning_rate)
        self._loss_fn: nn.Module = nn.SmoothL1Loss() if self._loss_name == "huber" else nn.MSELoss()
        self._buffer = ReplayBuffer(self._replay_buffer_size, state_dim=self._state_dim)
        self._epsilon = self._epsilon_start
        self._update_steps = 0

    @property
    def epsilon(self) -> float:
        return self._epsilon

    @property
    def update_steps(self) -> int:
        return self._update_steps

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)

    @property
    def config(self) -> dict[str, Any]:
        return deepcopy(self._config)

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Return an action index in 0..5 using epsilon-greedy (train) or greedy (eval)."""
        obs = _validate_state(state, self._state_dim)
        if training and float(self._rng.random()) < self._epsilon:
            return int(self._rng.integers(0, self._action_dim))
        state_t = torch.from_numpy(obs.copy()).unsqueeze(0).to(self._device)
        was_training = self._online_net.training
        self._online_net.eval()
        with torch.no_grad():
            q_values = self._online_net(state_t)
        if was_training:
            self._online_net.train()
        return int(torch.argmax(q_values, dim=1).item())

    def learn(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        terminated: bool,
        truncated: bool = False,
    ) -> float | None:
        """Store a transition and run one gradient step once enough samples exist."""
        obs = _validate_state(state, self._state_dim, "state")
        nxt = _validate_state(next_state, self._state_dim, "next_state")
        act = _validate_action(action, self._action_dim)
        rew = _finite_float(reward, "reward")
        # Time-limit truncation still carries future value, so only biological termination masks Q.
        _ = truncated
        self._buffer.push(obs, act, rew, nxt, bool(terminated))
        if len(self._buffer) < self._batch_size:
            return None

        states, actions, rewards, next_states, terminateds = self._buffer.sample(
            self._batch_size, self._rng
        )
        states_t = torch.from_numpy(states).to(self._device)
        actions_t = torch.from_numpy(actions).to(self._device)
        rewards_t = torch.from_numpy(rewards).to(self._device)
        next_states_t = torch.from_numpy(next_states).to(self._device)
        terminateds_t = torch.from_numpy(terminateds).to(self._device)

        self._online_net.train()
        q_pred = self._online_net(states_t).gather(1, actions_t.unsqueeze(1)).squeeze(1)
        with torch.no_grad():
            if self._double_dqn:
                best_next = self._online_net(next_states_t).argmax(dim=1, keepdim=True)
                next_q = self._target_net(next_states_t).gather(1, best_next).squeeze(1)
            else:
                next_q = self._target_net(next_states_t).max(dim=1).values
            targets = rewards_t + self._gamma * (1.0 - terminateds_t) * next_q

        loss = self._loss_fn(q_pred, targets)
        self._optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(self._online_net.parameters(), max_norm=_MAX_GRAD_NORM)
        self._optimizer.step()

        self._update_steps += 1
        if self._update_steps % self._target_update_steps == 0:
            self._target_net.load_state_dict(self._online_net.state_dict())
        return float(loss.item())

    def end_episode(self) -> None:
        """Decay exploration rate once per completed episode."""
        self._epsilon = max(self._epsilon_end, self._epsilon * self._epsilon_decay)

    def save(self, path: str | Path) -> Path:
        """Persist network weights, optimizer state and training counters."""
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "state_dim": self._state_dim,
            "action_dim": self._action_dim,
            "hidden_sizes": list(self._hidden_sizes),
            "config": deepcopy(self._config),
            "epsilon": float(self._epsilon),
            "update_steps": int(self._update_steps),
            "online_state_dict": self._online_net.state_dict(),
            "target_state_dict": self._target_net.state_dict(),
            "optimizer_state_dict": self._optimizer.state_dict(),
        }
        with target.open("wb") as handle:
            torch.save(payload, handle)
        return target

    def load(self, path: str | Path) -> None:
        """Restore weights and counters from a checkpoint matching this network shape."""
        source = Path(path)
        payload = torch.load(source, map_location=self._device, weights_only=True)
        if not isinstance(payload, dict) or "online_state_dict" not in payload:
            raise ValueError(f"Invalid DQN checkpoint: {source}")
        if (
            payload.get("state_dim") != self._state_dim
            or payload.get("action_dim") != self._action_dim
            or payload.get("hidden_sizes") != self._hidden_sizes
        ):
            raise ValueError("DQN checkpoint architecture does not match this agent")
        self._online_net.load_state_dict(payload["online_state_dict"])
        target_state = payload.get("target_state_dict", payload["online_state_dict"])
        self._target_net.load_state_dict(target_state)
        self._target_net.eval()
        if "optimizer_state_dict" in payload:
            self._optimizer.load_state_dict(payload["optimizer_state_dict"])
        if "epsilon" in payload:
            self._epsilon = float(payload["epsilon"])
        if "update_steps" in payload:
            self._update_steps = int(payload["update_steps"])

    @classmethod
    def from_checkpoint(
        cls, path: str | Path, *, device: str | None = None, seed: int = 42
    ) -> "DQNAgent":
        """Reconstruct a DQNAgent matching the saved checkpoint architecture and load weights."""
        source = Path(path)
        map_loc = "cpu" if device is None else device
        payload = torch.load(source, map_location=map_loc, weights_only=True)
        if not isinstance(payload, dict) or "online_state_dict" not in payload:
            raise ValueError(f"Invalid DQN checkpoint: {source}")
        config = deepcopy(payload.get("config") or load_config("training")["dqn"])
        if "hidden_sizes" in payload:
            config["hidden_sizes"] = list(payload["hidden_sizes"])
        if device is not None:
            config["device"] = device
        agent = cls(
            config,
            seed=seed,
            state_dim=int(payload.get("state_dim", _STATE_DIM)),
            action_dim=int(payload.get("action_dim", _ACTION_DIM)),
        )
        agent.load(source)
        return agent
