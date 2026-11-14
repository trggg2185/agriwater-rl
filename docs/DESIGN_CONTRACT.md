# Hợp đồng kỹ thuật hiện hành — môi trường AgriWater-RL

**Cập nhật triển khai:** environment/weather đã merge vào `feature/reward-demo` qua
PR #1; loader/reward/demo đã có. Xem `TRUONG_HANDOFF.md` về schema vật lý, công thức,
reset/step/render. Observation/action và reward không đổi; render_mode=None|"ansi".
Giá trị vật lý/weather vẫn chưa chốt nên `check_env` tích hợp còn bị skip.

Trưởng và Minh phải thống nhất trước khi thay đổi API, ý nghĩa dữ liệu hoặc cấu hình.
Python sử dụng **3.13** theo quyết định của người dùng, thay cho 3.12 trong Prompt.md.
Đây là bootstrap, chưa có mô hình nông học hay thuật toán hoàn chỉnh.

## Trạng thái triển khai

- `agriwater/config.py`: `load_config(name)` đã triển khai và có test.
- `agriwater/agents/reward.py`: sáu thành phần reward đã triển khai và có test biên.
- `agriwater/environment/demo.py`: vòng lặp demo, CLI và CSV đã triển khai; unit test
  dùng environment giả, chờ chạy thật sau khi merge environment.
- `agriwater/environment/agriwater_env.py` và `weather.py`: đã merge vào
  `feature/reward-demo`; xem `docs/TRUONG_HANDOFF.md`. `main` có thể chậm hơn nhánh này.
- Các khóa vật lý và phân phối weather trong YAML vẫn `null`. Bảng "Đề xuất v0.1"
  bên dưới là đề xuất để chạy thử, **chưa phải cấu hình đã chốt**; không coi `null` là 0.
- Tại thời điểm cập nhật, nhánh `feature/reward-demo` có 154 passed, 1 skipped;
  skip duy nhất là `check_env` tích hợp vì YAML vật lý còn `null`. Luôn chạy lại
  trên nhánh đang làm.

## Observation và action

Observation là ndarray float32, shape=(7,), Box(0,1).

| Index | Thuộc tính | Miền thực | Chuẩn hóa |
|---|---|---|---|
| 0 | crop_type | int 0..3 | /3 |
| 1 | growth_stage | int 0..3 | /3 |
| 2 | soil_moisture | 0..1 | giữ nguyên |
| 3 | temperature | 15..45°C | (T−15)/30 |
| 4 | rain_probability | 0..1 | giữ nguyên |
| 5 | rain_forecast_mm | 0..50 mm | /50 |
| 6 | last_irrigation | 0..25 L | /25 |

Mã cây/stage phải đúng biểu diễn float32 của 0,1/3,2/3,1; giải mã bằng round(value*3). Không làm tròn 0,5 thành mã hợp lệ. Last_irrigation là lượng tưới ở bước ngay trước, kể cả 0, không phải thời gian từ lần tưới cuối.

Discrete(6): action 0..5 ánh xạ [0,5,10,15,20,25] L. Từ chối bool, float và chỉ số ngoài miền. Không thay đổi thứ tự, chuẩn hóa hoặc số chiều mà không cập nhật hợp đồng/test.

## API và vòng đời

`AgriWaterEnv(scenario=None,max_days=None,render_mode=None)` lấy mặc định từ YAML (random,30), hoặc dùng override của caller. Một step là một ngày. render_mode hỗ trợ None và ansi.

`reset(*,seed=None,options=None)` trả (observation,info), gọi super().reset(seed=seed), lấy snapshot environment config. Options cho phép crop_type, growth_stage, soil_moisture, weather; tên sai bị từ chối. Không truyền trạng thái đầu thì dùng initial_state từ YAML. Last_irrigation khởi tạo 0.

`step(action)` trả (observation,reward,terminated,truncated,info). Phải reset trước step và sau khi kết thúc; nếu sai ném ResetNeeded. Observation trả về là bản sao. Reward lỗi thì không lưu transition dở dang. `render()` trả chuỗi trạng thái khi mode=ansi, còn lại None.

- terminated: độ ẩm sau bước ≤ngưỡng chết thấp hoặc ≥ngưỡng chết cao.
- truncated: đạt max_days.
- Hai cờ độc lập, **có thể cùng True** nếu chết đúng ngày cuối.
- Stress <0,20/>0,85 chỉ là điều kiện reward, không phải chết cây tức thời.

## Info

