# AgriWater-RL

Môi trường thử nghiệm tưới tiêu cho môn Học tăng cường, Python 3.13. Phần của Trưởng (môi trường/thời tiết) và Minh (loader/reward/demo) đã tích hợp. Chưa triển khai baseline, Q-Learning, DQN, train hoặc benchmark; các thành viên khác thực hiện tuần sau.

## Bắt đầu

- Để chạy và trình bày với thầy: [BAO_CAO_MOI_TRUONG](docs/BAO_CAO_MOI_TRUONG.md).
- API và dữ liệu hiện hành: [DESIGN_CONTRACT](docs/DESIGN_CONTRACT.md).
- Quy trình Git: [CONTRIBUTING](docs/CONTRIBUTING.md).
- AI nhận việc: [AI_START_HERE](docs/AI_START_HERE.md). Các hướng dẫn vai trò và TRUONG_HANDOFF ghi lịch sử phân công; không làm lại các phần đã tích hợp.

## Cài đặt

Cần Python 3.13, Git; chạy CPU, không cần CUDA. Trong PowerShell tại gốc repo:

```powershell
# Chỉ tạo khi chưa có .venv
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Hoặc chạy `./scripts/setup.ps1`. Nếu chính sách PowerShell chặn script, dùng các lệnh thủ công trên; không cần đổi ExecutionPolicy. Không ghi đè môi trường có sẵn. VS Code: Python: Select Interpreter → .venv/Scripts/python.exe. Nếu chuyển thư mục/máy, kiểm tra lại interpreter; không chia sẻ .venv qua Git.

## Sửa lỗi import trong IDE

`No module named ...` khi chạy thường do dùng nhầm Python hoặc chưa cài dependencies.
`Unresolved reference` trong PyCharm cũng có thể do interpreter còn trỏ tới thư mục cũ
sau khi đổi tên hoặc di chuyển dự án. Không sửa bằng cách tắt kiểm tra import.

- PyCharm: Settings → Project → Python Interpreter → Add Interpreter → Add Local
  Interpreter → chọn môi trường có sẵn tại `.venv/Scripts/python.exe` trong **thư mục
  dự án hiện tại**. Mở thư mục gốc chứa `agriwater`, `configs` và `pyproject.toml`.
- VS Code: Python: Select Interpreter → chọn cùng file `.venv/Scripts/python.exe`.
- Sau khi thay cấu hình IDE bên ngoài ứng dụng, khởi động lại IDE để nạp lại SDK.
  Nếu vẫn trỏ sai, chọn lại interpreter bằng giao diện Settings ở trên.
- Khi chạy terminal, dùng lệnh đầy đủ bên dưới; `python` hoặc `pip` trần có thể
  trỏ tới Python hệ thống. Chạy module bằng `-m` từ gốc repo, không chạy trực tiếp
  `agriwater/environment/demo.py`.

```powershell
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pip check
.venv/Scripts/python.exe -c "import sys, gymnasium, numpy, pandas, streamlit, yaml, agriwater; print(sys.executable)"
```

Không commit `.idea` hoặc `.venv`: đường dẫn interpreter là cấu hình riêng từng máy.

## Chạy thử

**Giao diện tương tác (Streamlit):**

```powershell
.venv/Scripts/python.exe -m streamlit run agriwater/dashboard/app.py
```

Mở http://localhost:8501. Chọn thiết lập ở thanh bên và bấm **Khởi tạo / Làm lại**,
chọn lượng tưới rồi bấm **Chạy một ngày**, hoặc chạy hết episode. Xem độ ẩm, dự báo,
reward từng thành phần, cân bằng nước và tải CSV. Thay đổi thiết lập chỉ có hiệu
lực khi khởi tạo lại; tải CSV trước vì thao tác này xóa lịch sử trên màn hình.
Ctrl+C trong terminal để dừng server. Nếu cổng bận, thêm `--server.port 8502`.

**Dòng lệnh:**

```powershell
.venv/Scripts/python.exe -X utf8 -m agriwater.environment.demo --scenario dry --seed 42
.venv/Scripts/python.exe -X utf8 -m agriwater.environment.demo --scenario stormy --seed 42 --action 0
.venv/Scripts/python.exe -X utf8 -m agriwater.environment.demo --scenario random --seed 42 --output results/demo.csv
```

Không truyền --action thì chọn ngẫu nhiên; --action 0..5 giữ mức tưới 0/5/10/15/20/25 L. Đây là kiểm tra môi trường, không học. CSV đã tồn tại thì chọn tên mới hoặc thêm --force khi chủ động ghi đè. Thư mục cha tự được tạo.

CSV có 16 cột: ngày, action, nước tưới, mưa, độ ẩm sau bước, reward, is_ideal/is_stressed, terminated/truncated và sáu reward components. Cây chết sớm không thể coi là tiết kiệm nước tốt.

## Kiểm tra

```powershell
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
```

Mốc kiểm tra tích hợp 13/11/2026: 163 passed, không skip, gồm Gymnasium thật và ba scenario. Nếu pytest lỗi quyền temp/cache cũ, xem lệnh dùng basetemp mới trong tài liệu báo cáo. Không xóa dữ liệu để xử lý lỗi quyền.

## Cấu trúc

| Thư mục/file | Vai trò |
|---|---|
| agriwater/environment | Môi trường Gymnasium, weather, CLI demo |
| agriwater/agents/reward.py | Reward của môi trường, không phải thuật toán học |
| agriwater/config.py | Đọc YAML chung |
| configs/environment.yaml | Vật lý, ngưỡng, reward, trạng thái đầu |
| configs/scenarios.yaml | Ba phân phối thời tiết |
| configs/training.yaml | Đề xuất giai đoạn sau, chưa sử dụng để học |
| tests | Kiểm thử đơn vị và tích hợp |
| docs | Báo cáo DOCX, hướng dẫn và hợp đồng |
| results, logs, models | Dữ liệu sinh ra, bị gitignore |
| agents khác, training, evaluation | Interface cho tuần sau |
| dashboard | Streamlit thử môi trường, biểu đồ và CSV; chưa so sánh thuật toán |

main.py không phải entry point; Prompt.md là yêu cầu bootstrap lịch sử. Dùng lệnh python -m như trên.

## Giới hạn và cộng tác

Thông số demo trong YAML là giả định chưa hiệu chuẩn, không phải FAO-56 hoặc dữ liệu thực địa. Báo cáo DOCX còn một số chỗ chưa nhất quán (phút/ngày, ví dụ Q-table, Markov); file BAO_CAO_MOI_TRUONG giải thích lựa chọn triển khai. Không tự thêm chiều observation hoặc khẳng định hiệu quả RL.

Làm trên nhánh feature/... hoặc fix/..., tạo PR để người còn lại review; không push trực tiếp main. Không commit .venv, secret hay kết quả sinh tự động. Trước đổi API/schema phải cập nhật DESIGN_CONTRACT, test và thông báo người phụ trách.
