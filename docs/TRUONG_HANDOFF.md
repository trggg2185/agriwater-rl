# Bàn giao phần Trưởng: môi trường và thời tiết

## Trạng thái

Đã viết dynamics, reset/step/render, weather và unit tests. Chưa nghiệm thu toàn
hệ thống: load_config và calculate_reward vẫn là TODO của Minh, YAML còn null.
Chạy reset thật hiện sẽ gặp NotImplementedError từ loader. Không có fallback giả.
28 test passed, 2 skipped tại thời điểm bàn giao; chạy lại khi tích hợp.
check_env đã chạy trong test với loader/reward giả, không phải reward thật.

## File và API

- agriwater/environment/agriwater_env.py: AgriWaterEnv(scenario="random",
  max_days=30, render_mode=None). Thêm render_mode tùy chọn, giữ các đối số cũ.
- reset(seed=...,options=...) trả (observation,info). Options: crop_type,
  growth_stage, soil_moisture, weather. Không có options thì đọc initial_state.
- weather là list max_days+1 dict, chứa temperature, rain_probability,
  rain_forecast_mm, actual_rain_mm. Sao chép dữ liệu caller.
- step(action) trả tuple Gymnasium; yêu cầu reset trước và sau khi episode kết thúc.
- render_mode="ansi": render() trả chuỗi; None: trả None, không mở cửa sổ.
- generate_weather(scenario,days,seed=...) đọc load_config("scenarios"), dùng RNG
  riêng và sinh cả chuỗi trước khi agent hành động.

Observation vẫn 7 chiều float32, action 0..5. Thời tiết ngày t tạo observation
trước action t; mưa thực t dùng cho dynamics; observation mới chứa dự báo t+1.
Info giữ các khóa trong DESIGN_CONTRACT, thêm water_balance để kiểm tra đơn vị.
Reset info có nước/mưa=0 và reward_components={} vì chưa thực hiện action.
State không thay đổi nếu calculate_reward ném lỗi; reward nhận bản sao arrays.

## Schema đề xuất cần Trưởng/Minh chốt giá trị

Không lấy số trong fixtures tests làm hệ số thực nghiệm: đó chỉ là dữ liệu tổng hợp
để tính tay kiểm tra. Các khóa YAML production vẫn null; phải điền sau trao đổi.

| Khóa | Kiểu/đơn vị và ý nghĩa |
|---|---|
| initial_state.crop_type/growth_stage | int 0..3, mặc định reset |
| initial_state.soil_moisture_range | [low,high], 0≤low<high≤1; uniform reset |
| water_balance.plot_area_m2 | số dương, m² |
| water_balance.soil_capacity_liters | số dương, L khi moisture=1 |
| irrigation_efficiency/rain_efficiency | tỷ lệ 0..1 |
| evapotranspiration_liters_per_day | ET gốc ở 15°C, L/ngày, ≥0 |
| et_temperature_slope | hệ số L/ngày/°C trên 15°C, ≥0 |
| crop_factors/stage_factors | list 4 hệ số ≥0 không đơn vị |
| drainage_threshold | độ ẩm 0..1 bắt đầu tiêu thoát |
| drainage_liters_per_day | giới hạn tiêu thoát mỗi bước, L/ngày, ≥0 |
| repeat_irrigation_threshold_liters | ngưỡng lần tưới trước 0..25 L |
| repeat_irrigation_efficiency | hệ số nhân thêm 0..1 khi tưới lặp |
| growth_stage_days | list 3 ngày nguyên dương tăng dần, tính từ reset |
| biological_termination | [low,high] trong [0,1], kết thúc khi ≤low hoặc ≥high |

Các khóa không ghi prefix ở bảng thuộc water_balance. moisture và reward giữ nguyên.
Config validation chỉ kiểm tra cấu trúc/miền; nhóm phải kiểm tra tính hợp lý nông học
(ví dụ ngưỡng chết phải phân biệt với ngưỡng stress).

