"""Bố cục 7 chiều của vector trạng thái — một chỗ khai báo duy nhất.

Vector trạng thái là toàn bộ thứ agent được phép "nhìn thấy" ở mỗi ngày. Cả 7
chiều đều đã chuẩn hoá về [0, 1]; đơn vị thật (mã, %, °C, mm, lít) chỉ được
dựng lại khi hiển thị. Bảng này là hợp đồng chung: `agriwater_env` ghi vào,
`reward` đọc để tính điểm, `agriwater.api.runtime` đọc để dịch ra số người đọc.

    #  Tên hằng           Ý nghĩa                       Đơn vị gốc   Chuẩn hoá
    -  ------------------  ----------------------------  -----------  ------------
    0  CROP_TYPE           loại cây trồng (0…3)          mã           code / 3
    1  GROWTH_STAGE        giai đoạn sinh trưởng (0…3)   mã           code / 3
    2  SOIL_MOISTURE       độ ẩm đất có rễ               0…1 (0-100%) giữ nguyên
    3  TEMPERATURE         nhiệt độ không khí            15…45 °C     (t − 15) / 30
    4  RAIN_PROBABILITY    xác suất mưa 24 giờ tới       0…1 (0-100%) giữ nguyên
    5  RAIN_FORECAST_MM    lượng mưa dự báo              0…50 mm      mm / 50
    6  LAST_IRRIGATION     lần tưới gần nhất (lượng nước) 0…25 lít    lít / 25

Vì sao phải đặt tên: chỉ số trần (`obs[2]`, `/25`, `/50`) không cho biết đó là
đại lượng gì. Khi mọi chỗ đọc đi qua các hằng số dưới đây, đổi thứ tự một chiều
chỉ cần sửa file này, và chỗ nào còn đọc sai sẽ lộ ra ngay khi chạy test.

Lưu ý: `observation_space` của môi trường chỉ là cái khuôn (7 phần tử trong
[0, 1]). Giá trị thật của một ván nằm trong `AgriWaterEnv._state`, được
`build_observation` dựng nên ở `reset()`.
"""

from __future__ import annotations

import numpy as np

# --------------------------------------------------------------------------- #
# Tên từng chiều
# --------------------------------------------------------------------------- #
CROP_TYPE = 0
GROWTH_STAGE = 1
SOIL_MOISTURE = 2
TEMPERATURE = 3
RAIN_PROBABILITY = 4
RAIN_FORECAST_MM = 5
LAST_IRRIGATION = 6

#: Số chiều của vector trạng thái (`observation_space.shape`).
OBSERVATION_SIZE = 7

# --------------------------------------------------------------------------- #
# Hằng số chuẩn hoá — phải khớp `AgriWaterEnv._validate_config` và weather.py
# --------------------------------------------------------------------------- #
#: Số mã rời rạc cho crop_type và growth_stage (0, 1, 2, 3).
CODE_COUNT = 3

#: Nhiệt độ thấp nhất/cao nhất mà môi trường chấp nhận, tính bằng °C.
TEMPERATURE_MIN_C = 15.0
TEMPERATURE_MAX_C = 45.0

#: Lượng mưa dự báo lớn nhất, mm/ngày.
RAIN_FORECAST_MAX_MM = 50.0

#: Mức tưới lớn nhất trong 6 hành động, lít/ngày.
IRRIGATION_MAX_LITERS = 25.0


# --------------------------------------------------------------------------- #
# Mã hoá / giải mã từng chiều
# --------------------------------------------------------------------------- #
def encode_code(code: int) -> float:
    """Mã rời rạc 0…3 → 0.0, 1/3, 2/3, 1.0."""
    return float(code) / CODE_COUNT


def decode_code(value: float) -> int:
    """0.0…1.0 → mã rời rạc gần nhất. Không kiểm tra khoảng (reward tự kiểm)."""
    return int(round(float(value) * CODE_COUNT))


def encode_temperature(celsius: float) -> float:
    """15…45 °C → 0…1."""
    return (float(celsius) - TEMPERATURE_MIN_C) / (TEMPERATURE_MAX_C - TEMPERATURE_MIN_C)


def decode_temperature(value: float) -> float:
    """0…1 → °C."""
    return float(value) * (TEMPERATURE_MAX_C - TEMPERATURE_MIN_C) + TEMPERATURE_MIN_C


def encode_rain_forecast(millimetres: float) -> float:
    """0…50 mm → 0…1."""
    return float(millimetres) / RAIN_FORECAST_MAX_MM


def decode_rain_forecast(value: float) -> float:
    """0…1 → mm."""
    return float(value) * RAIN_FORECAST_MAX_MM


def encode_irrigation(liters: float) -> float:
    """0…25 lít → 0…1."""
    return float(liters) / IRRIGATION_MAX_LITERS


def decode_irrigation(value: float) -> float:
    """0…1 → lít."""
    return float(value) * IRRIGATION_MAX_LITERS


# --------------------------------------------------------------------------- #
# Dựng vector trạng thái
# --------------------------------------------------------------------------- #
def build_observation(
    *,
    crop_type: int,
    growth_stage: int,
    soil_moisture: float,
    temperature_c: float = TEMPERATURE_MIN_C,
    rain_probability: float = 0.0,
    rain_forecast_mm: float = 0.0,
    last_irrigation_liters: float = 0.0,
) -> np.ndarray:
    """Dựng vector 7 chiều từ đơn vị THẬT (mã, %, °C, mm, lít).

    `AgriWaterEnv.reset()` truyền thời tiết của ngày 0.
    `AgriWaterEnv.step()` truyền dự báo của ngày mới và lượng vừa tưới.
    """
    state = np.zeros(OBSERVATION_SIZE, dtype=np.float32)
    state[CROP_TYPE] = encode_code(crop_type)
    state[GROWTH_STAGE] = encode_code(growth_stage)
    state[SOIL_MOISTURE] = soil_moisture
    state[TEMPERATURE] = encode_temperature(temperature_c)
    state[RAIN_PROBABILITY] = rain_probability
    state[RAIN_FORECAST_MM] = encode_rain_forecast(rain_forecast_mm)
    state[LAST_IRRIGATION] = encode_irrigation(last_irrigation_liters)
    return state
