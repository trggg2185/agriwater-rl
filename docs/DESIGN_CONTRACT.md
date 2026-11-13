# Hợp đồng kỹ thuật AgriWater-RL

**Cập nhật triển khai của Trưởng:** xem TRUONG_HANDOFF.md về schema vật lý đề xuất,
công thức, reset/step/render đã viết và trạng thái tích hợp. Observation/action và
reward không đổi. Thêm render_mode=None|"ansi" tùy chọn; render trả str|None.
Giá trị vật lý vẫn chưa chốt; loader/reward thuộc Minh và chưa triển khai.

Trưởng và Minh phải thống nhất trước khi thay đổi API, ý nghĩa dữ liệu hoặc cấu hình.
Python sử dụng **3.13** theo quyết định của người dùng, thay cho 3.12 trong Prompt.md.
Đây là bootstrap, chưa có mô hình nông học hay thuật toán hoàn chỉnh.

## Trạng thái triển khai

- `agriwater/config.py`: `load_config(name)` đã triển khai và có test.
- `agriwater/agents/reward.py`: sáu thành phần reward đã triển khai và có test biên.
- `agriwater/environment/demo.py`: vòng lặp demo, CLI và CSV đã triển khai; unit test
  dùng environment giả, chờ chạy thật sau khi merge environment.
- `agriwater/environment/agriwater_env.py` và `weather.py`: bản triển khai nằm ở
  nhánh `feature/environment` (xem `docs/TRUONG_HANDOFF.md` trên nhánh đó). Trên
  `main` và `feature/reward-demo` hiện vẫn là stub; chưa merge.
- Các khóa vật lý và phân phối weather trong YAML vẫn `null`. Bảng "Đề xuất v0.1"
  bên dưới là đề xuất để chạy thử, **chưa phải cấu hình đã chốt**; không coi `null` là 0.
- Tại thời điểm cập nhật, nhánh `feature/reward-demo` có 135 passed, 1 skipped;
  skip duy nhất là `check_env` thuộc phần environment. Nhánh `feature/environment`
  báo 28 passed, 2 skipped tại bàn giao. Luôn chạy lại trên nhánh đang làm.

## Observation và action

Observation là `np.ndarray`, `dtype=np.float32`, `shape=(7,)`.
`spaces.Box(low=0.0, high=1.0, shape=(7,), dtype=np.float32)`.

| Index | Thuộc tính | Miền thực tế | Chuẩn hóa | Nguồn / cập nhật |
|---|---|---|---|---|
| 0 | crop_type | số nguyên 0–3 | crop_type / 3 | reset hoặc options |
| 1 | growth_stage | số nguyên 0–3 | growth_stage / 3 | reset; tăng theo ngày |
| 2 | soil_moisture | 0–1 | giữ nguyên | reset; cân bằng nước mỗi step |
| 3 | temperature | 15–45 °C | (temperature − 15) / 30 | weather[day] |
| 4 | rain_probability | 0–1 | giữ nguyên | weather[day] |
| 5 | rain_forecast_mm | 0–50 mm | rain_forecast_mm / 50 | weather[day] |
| 6 | last_irrigation | 0–25 lít | last_irrigation / 25 | lượng tưới của step trước |

Không đổi thứ tự, số chiều hay chuẩn hóa. Giải mã trước khi xử lý nghiệp vụ:

```text
crop_type      = round(observation[0] * 3)
growth_stage   = round(observation[1] * 3)
rain_forecast  = observation[5] * 50   # mm
last_irrigation = observation[6] * 25  # lít
```

Không so sánh growth_stage đã chuẩn hóa với số nguyên 2. Reward kiểm tra shape,
dtype, miền hữu hạn và mã cây/giai đoạn; environment kiểm tra thêm options/weather.

`spaces.Discrete(6)`: action 0, 1, 2, 3, 4, 5 tương ứng 0, 5, 10, 15, 20, 25 lít.
Action là chỉ số; water_liters là thể tích. Ánh xạ nằm trong `action_liters` của
`configs/environment.yaml`, không hardcode trong agent hay demo.

## Khởi tạo và reset

- `reset(*, seed=None, options=None) -> (observation, info)`; phải gọi
  `super().reset(seed=seed)` để Gymnasium quản lý RNG.
- Options hợp lệ: `crop_type`, `growth_stage`, `soil_moisture`, `weather`.
  Từ chối tên options khác thay vì bỏ qua âm thầm.
- Không truyền options thì đọc `initial_state` trong `environment.yaml`.
- `weather` là list `max_days + 1` bản ghi. Không truyền thì gọi
  `generate_weather(scenario, max_days + 1, seed=...)` trước khi agent hành động.
