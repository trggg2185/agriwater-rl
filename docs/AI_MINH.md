# Hướng dẫn triển khai cho Minh và AI của Minh

Đọc AI_START_HERE.md và DESIGN_CONTRACT.md trước. Nhánh đề xuất:
feature/reward-demo. Có thể bắt đầu loader/reward bằng dữ liệu mẫu ngay khi Trưởng
đang viết môi trường, không cần chờ reset/step.

## Phạm vi sở hữu

- agriwater/agents/reward.py và tests/test_reward.py.
- agriwater/environment/demo.py; thêm tests/test_demo.py khi triển khai demo.
- agriwater/config.py: đầu mối viết loader chung; thêm tests/test_config.py.
- Phần reward/moisture của environment.yaml chỉ sửa khi hai người thống nhất;
  không sửa phần vật lý Trưởng đang làm.

Không viết environment/weather thay Trưởng. Không triển khai baseline, Q-Learning,
DQN, train hay benchmark tuần này. Random/fixed action chỉ là đầu vào kiểm thử.

## Bước 1 — config loader dùng chung

Giữ load_config(name: str) -> dict[str, Any]. Các tên cho phép: environment,
scenarios, training; ánh xạ đến configs/<name>.yaml tương đối gốc repo, không phụ
thuộc current working directory. Dùng yaml.safe_load, kiểm tra top-level mapping;
thông báo lỗi rõ khi tên/file/YAML sai. Không eval và không tạo file cấu hình tự động.

Loader không được chặn reward vì các khóa vật lý còn null. Mỗi consumer kiểm tra
phần mình cần: reward kiểm tra reward/moisture; environment kiểm tra vật lý;
weather kiểm tra phân phối. Không coi null là 0. Bàn giao loader trước để Trưởng
dùng cùng API. Nếu cần snapshot/cache, thống nhất vòng đời và cách cập nhật config,
tránh dynamics và reward dùng hai bộ hệ số khác nhau trong cùng episode.

## Bước 2 — reward độc lập với môi trường

Giữ calculate_reward(state,action,next_state) -> (float,dict[str,float]). Dùng
NumPy và cấu hình chung, không cần PyTorch hay instance AgriWaterEnv.
Kiểm tra observation đúng shape/dtype/miền hữu hạn và mã cây/giai đoạn, action
nguyên 0..5; bool không phải action hợp lệ. Không sửa array đầu vào.

Dùng next_state cho health/stress, state cho waste/rain/delay. Giai đoạn của
next_state giải mã bằng làm tròn nhân 3. Forecast chuẩn hóa nhân 50, lần tưới trước
nhân 25. So sánh ngưỡng phải xử lý biểu diễn float32 nhất quán, không dùng epsilon
rộng làm biến đổi ý nghĩa điều kiện. Luôn trả đủ sáu khóa, kể cả thành phần bằng 0.

Ví dụ test chuẩn (các giá trị ghi bằng đơn vị thực, phải chuẩn hóa trước gọi):

| Dữ liệu | Kết quả cần có |
|---|---|
| action=0, next stage=0, next moisture=0,50 | tổng +10, năm phạt bằng 0 |
| moisture=0,60; p=0,70; forecast=15 mm; last=12,5 L; action=2; next moisture=0,90 | health=0, stress=−100, water=−4, waste=−20, rain=−10, delay=−16; tổng −150 |
| next stage=2, next moisture=0,40 | health=0 |
| next stage=2, next moisture=0,50 hoặc 0,75 | health=+10 |
| next moisture=0,20 hoặc 0,85 | stress=0 |
| next moisture ngay ngoài hai ngưỡng stress | stress=−100 |

Thêm test từng penalty bật/tắt riêng, trước/sau mốc giai đoạn, tổng bằng tổng
components, input không đổi, và input sai. Bỏ skip test reward khi đã triển khai.

## Bước 3 — demo sau khi môi trường tích hợp

Giữ run_episode(scenario="random",seed=42,action=None)->list[dict]. action=None
lấy mẫu từ action_space với seed riêng; action 0..5 giữ cố định. Gọi reset, rồi
step đến terminated hoặc truncated; đóng environment sau sử dụng. Không truy
cập private state và không tự tính lại reward hoặc dự báo mưa trong demo.

CLI dự kiến cần triển khai: --scenario dry|stormy|random, --seed số nguyên,
--action 0..5 tùy chọn, --output đường dẫn CSV tùy chọn. Đây là đặc tả tương lai,
hiện các tham số chưa được hỗ trợ. Không ghi đè CSV cũ âm thầm.

Mỗi record gồm day, action, water_used_liters, actual_rain_mm, soil_moisture,
reward, is_ideal, is_stressed, terminated, truncated và đủ sáu reward components
(làm phẳng thành cột CSV). Có thể thêm stage nếu cần, phải ghi schema trong guide.
In số ngày thực chạy, tổng nước/reward và nhãn “demo không học”.

Test demo: cùng seed cho cùng records, fixed action giữ đúng mức, dừng ngay khi
một trong hai cờ True, CSV đúng số hàng/cột và xử lý file đã có. Unit test có thể
dùng env giả trong tests, nhưng phải chạy demo thật với env của Trưởng trước nghiệm thu.

## Kiểm tra và bàn giao

```powershell
.venv/Scripts/python.exe -m pytest tests/test_reward.py tests/test_interfaces.py
.venv/Scripts/python.exe -m ruff check agriwater/agents/reward.py agriwater/config.py agriwater/environment/demo.py tests
.venv/Scripts/python.exe -m ruff format --check agriwater tests
```

Chạy thêm test_config/test_demo khi đã tạo. Sau tích hợp chạy toàn suite và ba
scenario. Gửi Trưởng ví dụ reward chuẩn, kết quả biên float32, cách dùng loader,
lệnh demo thật và các dependency còn thiếu. Không báo đã có kết quả học thuật RL.
