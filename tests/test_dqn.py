"""Unit and integration tests for QNetwork, ReplayBuffer and DQNAgent."""

from pathlib import Path

import numpy as np
import pytest
import torch

from agriwater.agents.dqn import DQNAgent, QNetwork, ReplayBuffer
from agriwater.environment.agriwater_env import AgriWaterEnv


def _small_config(**overrides: object) -> dict[str, object]:
    cfg: dict[str, object] = {
        "gamma": 0.99,
        "learning_rate": 0.01,
        "epsilon_start": 1.0,
        "epsilon_end": 0.05,
        "epsilon_decay": 0.9,
        "batch_size": 4,
        "replay_buffer_size": 32,
        "target_update_steps": 3,
        "hidden_sizes": [16, 16],
        "device": "cpu",
    }
    cfg.update(overrides)
    return cfg


def _state(moisture: float = 0.5) -> np.ndarray:
    return np.array([0.0, 0.0, moisture, 0.5, 0.2, 0.1, 0.0], dtype=np.float32)


def test_qnetwork_output_shape_and_validation() -> None:
    net = QNetwork(state_dim=7, action_dim=6, hidden_sizes=[32, 16])
    out = net(torch.zeros((5, 7), dtype=torch.float32))
    assert out.shape == (5, 6)
    with pytest.raises(ValueError, match="hidden_sizes"):
        QNetwork(hidden_sizes=[])
    with pytest.raises(ValueError, match="state_dim"):
        QNetwork(state_dim=0)


def test_replay_buffer_fifo_copy_and_seeded_sampling() -> None:
    buf = ReplayBuffer(capacity=3)
    s = _state(0.4)
    ns = _state(0.5)
    for i in range(5):
        buf.push(s, i, float(i), ns, terminated=(i == 4))
    assert len(buf) == 3

    s[:] = 0.0
    ns[:] = 0.0
    a = buf.sample(2, np.random.default_rng(7))
    b = buf.sample(2, np.random.default_rng(7))
    for arr_a, arr_b in zip(a, b, strict=True):
        np.testing.assert_array_equal(arr_a, arr_b)
    assert a[0].shape == (2, 7) and a[0].dtype == np.float32
    assert a[1].dtype == np.int64
    assert np.allclose(a[0][:, 2], 0.4)
    with pytest.raises(ValueError, match="Not enough transitions"):
        buf.sample(4, np.random.default_rng(1))


def test_select_action_contract_and_input_validation() -> None:
    agent = DQNAgent(seed=42)
    s = _state(0.55)
    before = s.copy()
    action = agent.select_action(s, training=False)
    assert type(action) is int
    assert 0 <= action <= 5
    np.testing.assert_array_equal(s, before)
    assert all(agent.select_action(s, training=False) == action for _ in range(10))

    explored = {agent.select_action(s, training=True) for _ in range(60)}
    assert len(explored) > 1

    with pytest.raises(TypeError, match="numpy.ndarray"):
        agent.select_action([0.0] * 7)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="shape"):
        agent.select_action(np.zeros(6, dtype=np.float32))
    bad = _state()
    bad[2] = np.nan
    with pytest.raises(ValueError, match="finite"):
        agent.select_action(bad)


def test_learn_updates_online_net_and_syncs_target_every_c_steps() -> None:
    agent = DQNAgent(_small_config(batch_size=4, target_update_steps=3), seed=1)
    init_online = {k: v.clone() for k, v in agent._online_net.state_dict().items()}
    init_target = {k: v.clone() for k, v in agent._target_net.state_dict().items()}

    for i in range(3):
        assert agent.learn(_state(0.3 + 0.1 * i), i, 10.0, _state(0.5), False, False) is None
    assert agent.update_steps == 0

    for step in range(1, 4):
        loss = agent.learn(_state(0.4), 1, 10.0, _state(0.5), False, False)
        assert isinstance(loss, float) and np.isfinite(loss)
        assert agent.update_steps == step
        if step < 3:
            for k, v in agent._target_net.state_dict().items():
                assert torch.equal(v, init_target[k])

    assert any(
        not torch.equal(v, init_online[k]) for k, v in agent._online_net.state_dict().items()
    )
    for k, v in agent._target_net.state_dict().items():
        assert torch.equal(v, agent._online_net.state_dict()[k])