## Công thức được triển khai để review

Tất cả đại lượng trong cân bằng tính bằng lít:

1. before = moisture × capacity.
2. irrigation = action_liters[action] × irrigation_efficiency; nhân thêm
   repeat_irrigation_efficiency nếu lần tưới trước đạt ngưỡng cấu hình.
3. rain = actual_rain_mm × plot_area_m2 × rain_efficiency.
4. ET yêu cầu = (ET gốc + slope × (temperature−15)) × crop_factor × stage_factor.
   ET thực = min(nước sẵn có, ET yêu cầu).
5. Sau ET, thoát min(phần vượt threshold×capacity, drainage_liters_per_day).
   Phần còn vượt capacity được tính thêm vào drainage như nước tràn.
6. next_moisture = nước còn / capacity. Không clip làm mất dấu nước dư.
7. Ngày tăng 1; stage = min(3, initial_stage + số mốc đã đạt).
8. Tính reward với state cũ và next_state; chỉ sau khi thành công mới lưu state.

Weather: mỗi ngày lấy uniform nhiệt độ/xác suất/lượng dự báo theo ba cặp bounds;
Bernoulli quyết định mưa, nếu có thì actual=forecast, nếu không thì 0. Đây là mô
hình đơn giản cần review, chưa có sai số lượng mưa hoặc tương quan thời tiết nhiều ngày.
Chưa phải FAO-56 hoặc dữ liệu thực địa. Lịch stage phụ thuộc ngày không nằm trong
observation nên chưa khẳng định tính Markov đầy đủ; phải xử lý trước khi học.

## Minh cần làm tiếp

1. Viết load_config đúng API, không chặn reward bởi null vật lý.
2. Viết calculate_reward đúng sáu thành phần; không đổi observation/action.
3. Cùng Trưởng chốt giá trị YAML/schema đề xuất. Minh cần đảm bảo cấu hình reward
   cùng phiên bản với dynamics trong suốt episode, không sửa YAML giữa lượt chạy.
4. Bỏ skip test_gymnasium_contract khi loader/reward/config đã đủ; chạy check_env
   và toàn suite thật. Test reward của Minh cũng cần bỏ skip sau triển khai.
5. Nối demo qua API public, dùng info.water_used_liters và info.reward_components;
   không truy cập _state/_weather. Chạy ba scenario và xuất CSV.

## Kiểm tra phần Trưởng

```powershell
.venv/Scripts/python.exe -m pytest tests/test_environment.py tests/test_interfaces.py
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
```

Fixtures isolated monkeypatch loader/reward chỉ trong tests. Kiểm tra bao gồm
cân bằng tính tay, RNG/replay, mốc stage, ảnh hưởng nhiệt độ/cây/stage, tưới lặp,
tiêu thoát/tràn, lỗi input, cờ dừng, copy và rollback khi reward chưa có.

## Commit/push cho Trưởng (tự chạy khi sẵn sàng)

Lúc bàn giao đang ở main, chưa commit/push. Working tree ban đầu sạch.
Các lệnh dưới chuyển thay đổi hiện tại sang nhánh riêng:

```powershell
git switch -c feature/environment
git add agriwater/environment/agriwater_env.py agriwater/environment/weather.py tests/test_environment.py configs/environment.yaml README.md docs/DESIGN_CONTRACT.md docs/AI_START_HERE.md docs/TRUONG_HANDOFF.md
git diff --cached --stat
git commit -m "feat: implement irrigation environment and seeded weather"
git push -u origin feature/environment
```

Nếu nhánh đã tồn tại, kiểm tra git branch trước; không tự ghi đè nhánh. Tạo PR từ
feature/environment vào main, mô tả rõ 2 skip và dependency còn thiếu. Minh review
schema/công thức trước merge. Không push thay đổi này trực tiếp lên main.
