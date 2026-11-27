# Dashboard minh họa AgriWater Lab

Dashboard Streamlit để **trực quan hóa môi trường và reward**, không huấn luyện và
không tối ưu chính sách. Mục tiêu là kiểm tra bằng mắt động học tưới tiêu, không
phải công cụ đánh giá thuật toán.

## Chạy

Từ thư mục gốc repository, sau khi đã tạo `.venv` và cài `requirements.txt`:

```bash
python -m streamlit run agriwater/dashboard/app.py
```

Trên Windows/PowerShell:

```powershell
.venv/Scripts/python.exe -m streamlit run agriwater/dashboard/app.py
```

Trên Linux/macOS:

```bash
.venv/bin/python -m streamlit run agriwater/dashboard/app.py
```

Mở địa chỉ Streamlit in ra (mặc định `http://localhost:8501`). Dừng bằng `Ctrl+C`.

Kiểm tra không mở trình duyệt (dùng cho CI/smoke test):

```bash
python -m streamlit run agriwater/dashboard/app.py --server.headless true
```

## Chức năng

- Chọn kịch bản `dry`, `stormy`, `random`; seed; policy ngẫu nhiên hoặc hành động
  cố định 0–5 (0–25 lít).
- Thẻ KPI: số ngày chạy, tổng nước tưới, tổng reward, tỷ lệ ngày lý tưởng, ngày stress.
- Biểu đồ độ ẩm đất kèm dải lý tưởng đổi theo giai đoạn sinh trưởng.
- Biểu đồ nước tưới (L) và mưa thực (mm).
- Reward tích lũy và phân rã sáu thành phần reward.
- Bảng 16 cột theo ngày và nút tải CSV.
- Expander hiển thị cấu hình overlay và phạm vi dữ liệu.

## Quan trọng: overlay v0.1, không sửa YAML

`configs/environment.yaml` và `configs/scenarios.yaml` vẫn để các khóa vật lý/weather
là `null` cho tới khi hai thành viên chốt. Dashboard dùng
`agriwater/dashboard/demo_config.py` để ghép **đề xuất v0.1** vào bản sao cấu hình
trong bộ nhớ:

- Không ghi đè file YAML.
- Không thay đổi công thức cân bằng nước, reward hay observation/action.
- Mọi kết quả trên dashboard là **minh họa**, không phải số liệu nông học.

Khi hai người chốt cấu hình, có thể bỏ overlay và dùng YAML trực tiếp; khi đó
`check_env` và demo CLI cũng chạy được với cấu hình thật.

## Kiến trúc

| File | Vai trò |
|---|---|
| `agriwater/dashboard/app.py` | Giao diện Streamlit, điều khiển và biểu đồ |
| `agriwater/dashboard/demo_config.py` | Đề xuất v0.1 cho vật lý/weather, ghép trong bộ nhớ |
| `agriwater/dashboard/plots.py` | Hàm thuần: DataFrame, KPI, reward tích lũy, dải lý tưởng |
| `tests/test_dashboard.py` | Test overlay, metric, weather, schema, biên giai đoạn |

Các thay đổi API **bổ sung, tương thích ngược** phục vụ overlay:

- `AgriWaterEnv(..., config=None)`: dùng config truyền vào thay vì đọc YAML.
- `generate_weather(..., ranges=None)`: dùng range truyền vào cho một scenario.
- `run_episode(..., config=None, weather=None)`: chạy với overlay trong bộ nhớ.

Không có tham số nào bắt buộc phải truyền; code cũ giữ nguyên hành vi.

## Giới hạn

- Không huấn luyện, không Q-Learning/DQN, không so sánh thuật toán.
- Kịch bản `stormy` có thể kết thúc sớm vì ngưỡng chết trên `0.95` và mưa lớn làm
  đầy nước; đây là hệ quả của đề xuất v0.1, không phải lỗi dashboard.
- Dashboard chưa đọc `training.yaml`; chưa có biểu đồ loss/hội tụ.
- Không dùng dashboard để kết luận tiết kiệm nước; cần baseline và cùng chuỗi thời
  tiết, cùng trạng thái đầu.

## Kiểm tra

```bash
python -m pytest
python -m ruff check .
python -m ruff format --check .
```