- Cùng seed và cùng options phải cho cùng observation đầu và cùng chuỗi weather.
- Reset info: `day=0`, nước tưới/mưa bằng 0, `reward_components={}` vì chưa có action.

Đề xuất v0.1 (chưa chốt): `crop_type=0`, `growth_stage=0`,
`soil_moisture ~ Uniform(0.35, 0.55)`.

## Thời gian và Gymnasium

Một step = một ngày; mặc định tối đa 30 ngày/episode. Đây là quy ước mô phỏng,
không phải thông số đã được kiểm chứng bằng dữ liệu thực địa.

- `step(action)` trả `(observation, reward, terminated, truncated, info)`.
- `terminated=True` cho kết thúc sinh học; `truncated=True` khi đạt `max_days`.
- Không dùng hai cờ thay thế nhau. Nếu cả hai cùng đúng, ưu tiên
  `terminated=True` và `truncated=False`.
- Phải `reset` trước `step` và sau khi episode kết thúc; step sau kết thúc phải lỗi rõ.
- `render_mode=None | "ansi"`: `render()` trả `None` hoặc chuỗi, không mở cửa sổ.

Info tối thiểu:

| Khóa | Ý nghĩa |
|---|---|
| `day` | số ngày đã chạy sau step |
| `water_used_liters` | lượng tưới của bước hiện tại |
| `actual_rain_mm` | mưa thực của bước hiện tại |
| `soil_moisture` | độ ẩm sau bước |
| `is_ideal` | độ ẩm sau bước nằm trong khoảng lý tưởng |
| `is_stressed` | độ ẩm sau bước ngoài `stress_bounds` |
| `reward_components` | đúng sáu khóa của `calculate_reward` |

Bản environment hiện thêm `water_balance` để kiểm tra đơn vị. Có thể bổ sung
`growth_stage` và `termination_reason` khi hai người thống nhất; đây là thay đổi
schema nên phải ghi trong PR và cập nhật demo/test.

## Thời tiết công bằng

Ba kịch bản: dry (khô hạn), stormy (mưa nhiều), random (ngẫu nhiên).
`generate_weather(scenario, days, *, seed) -> list[WeatherDay]` tạo trước toàn bộ
chuỗi, gồm `temperature` (°C), `rain_probability`, `rain_forecast_mm`,
`actual_rain_mm`. Dùng `np.random.default_rng(seed)` riêng; không dùng RNG của agent
và không sinh lại weather theo action.

Ngày `t` dùng dự báo/nhiệt độ của bản ghi `t` cho state trước action; chuyển
`t → t+1` dùng `actual_rain_mm` của chính bản ghi `t`. Bản ghi cuối chỉ cung cấp
thời tiết observation cuối. Không lộ `actual_rain_mm` trước khi agent chọn action.
Sao chép chuỗi caller truyền vào để không sửa dữ liệu của người gọi.

Công thức v0.1 đang dùng trong nhánh environment (cần review):

```text
temperature      ~ Uniform(range_c)
rain_probability ~ Uniform(range_p)
rain_forecast_mm ~ Uniform(range_mm)
rain_occurs      = rng.random() < rain_probability
actual_rain_mm   = rain_forecast_mm nếu rain_occurs, ngược lại 0
```

Đây là mô hình đơn giản, chưa có sai số dự báo hay tương quan nhiều ngày; không
phải dữ liệu thực địa và không được gọi là FAO-56.

## Reward duy nhất

`calculate_reward(state, action, next_state) -> tuple[float, dict[str, float]]`
trong `agents/reward.py`. Environment phải gọi hàm này, không có reward thứ hai.
Các thành phần không thỏa điều kiện có giá trị 0; tổng bằng tổng dictionary.

| Khóa | Điều kiện và giá trị |
|---|---|
| R_health | +10 nếu độ ẩm next_state trong khoảng lý tưởng (bao gồm hai biên) |
| R_stress | −100 nếu độ ẩm next_state < 0,20 hoặc > 0,85 |
| R_water | −2 × action |
| R_waste | −10 × action nếu độ ẩm state ≥ 0,60 và action > 0 |
| R_rain | −5 × action nếu dự báo state có xác suất ≥ 0,70 và lượng ≥ 15 mm, action > 0 |
| R_delay | −8 × action nếu last_irrigation của state ≥ 12,5 lít và action > 0 |

Khoảng lý tưởng: giai đoạn 2 là [0,50; 0,75], còn lại [0,40; 0,70].
Dùng giai đoạn next_state cho R_health; dùng state cho waste/rain/delay.
Dự báo và lần tưới trước phải giải chuẩn hóa (nhân 50 và 25).

