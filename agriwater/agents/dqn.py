"""Tác tử Deep Q-Network (DQN) chạy CPU cho môi trường AgriWater 7 chiều liên tục."""

from collections.abc import Sequence
from copy import deepcopy
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

from agriwater.agents.base_agent import BaseAgent
from agriwater.config import load_config

# Số chiều mặc định của vector trạng thái (7 đặc trưng đã chuẩn hóa về [0, 1]).
_STATE_DIM = 7
# Số lượng hành động rời rạc mặc định: 0..5 tương ứng [0, 5, 10, 15, 20, 25] lít nước.
_ACTION_DIM = 6
# Ngưỡng cắt chuẩn L2 của gradient để tránh bùng nổ gradient (exploding gradients).
_MAX_GRAD_NORM = 10.0


def _positive_int(value: Any, label: str) -> int:
    """Kiểm tra giá trị phải là số nguyên dương (>= 1), loại trừ kiểu bool."""
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
    """Kiểm tra số thực hữu hạn (không phải NaN/inf/bool) và nằm trong miền cho phép."""
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
    """Kiểm tra vector trạng thái là ndarray đúng chiều, hữu hạn và ép kiểu về float32."""
    if not isinstance(state, np.ndarray):
        raise TypeError(f"{label} must be a numpy.ndarray")
    if state.shape != (state_dim,):
        raise ValueError(f"{label} must have shape ({state_dim},), got {state.shape}")
    if not np.all(np.isfinite(state)):
        raise ValueError(f"{label} must contain only finite values")
    return np.asarray(state, dtype=np.float32)


def _validate_action(action: Any, action_dim: int) -> int:
    """Kiểm tra chỉ số hành động là số nguyên hợp lệ trong đoạn [0, action_dim - 1]."""
    if isinstance(action, (bool, np.bool_)) or not isinstance(action, (int, np.integer)):
        raise TypeError(f"action must be an integer in 0..{action_dim - 1}")
    index = int(action)
    if not 0 <= index < action_dim:
        raise ValueError(f"action must be an integer in 0..{action_dim - 1}")
    return index


class QNetwork(nn.Module):
    """Mạng nơ-ron đa tầng (MLP) xấp xỉ hàm giá trị hành động Q(s, a; theta).

    Đầu vào: vector trạng thái liên tục s có kích thước (batch_size, state_dim).
    Đầu ra: vector giá trị Q cho toàn bộ action_dim hành động rời rạc cùng lúc.
    """

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

        # Xây dựng các lớp kết nối đầy đủ (Fully Connected) xen kẽ hàm kích hoạt ReLU.
        # Mặc định: Linear(7 -> 64) -> ReLU -> Linear(64 -> 64) -> ReLU -> Linear(64 -> 6).
        layers: list[nn.Module] = []
        prev = in_dim
        for width in dims:
            layers.append(nn.Linear(prev, width))
            layers.append(nn.ReLU())
            prev = width
        # Lớp đầu ra là tầng tuyến tính thuần túy (không dùng ReLU/Sigmoid)
        # vì giá trị Q (tổng reward kỳ vọng) có thể nhận cả giá trị âm lẫn dương bất kỳ.
        layers.append(nn.Linear(prev, out_dim))
        self.net = nn.Sequential(*layers)

    def forward(self, states: torch.Tensor) -> torch.Tensor:
        """Lan truyền xuôi: ánh xạ batch trạng thái sang ma trận giá trị Q(s, a)."""
        return self.net(states)


