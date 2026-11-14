# Kế hoạch kiểm thử môi trường v0.1

**Sau merge:** đã chạy thật ba scenario và kiểm thử tích hợp (163 passed, không
skip). Xem BAO_CAO_MOI_TRUONG.md để lấy lệnh chạy và bảng kết quả hiện tại. Các
ghi chú “chờ null/dependency” ở phần kế hoạch cũ bên dưới đã được giải quyết bằng
cấu hình demo có ghi giả định; chưa phải hiệu chuẩn nông học.

Tài liệu này mô tả cách kiểm chứng môi trường, reward và demo không học. Chưa có
huấn luyện, loss, hội tụ hay so sánh thuật toán; các phần đó để giai đoạn sau.

## Trạng thái

- `config.py`, `reward.py`, `demo.py` đã triển khai trên `feature/reward-demo`.
- `agriwater_env.py`, `weather.py` đã merge vào `feature/reward-demo` qua PR #1.
- Các giá trị vật lý/weather trong YAML còn `null`. Không chạy nghiệm thu thật khi
  còn `null` bắt buộc; không điền 0 để tạo kết quả.
- Unit test demo dùng environment giả. Phải chạy lại với environment thật sau khi
  chốt YAML.
- Toàn suite hiện 154 passed, 1 skipped (`check_env`).

## Lệnh kiểm tra

Windows/PowerShell:

```powershell
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
```

Linux/macOS:

```bash
.venv/bin/python -m pytest
.venv/bin/python -m ruff check .
.venv/bin/python -m ruff format --check .
```

Không coi passed của unit test giả là nghiệm thu tích hợp. Ghi rõ số passed/skipped/
failed và test nào còn bị skip.

## Điều kiện trước khi chạy thật

1. Environment đã merge vào `feature/reward-demo`; bật
   `check_env(AgriWaterEnv(), skip_render_check=True)`
   pass với loader/reward thật, không mock.
2. Không còn `null` ở các khóa bắt buộc trong `environment.yaml`/`scenarios.yaml`.
3. Hai người đã chốt giá trị v0.1 và ghi vào `DESIGN_CONTRACT.md`/PR.
4. Toàn bộ test reward/config/environment pass, không còn skip môi trường.
5. Cùng seed và cùng options cho cùng observation/weather.

## Chạy demo không học

Demo chỉ kiểm tra đường đi của môi trường, không học và không tối ưu chính sách.

```bash
# Hành động ngẫu nhiên, seed cố định
python -m agriwater.environment.demo --scenario dry --seed 42

# Hành động cố định 4 (20 lít) và xuất CSV
python -m agriwater.environment.demo --scenario stormy --seed 42 --action 4 \
  --output results/stormy-fixed4.csv

# Ghi đè CSV cũ phải nói rõ
python -m agriwater.environment.demo --scenario random --seed 42 \
  --output results/random.csv --force
```

Chạy lần lượt `dry`, `stormy`, `random`; với mỗi kịch bản nên chạy ít nhất một
policy ngẫu nhiên và một action cố định. Ghi seed, ngày chạy, số ngày thực tế và
cấu hình đã dùng. Cây chết sớm không có nghĩa tiết kiệm nước tốt.

CSV có 16 cột theo thứ tự:

```text
day, action, water_used_liters, actual_rain_mm, soil_moisture, reward,
is_ideal, is_stressed, terminated, truncated,
R_health, R_stress, R_water, R_waste, R_rain, R_delay
```

## Metric cần tính khi so sánh

Các metric dưới đây dùng cho báo cáo/đánh giá, chưa triển khai trong `metrics.py`:

```text
total_water_liters   = sum(water_used_liters)
total_reward         = sum(reward)
days_survived        = số record thực tế
ideal_days           = count(is_ideal)
ideal_ratio          = ideal_days / days_survived
stress_days          = count(soil_moisture < 0.20 or soil_moisture > 0.85)
overwater_days       = count(R_waste < 0)
rain_waste_days      = count(R_rain < 0)
delay_days           = count(R_delay < 0)
water_saving_pct     = 100 * (baseline_water - agent_water) / baseline_water
                       (chỉ tính khi baseline_water > 0)
termination_reason   = biological nếu terminated, max_days nếu truncated
```

Ba metric `overwater_days`, `rain_waste_days`, `delay_days` suy trực tiếp từ reward
components trong CSV, không cần đọc lại state. `stress_days` dùng `soil_moisture`
của record. Nếu cần phân tích sâu hơn, có thể bổ sung `rain_probability` và
`rain_forecast_mm` vào schema CSV bằng một PR riêng.

`water_saving_pct` chỉ có nghĩa khi so cùng weather, cùng trạng thái đầu và cùng
số ngày sống; nếu baseline chết sớm hơn thì phải báo rõ, không so tổng nước thô.

## Hồ sơ nghiệm thu

| Nhóm kiểm tra | Bằng chứng cần có |
|---|---|
| Gymnasium | `check_env` và reset/step thật, không mock reward |
| Reward | Sáu thành phần, biên float32, stage next_state, input không đổi |
| Vật lý | Một bước tính tay khớp code, cùng đơn vị |
| Weather | Seed tái lập, thời tiết không phụ thuộc action |
| Kết thúc | terminated/truncated riêng, không step sau kết thúc |
| Demo | CSV ba scenario, lệnh/seed/cấu hình, số ngày thực chạy |
| Tái lập | Cùng seed/options → cùng observation, weather và records |

Lưu dữ liệu sinh ra ở `results/` hoặc `logs/`. PR ghi cách tái lập thay vì commit
dữ liệu sinh tự động. Nếu hệ số chưa chốt, báo thiếu cấu hình; không điền 0.

## Sau nghiệm thu môi trường

Baseline, Q-Learning, DQN, huấn luyện và benchmark mới bắt đầu. Trước khi train
phải thống nhất API học chung, cách lưu checkpoint và cách đánh giá công bằng.
Không báo cáo kết quả học thuật khi mới chỉ có demo không học.