def test_bellman_target_masks_only_terminated_not_truncated() -> None:
    # With zeroed weights except constant bias=5.0, Q(s,a)=5.0 for all (s,a).
    # Reward=0, gamma=0.9:
    # - terminated=True  -> target=0.0  -> MSE loss = (5 - 0)^2 = 25.0
    # - truncated=True   -> target=4.5  -> MSE loss = (5 - 4.5)^2 = 0.25
    def _agent_with_constant_q(val: float) -> DQNAgent:
        agent = DQNAgent(_small_config(batch_size=1, gamma=0.9, loss="mse"), seed=0)
        with torch.no_grad():
            for net in (agent._online_net, agent._target_net):
                for param in net.parameters():
                    param.zero_()
                net.net[-1].bias.fill_(val)
        return agent

    a_term = _agent_with_constant_q(5.0)
    a_trunc = _agent_with_constant_q(5.0)
    loss_term = a_term.learn(_state(0.5), 0, 0.0, _state(0.5), terminated=True, truncated=False)
    loss_trunc = a_trunc.learn(_state(0.5), 0, 0.0, _state(0.5), terminated=False, truncated=True)
    assert loss_term == pytest.approx(25.0, rel=1e-4)
    assert loss_trunc == pytest.approx(0.25, rel=1e-4)


def test_end_episode_decays_epsilon_and_respects_floor() -> None:
    agent = DQNAgent(_small_config(epsilon_start=1.0, epsilon_end=0.2, epsilon_decay=0.5), seed=0)
    assert agent.epsilon == 1.0
    agent.end_episode()
    assert agent.epsilon == pytest.approx(0.5)
    agent.end_episode()
    assert agent.epsilon == pytest.approx(0.25)
    agent.end_episode()
    assert agent.epsilon == pytest.approx(0.2)


def test_save_load_and_from_checkpoint_preserve_policy(tmp_path: Path) -> None:
    agent = DQNAgent(_small_config(hidden_sizes=[24, 12]), seed=11)
    for i in range(10):
        agent.learn(_state(0.2 + 0.05 * i), i % 6, float(i), _state(0.5), i == 9, False)
    agent.end_episode()

    ckpt = agent.save(tmp_path / "sub" / "dqn.pt")
    assert ckpt.is_file()

    reloaded = DQNAgent.from_checkpoint(ckpt)
    assert reloaded.epsilon == pytest.approx(agent.epsilon)
    assert reloaded.update_steps == agent.update_steps
    rng = np.random.default_rng(123)
    for _ in range(20):
        s = rng.uniform(0.0, 1.0, size=7).astype(np.float32)
        assert reloaded.select_action(s, training=False) == agent.select_action(s, training=False)

    mismatched = DQNAgent(_small_config(hidden_sizes=[8, 8]), seed=11)
    with pytest.raises(ValueError, match="architecture"):
        mismatched.load(ckpt)


def test_same_seed_reproduces_losses_and_actions() -> None:
    cfg = _small_config(batch_size=4, target_update_steps=2)
    a = DQNAgent(cfg, seed=77)
    b = DQNAgent(cfg, seed=77)
    losses_a, losses_b = [], []
    for i in range(12):
        s = _state(0.2 + 0.04 * i)
        ns = _state(0.25 + 0.04 * i)
        losses_a.append(a.learn(s, i % 6, 5.0 - i, ns, i == 11, False))
        losses_b.append(b.learn(s, i % 6, 5.0 - i, ns, i == 11, False))
    assert losses_a == losses_b
    assert a.select_action(_state(0.5), training=False) == b.select_action(
        _state(0.5), training=False
    )


def test_dqn_learns_optimal_action_on_synthetic_bandit() -> None:
    for overrides in ({}, {"loss": "huber", "double_dqn": True}):
        agent = DQNAgent(
            _small_config(
                batch_size=8,
                replay_buffer_size=256,
                learning_rate=0.01,
                hidden_sizes=[32],
                **overrides,
            ),
            seed=5,
        )
        s = _state(0.35)
        for step in range(200):
            action = step % 6
            reward = 20.0 if action == 2 else -5.0
            agent.learn(s, action, reward, s, terminated=True, truncated=False)
        assert agent.select_action(s, training=False) == 2


def test_dqn_runs_with_real_agriwater_env() -> None:
    env = AgriWaterEnv(scenario="random", max_days=10)
    agent = DQNAgent(_small_config(batch_size=4), seed=42)
    losses = []
    try:
        for ep in range(3):
            state, _ = env.reset(seed=42 + ep)
            done = False
            while not done:
                action = agent.select_action(state, training=True)
                next_state, reward, terminated, truncated, _ = env.step(action)
                loss = agent.learn(state, action, reward, next_state, terminated, truncated)
                if loss is not None:
                    losses.append(loss)
                state = next_state
                done = terminated or truncated
            agent.end_episode()
    finally:
        env.close()
    assert losses and all(np.isfinite(x) for x in losses)