class ReplayBuffer:
    """Bộ đệm phát lại kinh nghiệm (Experience Replay) dạng vòng tròn (Ring Buffer) O(1).

    Lưu các bộ chuyển tiếp (s, a, r, s', terminated) trong mảng NumPy cấp phát sẵn
    và hỗ trợ lấy mẫu mini-batch ngẫu nhiên có seed để tái lập thực nghiệm.
    Vai trò: phá vỡ tương quan chuỗi thời gian giữa các bước liên tiếp và tái sử dụng dữ liệu.
    """

    def __init__(self, capacity: int, state_dim: int = _STATE_DIM) -> None:
        self._capacity = _positive_int(capacity, "replay_buffer_size")
        self._state_dim = _positive_int(state_dim, "state_dim")
        # Cấp phát trước toàn bộ bộ nhớ giúp ghi mẫu đạt O(1) và tránh phân mảnh RAM.
        self._states = np.empty((self._capacity, self._state_dim), dtype=np.float32)
        self._actions = np.empty(self._capacity, dtype=np.int64)
        self._rewards = np.empty(self._capacity, dtype=np.float32)
        self._next_states = np.empty((self._capacity, self._state_dim), dtype=np.float32)
        # Lưu terminated dưới dạng 1.0/0.0 (float32) để nhân mặt nạ trực tiếp trong Bellman.
        self._terminateds = np.empty(self._capacity, dtype=np.float32)
        # _pos là con trỏ ghi hiện tại (xoay vòng); _size là số mẫu hợp lệ đang có.
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
        """Lưu một mẫu chuyển tiếp (s, a, r, s', terminated); khi đầy sẽ ghi đè mẫu cũ nhất."""
        idx = self._pos
        self._states[idx] = np.asarray(state, dtype=np.float32)
        self._actions[idx] = int(action)
        self._rewards[idx] = float(reward)
        self._next_states[idx] = np.asarray(next_state, dtype=np.float32)
        self._terminateds[idx] = 1.0 if terminated else 0.0
        # Cơ chế FIFO dạng vòng: quay lại vị trí 0 khi chạm dung lượng tối đa.
        self._pos = (idx + 1) % self._capacity
        if self._size < self._capacity:
            self._size += 1

    def sample(
        self, batch_size: int, rng: np.random.Generator
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Lấy mẫu ngẫu nhiên không hoàn lại một mini-batch dùng bộ sinh số có seed."""
        size = _positive_int(batch_size, "batch_size")
        if size > self._size:
            raise ValueError("Not enough transitions in replay buffer to sample batch")
        # Chọn ngẫu nhiên các chỉ số không trùng lặp để đảm bảo tính độc lập (i.i.d.).
        indices = rng.choice(self._size, size=size, replace=False)
        # Trả về bản sao (.copy()) để ngăn mã bên ngoài làm biến đổi dữ liệu trong buffer.
        return (
            self._states[indices].copy(),
            self._actions[indices].copy(),
            self._rewards[indices].copy(),
            self._next_states[indices].copy(),
            self._terminateds[indices].copy(),
        )

    def __len__(self) -> int:
        """Trả về số lượng mẫu chuyển tiếp hiện đang lưu trong bộ đệm."""
        return self._size


class DQNAgent(BaseAgent):
    """Tác tử Deep Q-Network gồm Experience Replay, Target Network và khám phá epsilon-greedy.

    Hỗ trợ thêm tùy chọn hàm mất mát Huber (SmoothL1Loss) và thuật toán Double DQN.
    """

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        *,
        seed: int | None = None,
        state_dim: int = _STATE_DIM,
        action_dim: int = _ACTION_DIM,
    ) -> None:
        # Nạp cấu hình mặc định từ configs/training.yaml nếu người gọi không truyền vào.
        defaults = load_config("training") if config is None or seed is None else {}
        raw_cfg = deepcopy(defaults["dqn"] if config is None else config)
        if not isinstance(raw_cfg, dict):
            raise ValueError("DQN config must be a mapping")
        if seed is None:
            seed = defaults.get("seed", 42)
        if isinstance(seed, (bool, np.bool_)) or not isinstance(seed, (int, np.integer)):
            raise ValueError("seed must be an integer")

        # Kiểm tra và gán các siêu tham số (hyperparameters) của thuật toán DQN.
        self._seed = int(seed)
        self._state_dim = _positive_int(state_dim, "state_dim")
        self._action_dim = _positive_int(action_dim, "action_dim")
        # Hệ số chiết khấu gamma thuộc [0, 1): đo mức độ coi trọng phần thưởng tương lai.
        self._gamma = _finite_float(raw_cfg.get("gamma"), "gamma", 0.0, 1.0, high_inclusive=False)
        # Tốc độ học alpha (> 0) cho bộ tối ưu hóa Adam.
        self._learning_rate = _finite_float(
            raw_cfg.get("learning_rate"), "learning_rate", 0.0, low_inclusive=False
        )
        # Tham số lịch trình giảm tỷ lệ khám phá ngẫu nhiên epsilon-greedy.
        self._epsilon_start = _finite_float(raw_cfg.get("epsilon_start"), "epsilon_start", 0.0, 1.0)
        self._epsilon_end = _finite_float(
            raw_cfg.get("epsilon_end"), "epsilon_end", 0.0, self._epsilon_start
        )
        self._epsilon_decay = _finite_float(
            raw_cfg.get("epsilon_decay"), "epsilon_decay", 0.0, 1.0, low_inclusive=False
        )
        # Kích thước mini-batch và dung lượng tối đa của Replay Buffer.
        self._batch_size = _positive_int(raw_cfg.get("batch_size"), "batch_size")
        self._replay_buffer_size = _positive_int(
            raw_cfg.get("replay_buffer_size"), "replay_buffer_size"
        )
        if self._replay_buffer_size < self._batch_size:
            raise ValueError("replay_buffer_size must be at least batch_size")
        # Chu kỳ C bước học để đồng bộ trọng số từ online_net sang target_net.
        self._target_update_steps = _positive_int(
            raw_cfg.get("target_update_steps"), "target_update_steps"
        )
        # Danh sách số nơ-ron ở các tầng ẩn của QNetwork (mặc định [64, 64]).
        hidden = raw_cfg.get("hidden_sizes")
        if not isinstance(hidden, Sequence) or isinstance(hidden, (str, bytes)) or not hidden:
            raise ValueError("hidden_sizes must be a non-empty sequence of positive integers")
        self._hidden_sizes = [_positive_int(h, "hidden_sizes") for h in hidden]
        # Thiết bị chạy PyTorch (mặc định "cpu" theo yêu cầu dự án).
        device_name = raw_cfg.get("device", "cpu")
        if not isinstance(device_name, str) or not device_name:
            raise ValueError("device must be a non-empty string")
        self._device = torch.device(device_name)
        # Chọn hàm mất mát: 'mse' (bình phương sai số) hoặc 'huber' (ổn định hơn trước outlier).
        loss_name = raw_cfg.get("loss", "mse")
        if loss_name not in {"mse", "huber"}:
            raise ValueError("loss must be 'mse' or 'huber'")
        self._loss_name = loss_name
        # Bật Double DQN nếu cần giảm hiện tượng ước lượng quá mức (overestimation bias).
        self._double_dqn = bool(raw_cfg.get("double_dqn", False))

        # Lưu lại bản cấu hình chuẩn hóa để phục vụ ghi log và lưu vào checkpoint.
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

        # Cố định seed cho cả NumPy (khám phá, lấy mẫu batch) và PyTorch (khởi tạo trọng số).
        self._rng = np.random.default_rng(self._seed)
        torch.manual_seed(self._seed)

        # Khởi tạo mạng chính (online_net): được cập nhật trọng số sau mỗi bước học.
        self._online_net = QNetwork(self._state_dim, self._action_dim, self._hidden_sizes).to(
            self._device
        )
        # Khởi tạo mạng mục tiêu (target_net): giữ trọng số cố định theo chu kỳ C bước
        # để tạo nhãn Bellman ổn định, tránh hiện tượng "mục tiêu di động" (moving target).
        self._target_net = QNetwork(self._state_dim, self._action_dim, self._hidden_sizes).to(
            self._device
        )
        self._target_net.load_state_dict(self._online_net.state_dict())
        # Đặt target_net ở chế độ eval() vì mạng này chỉ dùng suy luận, không huấn luyện trực tiếp.
        self._target_net.eval()

        # Bộ tối ưu hóa Adam chỉ cập nhật tham số của mạng chính (_online_net).
        self._optimizer = torch.optim.Adam(self._online_net.parameters(), lr=self._learning_rate)
        self._loss_fn: nn.Module = nn.SmoothL1Loss() if self._loss_name == "huber" else nn.MSELoss()
        self._buffer = ReplayBuffer(self._replay_buffer_size, state_dim=self._state_dim)
        # Khởi tạo tỷ lệ khám phá ban đầu và bộ đếm số lần cập nhật gradient.
        self._epsilon = self._epsilon_start
        self._update_steps = 0

    @property
    def epsilon(self) -> float:
        """Trả về tỷ lệ khám phá epsilon hiện tại."""
        return self._epsilon

    @property
    def update_steps(self) -> int:
        """Trả về tổng số bước cập nhật gradient đã thực hiện."""
        return self._update_steps

    @property
    def buffer_size(self) -> int:
        """Trả về số lượng mẫu chuyển tiếp đang có trong Replay Buffer."""
        return len(self._buffer)

    @property
    def config(self) -> dict[str, Any]:
        """Trả về bản sao cấu hình siêu tham số hiện hành của tác tử."""
        return deepcopy(self._config)

    def select_action(self, state: np.ndarray, training: bool = False) -> int:
        """Chọn hành động 0..5 theo epsilon-greedy (huấn luyện) hoặc greedy (đánh giá)."""
        obs = _validate_state(state, self._state_dim)
        # Khám phá (Exploration): khi đang train, chọn ngẫu nhiên với xác suất epsilon.
        if training and float(self._rng.random()) < self._epsilon:
            return int(self._rng.integers(0, self._action_dim))
        # Khai thác (Exploitation): thêm chiều batch (1, 7) để đưa vào mạng PyTorch.
        state_t = torch.from_numpy(obs.copy()).unsqueeze(0).to(self._device)
        was_training = self._online_net.training
        self._online_net.eval()
        # Tắt theo dõi gradient khi suy luận để tăng tốc độ và tiết kiệm bộ nhớ.
        with torch.no_grad():
            q_values = self._online_net(state_t)
        if was_training:
            self._online_net.train()
        # Trả về hành động a* = argmax_a Q(s, a; theta).
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
        """Lưu một transition vào buffer và thực hiện một bước tối ưu gradient nếu đủ dữ liệu."""
        obs = _validate_state(state, self._state_dim, "state")
        nxt = _validate_state(next_state, self._state_dim, "next_state")
        act = _validate_action(action, self._action_dim)
        rew = _finite_float(reward, "reward")
        # Cắt ngắn theo giới hạn thời gian (truncated=True, hết 30 ngày) vẫn còn giá trị
        # tương lai theo lý thuyết MDP; chỉ chết cây sinh học (terminated=True) mới gán Q_next = 0.
        _ = truncated
        self._buffer.push(obs, act, rew, nxt, bool(terminated))
        # Chưa đủ số mẫu cho một mini-batch thì chỉ tích lũy kinh nghiệm, chưa cập nhật mạng.
        if len(self._buffer) < self._batch_size:
            return None

        # Lấy ngẫu nhiên một mini-batch từ Replay Buffer và chuyển sang Tensor PyTorch.
        states, actions, rewards, next_states, terminateds = self._buffer.sample(
            self._batch_size, self._rng
        )
        states_t = torch.from_numpy(states).to(self._device)
        actions_t = torch.from_numpy(actions).to(self._device)
        rewards_t = torch.from_numpy(rewards).to(self._device)
        next_states_t = torch.from_numpy(next_states).to(self._device)
        terminateds_t = torch.from_numpy(terminateds).to(self._device)

        self._online_net.train()
        # Bước 1: Tính giá trị Q dự đoán Q(s, a; theta) cho đúng hành động đã chọn trong batch.
        # gather(1, actions_t.unsqueeze(1)) trích xuất phần tử tại cột action tương ứng mỗi dòng.
        q_pred = self._online_net(states_t).gather(1, actions_t.unsqueeze(1)).squeeze(1)

        # Bước 2: Tính giá trị mục tiêu Bellman y (không tính gradient qua nhánh target).
        with torch.no_grad():
            if self._double_dqn:
                # Double DQN: tách biệt việc CHỌN hành động tốt nhất bằng online_net
                # và ĐÁNH GIÁ giá trị Q của hành động đó bằng target_net để giảm ước lượng lố.
                best_next = self._online_net(next_states_t).argmax(dim=1, keepdim=True)
                next_q = self._target_net(next_states_t).gather(1, best_next).squeeze(1)
            else:
                # DQN chuẩn: lấy trực tiếp max_{a'} Q(s', a'; theta^-) từ target_net.
                next_q = self._target_net(next_states_t).max(dim=1).values
            # Công thức Bellman: y = r + gamma * (1 - terminated) * next_q.
            targets = rewards_t + self._gamma * (1.0 - terminateds_t) * next_q

        # Bước 3: Tính sai số TD (hàm mất mát MSE hoặc Huber) và lan truyền ngược.
        loss = self._loss_fn(q_pred, targets)
        self._optimizer.zero_grad()
        loss.backward()
        # Cắt gradient theo chuẩn L2 để ngăn bước nhảy trọng số quá lớn gây phân kỳ mạng.
        nn.utils.clip_grad_norm_(self._online_net.parameters(), max_norm=_MAX_GRAD_NORM)
        self._optimizer.step()

        # Bước 4: Cập nhật cứng (hard update) target_net sau mỗi chu kỳ C bước học.
        self._update_steps += 1
        if self._update_steps % self._target_update_steps == 0:
            self._target_net.load_state_dict(self._online_net.state_dict())
        return float(loss.item())

    def end_episode(self) -> None:
        """Giảm tỷ lệ khám phá epsilon theo hàm mũ sau mỗi tập (episode) hoàn tất."""
        self._epsilon = max(self._epsilon_end, self._epsilon * self._epsilon_decay)

    def save(self, path: str | Path) -> Path:
        """Lưu checkpoint gồm kiến trúc, cấu hình, trọng số 2 mạng, optimizer và biến đếm."""
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
        """Khôi phục trọng số và trạng thái huấn luyện từ checkpoint khớp kiến trúc mạng."""
        source = Path(path)
        # weights_only=True giúp nạp tệp an toàn, tránh rủi ro bảo mật khi giải tuần tự pickle.
        payload = torch.load(source, map_location=self._device, weights_only=True)
        if not isinstance(payload, dict) or "online_state_dict" not in payload:
            raise ValueError(f"Invalid DQN checkpoint: {source}")
        # Kiểm tra kiến trúc của checkpoint phải trùng khớp với tác tử hiện tại.
        if (
            payload.get("state_dim") != self._state_dim
            or payload.get("action_dim") != self._action_dim
            or payload.get("hidden_sizes") != self._hidden_sizes
        ):
            raise ValueError("DQN checkpoint architecture does not match this agent")
        self._online_net.load_state_dict(payload["online_state_dict"])
        # Tương thích ngược: nếu checkpoint thiếu target_state_dict thì dùng tạm online_state_dict.
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
        """Tự động dựng lại một DQNAgent khớp kiến trúc trong checkpoint và nạp trọng số."""
        source = Path(path)
        map_loc = "cpu" if device is None else device
        payload = torch.load(source, map_location=map_loc, weights_only=True)
        if not isinstance(payload, dict) or "online_state_dict" not in payload:
            raise ValueError(f"Invalid DQN checkpoint: {source}")
        # Ưu tiên lấy cấu hình đã lưu trong checkpoint; nếu không có thì rơi về cấu hình mặc định.
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
