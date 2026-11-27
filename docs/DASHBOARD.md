# Dashboard AgriWater-RL

## Trạng thái sau PR #8

Dashboard chính là Web Canvas 2D. PR #8 đưa Baseline, Q-Learning và DQN vào
FastAPI trên `main` tại commit `b006b9e`.

- Baseline dùng được ngay. Q-Learning và DQN xuất hiện dưới dạng khả dụng khi
  API đọc được `models/q_table.npz` và `models/dqn_best.pt`. Trên bản local
  kiểm thử, cả ba chiến lược đã chạy được một bước qua API.
- Dashboard hỗ trợ tưới thủ công và tự động, chỉnh thời tiết cho các ngày
  chưa mô phỏng, huấn luyện theo Total Timesteps, thử nghiệm cùng kịch bản
  và seed, so sánh và xuất báo cáo.

### Chạy bản Web 2D

Từ thư mục gốc của nhánh `main`:

```bash
docker compose up -d --build --wait
curl -fsS http://127.0.0.1:5173/api/health
curl -fsS http://127.0.0.1:5173/api/meta
```

Mở dashboard tại [cổng 5173](http://127.0.0.1:5173/). Reverse proxy chuyển
`/api/` tới FastAPI. Đọc `availablePolicies` trong `/api/meta` để biết các
chiến lược dùng được trên máy.

### Giới hạn hiện tại

- Checkpoint kiểm thử được lưu local. Với bản clone mới, dùng màn hình
  **Huấn luyện** để tạo checkpoint trước khi chọn Q-Learning hoặc DQN.
- Phiên mô phỏng và tiến độ huấn luyện đang chạy nằm trong bộ nhớ API.
  Khởi động lại API sẽ kết thúc các phiên đó. Checkpoint đã lưu tồn tại
  qua lần dựng lại container bằng thư mục gắn `models/`.
- Hồ sơ và kết quả đã lưu thuộc trình duyệt và địa chỉ web hiện tại. Khi
  chuyển từ cổng preview sang cổng 5173, có thể xuất CSV hoặc PDF ở tab cũ
  để lưu kết quả.
- Checkpoint chạy thử chỉ xác nhận luồng hoạt động. Muốn so sánh hiệu quả
  tưới cần các lượt đánh giá cùng điều kiện. Tham số môi trường hiện dùng
  cho mô phỏng môn học và chưa được hiệu chuẩn ngoài thực địa.

Xem [hợp đồng API](DESIGN_CONTRACT.md) và [PR tích hợp](https://github.com/trggg2185/agriwater-rl/pull/8).

## Dashboard minh họa Streamlit

Streamlit là giao diện bổ sung để quan sát môi trường và phần thưởng.
Nó hỗ trợ tưới thủ công, ngẫu nhiên và chạy với checkpoint Q-Learning hoặc
DQN có sẵn. Luồng huấn luyện và so sánh nằm trên Web 2D.

### Chạy

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

### Chức năng

- Chọn kịch bản, seed, số ngày, nhóm cây, giai đoạn và độ ẩm ban đầu.
- Chạy từng ngày hoặc hết vụ với mức tưới cố định, ngẫu nhiên hoặc bằng checkpoint đã nạp.
- Thẻ KPI: số ngày chạy, tổng nước tưới, tổng reward, tỷ lệ ngày lý tưởng, ngày stress.
- Biểu đồ độ ẩm đất kèm dải lý tưởng đổi theo giai đoạn sinh trưởng.
- Biểu đồ nước tưới (L) và mưa thực (mm).
- Reward tích lũy và phân rã sáu thành phần reward.
- Bảng 16 cột theo ngày và nút tải CSV.
- Xem dự báo trước hành động và cân bằng nước của bước vừa chạy.

### Nguồn cấu hình

Streamlit dùng các tham số mô phỏng trong `configs/environment.yaml` và
`configs/scenarios.yaml`. Bộ v0.1 trong `demo_config.py` phục vụ dữ liệu mẫu và
kiểm thử tương thích. Các bộ tham số đều là giả định mô phỏng chưa hiệu chuẩn.

### Kiến trúc

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

### Giới hạn

- Kịch bản `stormy` có thể kết thúc sớm vì ngưỡng chết trên `0.95` và mưa lớn làm
  đầy nước theo bộ tham số mô phỏng.
- Không dùng dashboard để kết luận tiết kiệm nước; cần baseline và cùng chuỗi thời
  tiết, cùng trạng thái đầu.

### Kiểm tra

```bash
python -m pytest
python -m ruff check .
python -m ruff format --check .
```