Quy tắc triển khai:

- Hệ số nằm duy nhất trong `configs/environment.yaml` mục `reward` và `moisture`;
  reward đọc một lần mỗi process bằng `lru_cache`. Khi test hoặc đổi cấu hình phải
  gọi `_reward_settings.cache_clear()`; không sửa YAML giữa episode.
- Validate `state`/`next_state` là `np.ndarray`, shape `(7,)`, `float32`, finite,
  trong `[0,1]`; action là số nguyên 0–5, `bool` không hợp lệ.
- So sánh ngưỡng bằng `np.float32(...)`, không dùng epsilon rộng làm đổi nghĩa điều kiện.
- Luôn trả đủ sáu khóa, kể cả khi bằng 0; không sửa array đầu vào.
- Ví dụ chuẩn: moisture 0,60; p 0,70; forecast 15 mm; last 12,5 L; action 2;
  next moisture 0,90 → health 0, stress −100, water −4, waste −20, rain −10,
  delay −16, tổng −150.

## Chuyển trạng thái

Nước sau bước = Nước trước bước + nước tưới hiệu dụng + nước mưa hiệu dụng
− bốc thoát hơi − tiêu thoát. Đổi đơn vị trước khi cộng: 1 mm mưa trên 1 m²
tương ứng 1 lít. Các hệ số vật lý chưa có dữ liệu nên để `null`; `null` không
được diễn giải là 0.

Thứ tự bắt buộc:

1. Giữ bản sao state hiện tại và nhận action.
2. Ánh xạ action sang lượng nước.
3. Lấy thời tiết ngày hiện tại.
4. Tính cân bằng nước và độ ẩm mới.
5. Cập nhật giai đoạn nếu đến mốc.
6. Xây dựng next_state, gán `last_irrigation` bằng lượng tưới vừa thực hiện.
7. Tính reward từ state, action, next_state chưa bị ghi đè.
8. Kiểm tra kết thúc sinh học và giới hạn ngày.
9. Trả kết quả cho Agent.

Công thức v0.1 đang dùng trong nhánh environment (mọi đại lượng theo lít):

```text
before       = m_t * soil_capacity_liters
irrigation   = action_liters[action] * irrigation_efficiency
               (* repeat_irrigation_efficiency nếu last_irrigation >= ngưỡng lặp)
rain         = actual_rain_mm * plot_area_m2 * rain_efficiency
demand       = (evapotranspiration_liters_per_day + et_temperature_slope * (T - 15))
               * crop_factors[crop_type] * stage_factors[growth_stage]
et           = min(before + irrigation + rain, demand)
remaining    = before + irrigation + rain - et
drainage     = min(max(0, remaining - soil_capacity_liters * drainage_threshold),
                   drainage_liters_per_day)
drainage    += max(0, remaining - drainage - soil_capacity_liters)  # nước tràn
m_{t+1}      = (remaining - drainage) / soil_capacity_liters
```

Không dùng clip để che nước dư; phần vượt sức chứa phải đi vào tiêu thoát và được
test. Nếu `m_{t+1}` ra ngoài `[0,1]`, đó là lỗi công thức/cấu hình cần sửa, không
phải giá trị để che bằng clamp.

## Giai đoạn sinh trưởng và kết thúc

Đề xuất v0.1 (chưa chốt): mốc `growth_stage_days = [8, 16, 24]` tính từ ngày reset.
`next_stage = min(3, initial_stage + số mốc đã đạt)`.

- `terminated=True` khi `moisture <= biological_termination[0]` hoặc
  `moisture >= biological_termination[1]`. Đề xuất `[0.10, 0.95]`.
- `truncated=True` khi `day >= max_days`.
- Stress (`< 0,20` hoặc `> 0,85`) chỉ là tiêu chí reward, không phải chết cây.
- Nếu cả hai cờ cùng đúng, ưu tiên `terminated=True`.
- Đây là giả định mô phỏng, chưa hiệu chuẩn; ngưỡng chết phải tách khỏi ngưỡng stress.

## Agent và cấu hình

`BaseAgent` là ABC với `select_action(state, training=False) -> int`.
Baseline không bắt buộc `learn/save/load`. Q-Learning và DQN chưa có thuật toán;
Minh phải thống nhất API học chung trước khi viết train, không đọc private fields.
Evaluation chỉ gọi `select_action` với `training=False`.

Đề xuất baseline v0.1 (chưa triển khai): `soil_moisture < 0.30 → action 4 (20 lít)`,
ngược lại `action 0`. Đây là luật cố định, không học.

