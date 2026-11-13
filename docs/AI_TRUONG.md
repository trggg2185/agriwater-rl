# Hướng dẫn triển khai cho Trưởng và AI của Trưởng

Đọc AI_START_HERE.md và DESIGN_CONTRACT.md trước. Nhánh đề xuất:
feature/environment, xuất phát cùng phiên bản bộ khung với Minh.

## Trạng thái

Bản triển khai environment/weather nằm ở nhánh `feature/environment`, kèm
`docs/TRUONG_HANDOFF.md` trên chính nhánh đó. Loader/reward/demo của Minh đã có
trên `feature/reward-demo`. Còn review/merge hai nhánh và chốt các giá trị YAML;
các bước dưới giữ nguyên làm hướng dẫn triển khai và kiểm thử.

## Phạm vi sở hữu

- agriwater/environment/agriwater_env.py: reset/step/render, cân bằng nước.
- agriwater/environment/weather.py: WeatherDay và chuỗi thời tiết.
- tests/test_environment.py: kiểm thử môi trường và weather.
- configs/environment.yaml: đề xuất phần water_balance, growth_stage_days,
  biological_termination; chỉ chốt sau trao đổi.
- configs/scenarios.yaml: đề xuất ba phân phối và ghi giả định sau trao đổi.

Không viết reward/demo thay Minh. Minh phụ trách config.py; gọi API đã thống nhất,
không tạo loader thứ hai. Không làm Q-Learning/DQN/baseline/train/dashboard tuần này.

## Thứ tự làm việc

1. Đọc constructor/spaces hiện có; giữ nguyên observation/action.
2. Liệt kê tham số null cần quyết định, đối chiếu mục IV của DOCX; trình đề xuất
   công thức, đơn vị, miền và tình huống biên. Dry có nhiệt độ 35–42°C, stormy có
   xác suất ≥0,70 và dự báo ≥15 mm trong báo cáo; phân phối đầy đủ vẫn cần chốt.
3. Viết generate_weather và test seed/miền dữ liệu. RNG riêng; sinh trước chuỗi,
   không dùng hành động hoặc RNG của agent. Không biến dự báo thành chắc chắn mưa
   nếu chưa giải thích mô hình xác suất.
4. Viết reset: gọi super().reset(seed=seed), trạng thái đầu hợp lệ, sao chép weather,
   reset bộ đếm; kiểm tra options và chuỗi dùng chung theo hợp đồng bổ sung.
5. Viết step theo đúng thứ tự trong DESIGN_CONTRACT; input reward là bản sao state
   trước tưới và next_state sau cập nhật. Import calculate_reward của Minh.
6. Viết render hiển thị trạng thái đơn giản, thống nhất kiểu trả về với demo nếu
   thay chữ ký. Không cần web UI để nghiệm thu môi trường.
7. Khi reward/loader của Minh đã sẵn sàng, chạy check_env và tích hợp demo.

## Cân bằng nước cần chứng minh

Quy đổi về một đơn vị trước khi cộng. Nếu dùng lít: mưa mm × diện tích m² = lít;
độ ẩm chuẩn hóa × sức chứa đất = lượng nước. Làm rõ tưới/mưa hiệu dụng, ET, tiêu
thoát và nước tràn. Không dùng clip để che mất nước không được giải thích trong
cân bằng. Giới hạn ET theo nước sẵn có, hoặc mô tả mô hình khác đã thống nhất.
Nếu nhiệt độ, crop_type, stage hay last_irrigation ảnh hưởng dynamics, phải có test
cho ảnh hưởng đó và chỉ rõ hệ số trong YAML.

Stress (<0,20 hoặc >0,85) là tiêu chí reward, không tự coi là chết cây ngay.
Ngưỡng/điều kiện chết phải cấu hình riêng. Truncated đạt max_days; kết thúc sinh
học dùng terminated. Sau kết thúc cần reset trước khi step tiếp.

## Ma trận kiểm thử tối thiểu

| Trường hợp | Kỳ vọng |
|---|---|
| reset cùng seed/options | Cùng observation và chuỗi weather |
| Cùng weather, action khác nhau | Mưa/nhiệt độ từng ngày không đổi theo action |
| action 0 và 5 | Đúng 0/25 L, water_used_liters là của bước hiện tại |
| Không mưa, không tưới | Nước giảm đúng ET/tiêu thoát theo mô hình |
| Có mưa/tưới | Phương trình cân bằng khớp, sai số số thực được giải thích |
| Mốc stage | Đúng next_stage, reward nhận next_state mới |
| Cờ dừng | Tách sinh học và thời hạn; kiểm tra ngày cuối |
| Input sai | Từ chối action ngoài 0..5, bool/float, NaN/Inf, options/weather sai |
| Bản sao dữ liệu | Sửa observation trả về không làm đổi state nội bộ; không sửa weather caller |
| Gymnasium | check_env đạt, reset/step đúng kiểu và shape |

Nếu reward chưa có, có thể mock trong unit test để kiểm tra dynamics; phải ghi rõ
mock, không đưa reward giả vào production. Giữ test tích hợp skip có lý do cụ thể
đến khi có dependency; bỏ skip và chạy thật trước nghiệm thu cuối.

## Lệnh kiểm tra và bàn giao

```powershell
.venv/Scripts/python.exe -m pytest tests/test_environment.py tests/test_interfaces.py
.venv/Scripts/python.exe -m ruff check agriwater/environment tests/test_environment.py
.venv/Scripts/python.exe -m ruff format --check agriwater/environment tests/test_environment.py
```

Bàn giao cho Minh: API reset options, ví dụ weather hợp lệ, cấu hình đã chốt,
ý nghĩa info, cách dừng episode và kết quả test. Nếu check_env chưa chạy vì reward
chưa merge thì ghi “chưa kiểm tra tích hợp”, không ghi “môi trường hoàn tất”.
