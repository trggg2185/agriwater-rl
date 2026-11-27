"""Test lớp HTTP mỏng bọc môi trường: không kiểm tra lại công thức nước/điểm.

Điều cần khoá ở đây là hợp đồng với dashboard 2D: dạng payload,
ánh xạ lít → action, và các mã lỗi mà client dựa vào để quyết định.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agriwater.api import runtime
from agriwater.api.app import app

client = TestClient(app)


def test_health_reports_ok() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_meta_matches_environment_contract() -> None:
    body = client.get("/api/meta").json()
    assert body["schema"] == runtime.SCHEMA
    assert body["meta"]["actionLiters"] == [0, 5, 10, 15, 20, 25]
    assert body["meta"]["maxDays"] == 30
    assert body["meta"]["moisture"]["stressBounds"] == [0.2, 0.85]
    assert [scenario["key"] for scenario in body["scenarios"]] == list(runtime.SCENARIOS)
    assert body["source"]["config"]


def test_session_starts_with_one_day() -> None:
    body = client.post("/api/session", json={"scenario": "dry", "seed": 42, "crop": 0}).json()
    assert body["session_id"]
    assert body["schema"] == runtime.SCHEMA
    assert len(body["series"]) == 1
    record = body["series"][0]
    assert record["day"] == 1
    assert record["action"] == 0
    assert record["waterLiters"] == 0
    # Bối cảnh quyết định + kết quả cuối ngày đều có mặt cho panel.
    for key in (
        "moisture",
        "previousMoisture",
        "stage",
        "temperature",
        "rainProbability",
        "rainForecastMm",
        "lastIrrigation",
        "reward",
        "rewardParts",
        "isIdeal",
        "isStressed",
    ):
        assert key in record, key


def test_step_maps_action_to_liters_and_advances_day() -> None:
    session = client.post("/api/session", json={"scenario": "dry", "seed": 42}).json()
    session_id = session["session_id"]

    body = client.post("/api/step", json={"session_id": session_id, "action": 3}).json()
    assert len(body["series"]) == 2
    last = body["series"][-1]
    assert last["day"] == 2
    assert last["action"] == 3
    assert last["waterLiters"] == 15.0
    # Độ ẩm đầu ngày của bản ghi mới = độ ẩm cuối ngày trước đó.
    assert last["previousMoisture"] == body["series"][0]["moisture"]
    assert set(last["rewardParts"]) == {
        "R_health",
        "R_stress",
        "R_water",
        "R_waste",
        "R_rain",
        "R_delay",
    }


def test_session_can_start_on_day_18_and_continue_with_manual_irrigation() -> None:
    response = client.post(
        "/api/session", json={"scenario": "dry", "seed": 42, "crop": 1, "start_day": 18}
    )
    assert response.status_code == 200
    state = response.json()
    assert state["day"] == 18
    assert [record["day"] for record in state["series"]] == list(range(1, 19))
    for record in state["series"]:
        expected = (
            runtime.BASELINE_ACTION
            if record["previousMoisture"] < runtime.BASELINE_THRESHOLD
            else 0
        )
        assert record["action"] == expected

    response = client.post("/api/step", json={"session_id": state["session_id"], "action": 3})
    assert response.status_code == 200
    assert response.json()["series"][:18] == state["series"]
    assert response.json()["series"][-1]["waterLiters"] == 15


def test_session_rejects_start_day_beyond_season() -> None:
    response = client.post("/api/session", json={"start_day": 31})
    assert response.status_code == 422


def test_automatic_step_uses_baseline_when_soil_is_dry() -> None:
    state = client.post("/api/session", json={"scenario": "dry", "seed": 42, "crop": 1}).json()
    session_id = state["session_id"]
    for _ in range(8):
        if state["series"][-1]["moisture"] < runtime.BASELINE_THRESHOLD:
            break
        state = client.post("/api/step", json={"session_id": session_id, "action": 0}).json()
    assert state["series"][-1]["moisture"] < runtime.BASELINE_THRESHOLD

    response = client.post(
        "/api/step", json={"session_id": session_id, "action": 0, "automatic": True}
    )
    assert response.status_code == 200
    assert response.json()["series"][-1]["action"] == runtime.BASELINE_ACTION


def test_no_water_means_zero_liters() -> None:
    session = client.post("/api/session", json={"scenario": "dry", "seed": 7}).json()
    body = client.post("/api/step", json={"session_id": session["session_id"], "action": 0}).json()
    last = body["series"][-1]
    assert last["action"] == 0
    assert last["waterLiters"] == 0
    assert last["rewardParts"]["R_water"] == 0


def test_invalid_action_is_rejected() -> None:
    session = client.post("/api/session", json={"scenario": "dry", "seed": 42}).json()
    for action in (-1, 6, 99):
        response = client.post(
            "/api/step", json={"session_id": session["session_id"], "action": action}
        )
        assert response.status_code == 422


def test_unknown_session_is_404() -> None:
    response = client.post("/api/step", json={"session_id": "khong-ton-tai", "action": 1})
    assert response.status_code == 404


def test_finished_episode_returns_409() -> None:
    """Tưới 25 L liên tục thì cây úng và ván đóng — client phải biết để mở ván mới."""
    session = client.post("/api/session", json={"scenario": "dry", "seed": 42}).json()
    session_id = session["session_id"]

    statuses = []
    for _ in range(40):
        response = client.post("/api/step", json={"session_id": session_id, "action": 5})
        statuses.append(response.status_code)
        if response.status_code == 409:
            break

    assert 409 in statuses
    assert statuses[-1] == 409


def test_sessions_are_isolated() -> None:
    first = client.post("/api/session", json={"scenario": "dry", "seed": 42}).json()
    second = client.post("/api/session", json={"scenario": "dry", "seed": 42}).json()
    assert first["session_id"] != second["session_id"]

    client.post("/api/step", json={"session_id": first["session_id"], "action": 4})
    # Ván thứ hai vẫn ở ngày 1 dù cùng kịch bản/seed.
    assert len(second["series"]) == 1
    again = client.post("/api/step", json={"session_id": second["session_id"], "action": 0}).json()
    assert again["series"][-1]["day"] == 2


def test_payload_is_deterministic_for_same_seed() -> None:
    first = client.post("/api/session", json={"scenario": "dry", "seed": 5}).json()
    second = client.post("/api/session", json={"scenario": "dry", "seed": 5}).json()
    assert first["series"][0]["moisture"] == second["series"][0]["moisture"]
    assert first["series"][0]["temperature"] == second["series"][0]["temperature"]


def test_session_uses_initial_observation_and_uploaded_weather() -> None:
    weather = [
        {"temperature": 29, "rain_probability": 0.4, "rain_forecast_mm": 4, "actual_rain_mm": 2}
        for _ in range(31)
    ]
    response = client.post(
        "/api/session",
        json={
            "crop": 1,
            "initial_state": {
                "growth_stage": 1,
                "soil_moisture": 0.62,
                "temperature": 31,
                "rain_probability": 0.5,
                "rain_forecast_mm": 6,
                "last_irrigation_liters": 10,
            },
            "weather": weather,
        },
    )
    assert response.status_code == 200, response.text
    first = response.json()["series"][0]
    assert (first["crop"], first["stage"], first["previousMoisture"]) == (1, 1, 0.62)
    assert (
        first["temperature"],
        first["rainProbability"],
        first["rainForecastMm"],
    ) == pytest.approx((31, 0.5, 6))
    assert (first["lastIrrigation"], first["actualRainMm"]) == pytest.approx((10, 2))
    result = client.post(
        "/api/step", json={"session_id": response.json()["session_id"], "action": 0}
    )
    assert result.json()["series"][-1]["temperature"] == pytest.approx(29)
    assert client.post("/api/session", json={"weather": weather[:-1]}).status_code == 422


def test_scenario_supplies_blank_weather_and_honors_first_day_rain() -> None:
    body = {"scenario": "stormy", "seed": 42, "crop": 1, "start_day": 2}
    generated = client.post("/api/session", json=body).json()["series"]
    response = client.post(
        "/api/session",
        json={
            **body,
            "initial_state": {"growth_stage": 0, "soil_moisture": 0.45, "actual_rain_mm": 22},
        },
    )
    assert response.status_code == 200, response.text
    custom = response.json()["series"]
    assert custom[0]["temperature"] == generated[0]["temperature"]
    assert custom[0]["rainProbability"] == generated[0]["rainProbability"]
    assert custom[0]["rainForecastMm"] == generated[0]["rainForecastMm"]
    assert custom[0]["actualRainMm"] == 22
    assert custom[1]["actualRainMm"] == generated[1]["actualRainMm"]


def test_weather_changes_future_days_without_rewriting_episode() -> None:
    body = client.post("/api/session", json={"scenario": "dry", "seed": 42, "crop": 1}).json()
    session_id = body["session_id"]
    request = {"session_id": session_id, "day": 2, "mode": "storm"}
    response = client.post("/api/weather", json=request)
    assert response.status_code == 200
    assert response.json()["upcomingWeather"] == {
        "day": 2,
        "mode": "storm",
        "temperature": 25,
        "rainProbability": 0.95,
        "rainForecastMm": 25,
        "actualRainMm": 22,
    }
    result = client.post("/api/step", json={"session_id": session_id, "action": 0}).json()
    assert result["series"][:1] == body["series"]
    assert result["day"] == 2
    assert result["series"][1]["actualRainMm"] == 22
    assert result["series"][1]["temperature"] == pytest.approx(25)
    assert result["series"][1]["rainProbability"] == pytest.approx(0.95)
    assert result["upcomingWeather"]["mode"] == "storm"
    assert client.post("/api/weather", json=request).status_code == 409


def test_random_weather_uses_seed_and_updates_each_next_day() -> None:
    session = client.post("/api/session", json={"scenario": "dry", "seed": 42, "crop": 1}).json()
    session_id = session["session_id"]
    request = {"session_id": session_id, "day": 2, "mode": "random"}
    forecast = client.post("/api/weather", json=request).json()["upcomingWeather"]
    assert client.post("/api/weather", json=request).json()["upcomingWeather"] == forecast
    result = client.post("/api/step", json={"session_id": session_id, "action": 0}).json()
    assert result["series"][1]["actualRainMm"] == pytest.approx(forecast["actualRainMm"])
    assert result["upcomingWeather"]["day"] == 3
    assert result["upcomingWeather"]["temperature"] != forecast["temperature"]


@pytest.mark.parametrize(
    ("algorithm", "path_attr", "filename"),
    [
        ("q_learning", "DEFAULT_Q_TABLE_PATH", "q_table.npz"),
        ("dqn", "DEFAULT_DQN_PATH", "dqn_best.pt"),
    ],
)
def test_training_publishes_model_for_session_and_experiment(
    algorithm: str,
    path_attr: str,
    filename: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = tmp_path / filename
    monkeypatch.setattr(runtime, path_attr, model)
    inputs = {"policy": algorithm, "scenario": "dry", "seed": 429, "crop": 1}
    assert algorithm not in client.get("/api/meta").json()["availablePolicies"]
    assert client.post("/api/session", json=inputs).status_code == 503

    response = client.post(
        "/api/training",
        json={
            "algorithm": algorithm,
            "scenario": "dry",
            "seed": 41,
            "total_timesteps": 101,
            "learning_rate": 0.001,
        },
    )
    assert response.status_code == 202
    url = f"/api/training/{response.json()['id']}"
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        progress = client.get(url).json()
        if progress["status"] != "running":
            break
        time.sleep(0.05)

    assert progress["status"] == "completed", progress["error"]
    assert model.is_file()
    assert progress["timesteps"] == progress["targetTimesteps"] == 101
    assert progress["completedEpisodes"] >= 4
    assert client.get(url, params={"after": 2}).json()["series"] == progress["series"][2:]
    assert algorithm in client.get("/api/meta").json()["availablePolicies"]

    first = client.post("/api/experiment", json=inputs).json()
    second = client.post("/api/experiment", json=inputs).json()
    assert first["series"] == second["series"]
    assert first["source"]["policy"] == algorithm
    assert "session_id" not in first
    assert first["series"][-1]["terminated"] or first["series"][-1]["truncated"]

    response = client.post("/api/session", json=inputs)
    assert response.status_code == 200
    session = response.json()
    assert session["series"][0] == first["series"][0]
    response = client.post(
        "/api/step",
        json={
            "session_id": session["session_id"],
            "action": 0,
            "automatic": True,
        },
    )
    assert response.status_code == 200
    assert response.json()["series"] == first["series"][:2]


def test_corrupt_checkpoint_does_not_disable_baseline(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    model = tmp_path / "q_table.npz"
    model.write_text("not a checkpoint")
    monkeypatch.setattr(runtime, "DEFAULT_Q_TABLE_PATH", model)
    response = client.get("/api/meta")
    assert response.status_code == 200
    policies = {policy["key"]: policy for policy in response.json()["policies"]}
    assert policies["baseline"]["available"]
    assert not policies["q_learning"]["available"]
    assert "Không đọc được" in policies["q_learning"]["reason"]
    assert client.post("/api/experiment", json={"policy": "baseline"}).status_code == 200