Đề xuất rời rạc hóa Q-table cho giai đoạn sau (chưa triển khai): 4 × 4 × 5 × 3 × 2 × 3 × 3
= 4.320 trạng thái, với các biên:

```text
crop_type: 4 giá trị
growth_stage: 4 giá trị
soil_moisture: 5 khoảng, biên [0, .2, .4, .6, .8, 1.0]
temperature: 3 khoảng, biên [15, 25, 35, 45]
rain_probability: 2 khoảng, biên [0, .5, 1.0]
rain_forecast_mm: 3 khoảng, biên [0, 15, 30, 50]
last_irrigation: 3 khoảng, biên [0, 5, 15, 25]
```

Dùng `np.digitize` và clip index. Con số 864 trong báo cáo là ví dụ cũ, không dùng
cho cấu hình hiện tại.

### File cấu hình

- `environment.yaml`: `max_days`, `default_scenario`, `action_liters`, `moisture`,
  `reward`, `water_balance`, `growth_stage_days`, `biological_termination`,
  `initial_state`.
- `scenarios.yaml`: `dry`, `stormy`, `random`, mỗi kịch bản có
  `temperature_range_c`, `rain_probability_range`, `rain_amount_range_mm`.
- `training.yaml`: `seed`, `q_learning`, `dqn`; đây là đề xuất khởi đầu, chưa tối ưu.

`load_config(name)` chỉ nhận `environment`, `scenarios`, `training`; đọc
`configs/<name>.yaml` theo gốc repo, dùng `yaml.safe_load`, bắt buộc top-level
mapping và giữ nguyên `null`. Mỗi consumer tự kiểm tra phần mình cần: reward kiểm
tra `reward`/`moisture`; environment kiểm tra vật lý; weather kiểm tra phân phối.
Không tạo loader thứ hai.

## Đề xuất v0.1 (chưa chốt)

Bảng dưới đây đồng bộ với schema nhánh `feature/environment`, dùng để chạy thử và
viết test tích hợp. **Không đưa vào YAML production khi chưa có xác nhận của cả hai.**
Không khẳng định đây là số liệu nông học hay FAO-56.

| Tham số | Đề xuất |
|---|---|
| `max_days` | 30 |
| `plot_area_m2` | 1.0 |
| `soil_capacity_liters` | 50.0 (độ ẩm 1.0 = 50 L/m²) |
| `irrigation_efficiency` | 0.8 |
| `rain_efficiency` | 1.0 |
| `evapotranspiration_liters_per_day` | 0.0 |
| `et_temperature_slope` | 0.25 L/ngày/°C trên 15 °C |
| `crop_factors` | `[1.0, 1.0, 1.0, 1.0]` |
| `stage_factors` | `[0.60, 0.90, 1.15, 0.80]` |
| `drainage_threshold` | 0.85 |
| `drainage_liters_per_day` | 5.0 |
| `repeat_irrigation_threshold_liters` | 12.5 |
| `repeat_irrigation_efficiency` | 0.8 |
| `growth_stage_days` | `[8, 16, 24]` |
| `biological_termination` | `[0.10, 0.95]` |
| `initial_state.crop_type` | 0 |
| `initial_state.growth_stage` | 0 |
| `initial_state.soil_moisture_range` | `[0.35, 0.55]` |
| Dry | T ~ U(35, 42), p ~ U(0, 0.05), forecast ~ U(0, 5) mm |
| Stormy | T ~ U(22, 30), p ~ U(0.3, 0.9), forecast ~ U(5, 40) mm |
| Random | T ~ U(18, 38), p ~ U(0, 1), forecast ~ U(0, 40) mm |

## Việc còn phải chốt

1. `crop_type` dùng 4 giá trị 0–3 (khớp observation/Q-table) hay số lượng khác?
2. `WeatherDay[t]` là dự báo cho chuyển `t → t+1` và `actual_rain_mm` dùng cho chính
   chuyển đó — có giữ đúng quy ước này không?
3. Ngưỡng chết `[0.10, 0.95]` có tách đủ khỏi ngưỡng stress `[0.20, 0.85]` không?
4. Chốt toàn bộ giá trị vật lý/weather v0.1 và ghi vào YAML bằng PR riêng.
5. Có thêm `growth_stage`/`termination_reason` vào info không?
6. Cấu hình bin Q-table 4.320 trạng thái có dùng chính thức không?

Các điểm trên phải được ghi trong PR và test tương ứng; không tự sửa hợp đồng để
vượt test và không điền số tùy ý vào YAML.