Info chứa day, water_used_liters, actual_rain_mm, soil_moisture, is_ideal, is_stressed, reward_components. Nước/mưa là của bước vừa thực hiện, không phải tổng tích lũy. Reset: day=0, nước/mưa=0, reward_components={}.

Sau step, water_balance chứa before_liters, irrigation_liters, rain_liters, evapotranspiration_liters, drainage_liters, after_liters. Reward components có đủ sáu khóa dưới đây. Không dùng private state trong demo/agent.

## Weather và tái lập

`generate_weather(scenario,days,*,seed)` trả list WeatherDay gồm temperature, rain_probability, rain_forecast_mm, actual_rain_mm. Sinh uniform từng biến trong bounds YAML, Bernoulli quyết định mưa; có mưa thì actual=forecast, không mưa thì actual=0. Đây là mô hình đơn giản, chưa có tương quan nhiều ngày hay sai số lượng mưa.

Reset nhận list weather có max_days+1 bản ghi, kiểm tra miền và sao chép. Bản ghi t cung cấp dự báo/nhiệt độ observation trước action t và mưa thực của transition t→t+1. Bản ghi cuối chỉ cung cấp thời tiết observation cuối. Không đưa mưa thực vào observation trước action.

Chuỗi được tạo trước, độc lập action; demo dùng RNG hành động riêng. Đối chứng cần cùng weather, cùng trạng thái đầu và cùng cấu hình, không chỉ cùng seed.

## Reward

`calculate_reward(state,action,next_state,*,config=None)` trả (float,dict[str,float]). Ba đối số cũ vẫn hợp lệ; config=None đọc YAML hiện tại. Environment truyền snapshot config để reward và dynamics dùng cùng hệ số suốt episode. Không còn lru_cache/cache_clear cho reward.

| Khóa | Công thức |
|---|---|
| R_health | +10 nếu next moisture thuộc vùng lý tưởng |
| R_stress | −100 nếu next moisture <0,20 hoặc >0,85 |
| R_water | −2×action |
| R_waste | −10×action nếu current moisture ≥0,60 |
| R_rain | −5×action nếu current p≥0,70 và forecast≥15 mm |
| R_delay | −8×action nếu current last_irrigation≥12,5 L |

Vùng lý tưởng theo next_stage: stage 2 là [0,50;0,75], còn lại [0,40;0,70], bao gồm biên. Không thỏa thì 0; action=0 thì phạt tưới=0. So sánh ngưỡng theo float32, không epsilon rộng. Tổng bằng tổng sáu thành phần, không sửa arrays đầu vào.

## Dynamics và đơn vị

Nước trước = moisture × capacity. Tưới hiệu dụng = lít tưới × hiệu suất; nhân thêm hệ số tưới lặp nếu lượng tưới trước đạt ngưỡng. Mưa hiệu dụng = mm × diện tích m² × hiệu suất (1 mm trên 1 m² = 1 L).

ET yêu cầu = (ET nền tại 15°C + slope×(T−15)) × crop_factor × stage_factor; ET thực không vượt nước sẵn có. Sau ET, tiêu thoát tối đa drainage_liters_per_day trên phần vượt drainage_threshold×capacity. Nước còn vượt capacity được cộng vào drainage như nước tràn. Nước sau = trước+tưới+mưa−ET−drainage; chia capacity ra next_moisture.

Thứ tự: giữ state cũ → tưới → weather ngày hiện tại → cân bằng → ngày/stage → next_state và dự báo kế tiếp → reward → cờ dừng → lưu state/trả kết quả. Stage=min(3,initial_stage+số mốc ngày đã đạt).

## Cấu hình và giới hạn

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

Bảng dưới đây đồng bộ với schema environment hiện tại, dùng để chạy thử và
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

Mặc định capacity=100 L, diện tích=1 m², trạng thái đầu crop/stage=0 và moisture uniform [0,40;0,70], mốc stage=[8,16,24], ngưỡng chết=[0,05;0,95]. Không coi đây là hệ số đã được thầy xác nhận hoặc chuẩn FAO-56.

Lịch sinh trưởng phụ thuộc ngày nhưng observation không có ngày; chưa khẳng định MDP đầy đủ. Cần thảo luận trước huấn luyện, không tự đổi bảy chiều lúc này. Mã cây là nhóm giả lập, chưa hiệu chuẩn theo giống thật.

Các module agents khác/train/evaluate chỉ giữ interface cho tuần sau. Không chốt bins Q-table hoặc thuật toán trong phạm vi môi trường này.
