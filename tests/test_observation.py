"""Bố cục 7 chiều có tên: hợp đồng chung giữa env, reward và API."""

import numpy as np
import pytest

from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.observation import (
    CODE_COUNT,
    CROP_TYPE,
    GROWTH_STAGE,
    LAST_IRRIGATION,
    OBSERVATION_SIZE,
    RAIN_FORECAST_MAX_MM,
    RAIN_FORECAST_MM,
    RAIN_PROBABILITY,
    SOIL_MOISTURE,
    TEMPERATURE,
    build_observation,
    decode_code,
    decode_irrigation,
    decode_rain_forecast,
    decode_temperature,
    encode_code,
    encode_irrigation,
    encode_rain_forecast,
    encode_temperature,
)

_NAMES = (
    CROP_TYPE,
    GROWTH_STAGE,
    SOIL_MOISTURE,
    TEMPERATURE,
    RAIN_PROBABILITY,
    RAIN_FORECAST_MM,
    LAST_IRRIGATION,
)


def test_named_indices_cover_every_dimension_once() -> None:
    """Bảy tên phải trỏ vào bảy vị trí 0…6, không trùng, không thiếu."""
    assert sorted(_NAMES) == list(range(OBSERVATION_SIZE))
    assert OBSERVATION_SIZE == 7


def test_build_observation_lays_out_human_units_in_named_slots() -> None:
    state = build_observation(
        crop_type=1,
        growth_stage=2,
        soil_moisture=0.5,
        temperature_c=30.0,
        rain_probability=0.8,
        rain_forecast_mm=10.0,
        last_irrigation_liters=5.0,
    )
    assert state.shape == (OBSERVATION_SIZE,)
    assert state.dtype == np.float32
    assert decode_code(state[CROP_TYPE]) == 1
    assert decode_code(state[GROWTH_STAGE]) == 2
    assert float(state[SOIL_MOISTURE]) == pytest.approx(0.5)
    assert decode_temperature(state[TEMPERATURE]) == pytest.approx(30.0)
    assert float(state[RAIN_PROBABILITY]) == pytest.approx(0.8)
    assert decode_rain_forecast(state[RAIN_FORECAST_MM]) == pytest.approx(10.0)
    assert decode_irrigation(state[LAST_IRRIGATION]) == pytest.approx(5.0)


def test_encode_decode_round_trip_inside_declared_ranges() -> None:
    for code in range(CODE_COUNT + 1):
        assert decode_code(encode_code(code)) == code
    for celsius in (15.0, 22.5, 45.0):
        assert decode_temperature(encode_temperature(celsius)) == pytest.approx(celsius)
    for millimetres in (0.0, 12.5, RAIN_FORECAST_MAX_MM):
        assert decode_rain_forecast(encode_rain_forecast(millimetres)) == pytest.approx(millimetres)
    for liters in (0.0, 5.0, 25.0):
        assert decode_irrigation(encode_irrigation(liters)) == pytest.approx(liters)


def test_encoding_stays_inside_unit_interval() -> None:
    assert encode_code(0) == 0.0 and encode_code(CODE_COUNT) == 1.0
    assert encode_temperature(15.0) == 0.0 and encode_temperature(45.0) == 1.0
    assert encode_rain_forecast(0.0) == 0.0
    assert encode_rain_forecast(RAIN_FORECAST_MAX_MM) == 1.0
    assert encode_irrigation(0.0) == 0.0 and encode_irrigation(25.0) == 1.0


def test_reset_and_step_write_into_the_named_slots(monkeypatch) -> None:
    """Env thật: giá trị khởi tạo và lần tưới phải rơi đúng ô đã đặt tên."""
    from agriwater.dashboard.demo_config import build_demo_config
    from agriwater.environment import agriwater_env

    monkeypatch.setattr(agriwater_env, "calculate_reward", lambda s, a, n, **kwargs: (0.0, {}))
    config = build_demo_config()
    weather = [
        dict(temperature=27.0, rain_probability=0.25, rain_forecast_mm=10.0, actual_rain_mm=0.0)
    ] * (int(config["max_days"]) + 1)
    env = AgriWaterEnv(config=config)
    try:
        state, info = env.reset(
            seed=3,
            options={
                "crop_type": 2,
                "growth_stage": 1,
                "soil_moisture": 0.5,
                "weather": weather,
            },
        )
        assert decode_code(state[CROP_TYPE]) == 2
        assert decode_code(state[GROWTH_STAGE]) == 1
        assert float(state[SOIL_MOISTURE]) == pytest.approx(0.5)
        assert decode_temperature(state[TEMPERATURE]) == pytest.approx(27.0)
        assert float(state[RAIN_PROBABILITY]) == pytest.approx(0.25)
        assert decode_rain_forecast(state[RAIN_FORECAST_MM]) == pytest.approx(10.0)
        assert decode_irrigation(state[LAST_IRRIGATION]) == pytest.approx(0.0)
        assert info["soil_moisture"] == pytest.approx(0.5)

        # action 4 = 20 L, nên chiều "lần tưới gần nhất" phải là 20/25.
        following, _, _, _, info = env.step(4)
        assert decode_irrigation(following[LAST_IRRIGATION]) == pytest.approx(20.0)
        assert float(following[SOIL_MOISTURE]) == pytest.approx(info["soil_moisture"])
    finally:
        env.close()
