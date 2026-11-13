# AgriWater-RL

**Cập nhật phần Minh:** loader cấu hình, reward sáu thành phần và demo không học đã
triển khai trên `feature/reward-demo` (135 passed, 1 skipped). Environment/weather
đã triển khai trên `feature/environment` nhưng chưa merge; YAML vật lý/weather vẫn
`null`. Xem [DESIGN_CONTRACT](docs/DESIGN_CONTRACT.md) và [TASKS](docs/TASKS.md)
để biết phần nào đã xong và phần nào còn chờ tích hợp.
**Cập nhật phần Trưởng:** môi trường/thời tiết đã triển khai và có unit tests.
Xem [bàn giao Trưởng](docs/TRUONG_HANDOFF.md) để biết schema, công thức và điểm nối
cho Minh. Chạy toàn môi trường vẫn chờ loader/reward của Minh và giá trị cấu hình;
các mô tả bootstrap bên dưới thể hiện điểm xuất phát, không phải trạng thái mới
của environment/weather.

**AI mới nhận dự án:** bắt đầu ở [AI_START_HERE](docs/AI_START_HERE.md), rồi đọc
[hướng dẫn Trưởng](docs/AI_TRUONG.md) hoặc [hướng dẫn Minh](docs/AI_MINH.md).
Các tài liệu có phạm vi file, API, thứ tự triển khai và tiêu chí nghiệm thu để
làm việc mà không cần lịch sử cuộc hội thoại.

Dự án môn Học tăng cường của **Nguyễn Thế Trưởng** và **Nguyễn Minh**:
hỗ trợ quyết định tưới tiêu để tiết kiệm nước và duy trì độ ẩm phù hợp cho cây.
Đây là **bộ khung khởi tạo**, chưa phải hệ thống tưới tiêu có thể sử dụng thực tế.

**Phạm vi tuần này:** chuẩn bị cấu trúc chung để Trưởng và Minh tự xây dựng môi
trường thử nghiệm theo mục III–IV của `docs/HocTangCuongN10_HoanChinh.docx`.
Trưởng triển khai môi trường/thời tiết; Minh triển khai loader cấu hình, reward và
demo. Các thuật toán baseline, Q-Learning, DQN, huấn luyện và benchmark dành cho
giai đoạn sau.

Các thành phần dự kiến: môi trường Gymnasium và thời tiết, Rule-based Baseline,
Tabular Q-Learning, DQN, huấn luyện, đánh giá và dashboard Streamlit.
Công nghệ: Python **3.13**, NumPy, Gymnasium, PyTorch (CPU), Pandas, Matplotlib,
Streamlit, PyYAML, Pytest, Ruff và Git/GitHub. Python 3.13 thay thế yêu cầu 3.12
trong Prompt.md theo lựa chọn của người dùng; Prompt.md được giữ nguyên.

## Cấu trúc và trạng thái

```text
agriwater/
  __init__.py
  config.py     (load_config dùng chung, đã triển khai)
  environment/  (__init__.py, agriwater_env.py, weather.py, demo.py)
  agents/       (__init__.py, base_agent.py, baseline.py, q_learning.py, dqn.py, reward.py)
  training/     (__init__.py, train.py)
  evaluation/   (__init__.py, evaluate.py, metrics.py)
  dashboard/    (__init__.py, app.py)
configs/        (environment.yaml, training.yaml, scenarios.yaml)
tests/          (test_config.py, test_environment.py, test_reward.py, test_demo.py, test_interfaces.py)
scripts/        (setup.ps1)
docs/           (DESIGN_CONTRACT.md, CONTRIBUTING.md, TASKS.md, EXPERIMENT_GUIDE.md, AI_*.md)
models/         (.gitkeep; checkpoint sinh ra)
results/        (.gitkeep; kết quả sinh ra)
logs/           (.gitkeep; log sinh ra)
requirements.txt
pyproject.toml
.gitignore
.gitattributes
.editorconfig
.env.example
README.md
Prompt.md       (yêu cầu gốc được giữ nguyên)
main.py         (file có sẵn được giữ nguyên, không phải entry point)
```

Đã có spaces, kiểm tra tham số khởi tạo, BaseAgent trừu tượng, loader cấu hình,
reward sáu thành phần và demo không học. `config.py`, `reward.py`, `demo.py` cùng
test tương ứng đã chạy trên `feature/reward-demo`. `agriwater_env.py`/`weather.py`
mới là stub trên nhánh này; bản triển khai nằm ở `feature/environment` và chưa merge.
Baseline, Q-Learning, DQN, train, evaluate và metrics vẫn chưa triển khai.
Dashboard chỉ hiện thông báo trạng thái bootstrap.
Các hệ số vật lý/weather chưa chốt là `null`; tuyệt đối không thay `null` bằng 0
để chạy thử. Demo có thể chạy với environment giả trong unit test, nhưng chưa có
kết quả mô phỏng thật cho tới khi merge environment và chốt YAML.

## Cài đặt Windows 10/11 và PowerShell

Cần Git, Python 3.13 bản chuẩn 64-bit (không phải free-threaded), VS Code tùy chọn.
Cài Python từ [python.org](https://www.python.org/downloads/windows/), chọn Python
Launcher và thêm Python vào PATH. Kiểm tra `py -3.13 --version`.
Không cần GPU/CUDA. requirements.txt giới hạn dải phiên bản; chưa phải lockfile.

Clone bằng URL GitHub thực của nhóm (thay placeholder trước khi chạy):

```powershell
git clone <URL-REPOSITORY-CUA-NHOM>
cd AgriWater-RL
./scripts/setup.ps1
```

Script dùng đường dẫn thư mục dự án kể cả khi có dấu cách, giữ nguyên .venv có sẵn,
kiểm tra Python 3.13, nâng pip, cài requirements và kiểm tra import/tensor CPU.
Script không sửa ExecutionPolicy và không xóa môi trường sai phiên bản.

Nếu PowerShell chặn script, cài thủ công (không cần activate hay đổi chính sách):

```powershell
# Chi tao khi chua co .venv; khong ghi de moi truong hien co.
py -3.13 -m venv .venv
.venv/Scripts/python.exe --version
.venv/Scripts/python.exe -m pip install --upgrade pip
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -c "import gymnasium, numpy, torch, pandas, matplotlib, streamlit, yaml; print(torch.ones(1, device='cpu'))"
```

Trong VS Code: cài extension Python, Ctrl+Shift+P → Python: Select Interpreter →
chọn `.venv/Scripts/python.exe`. Nếu không thấy, dùng Enter interpreter path.

## Kiểm tra nền tảng

Chạy từ thư mục gốc:

```powershell
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
.venv/Scripts/python.exe -m compileall -q agriwater tests
```

Tests kiểm tra imports, YAML, spaces/interface, loader, reward và demo. Trên
`feature/reward-demo`: 135 passed, 1 skipped; skip duy nhất là `check_env` thuộc
phần environment chưa merge. Trên `feature/environment`: 28 passed, 2 skipped tại
bàn giao. Số liệu thay đổi theo nhánh; luôn chạy lại. Trên Linux/macOS dùng
`.venv/bin/python` thay cho `.venv/Scripts/python.exe`. Ruff bỏ qua `main.py`
có sẵn để không thay đổi nội dung người dùng; mã mới trong agriwater đều được kiểm tra.

## Demo không học và đọc cấu hình

Reward và loader dùng được độc lập với environment:

```python
from agriwater.config import load_config

environment = load_config("environment")
print(environment["reward"]["health"])
```

Demo chạy hành động cố định hoặc ngẫu nhiên, không học:

```bash
python -m agriwater.environment.demo --scenario dry --seed 42
python -m agriwater.environment.demo --scenario stormy --seed 42 --action 4 \
  --output results/stormy-fixed4.csv
```

`--output` không ghi đè file cũ; thêm `--force` nếu muốn thay. CSV có 16 cột:
`day`, `action`, `water_used_liters`, `actual_rain_mm`, `soil_moisture`, `reward`,
`is_ideal`, `is_stressed`, `terminated`, `truncated` và sáu cột reward.
Demo cần environment thật; trên nhánh này mới chạy được unit test với environment giả.

## Huấn luyện và đánh giá sau này

Sau khi hoàn thành module và chốt CLI, các entry point là
`python -m agriwater.training.train` và `python -m agriwater.evaluation.evaluate`.
**Hiện các lệnh này chỉ báo chưa triển khai**, không sinh mô hình hay kết quả.
Xem [hướng dẫn thực nghiệm](docs/EXPERIMENT_GUIDE.md) trước khi xây pipeline.
Để xem màn hình trạng thái: `.venv/Scripts/python.exe -m streamlit run agriwater/dashboard/app.py`.

## Cộng tác và quy tắc

Minh đã hoàn thành loader, reward và demo trên `feature/reward-demo`; Trưởng đã
hoàn thành environment/weather trên `feature/environment`. Bước tiếp theo là review,
merge hai nhánh và chốt các giá trị YAML còn `null`. File chung cần trao đổi trước
khi thay đổi; chi tiết tại [TASKS](docs/TASKS.md).
Dùng feature/... → PR → người còn lại review → merge, không push trực tiếp main.
Ví dụ lệnh Git và xử lý xung đột tại [CONTRIBUTING](docs/CONTRIBUTING.md).

Không tự đổi 7 chiều observation, chuẩn hóa, 6 action, công thức reward hoặc API.
Không so sánh giai đoạn đã chuẩn hóa với mã nguyên; không ghi đè state trước reward.
Dùng cùng chuỗi thời tiết để đánh giá các agent. Tất cả tham số thực nghiệm phải
truy xuất từ YAML; đọc [DESIGN_CONTRACT](docs/DESIGN_CONTRACT.md) trước khi triển khai.

## Lỗi thường gặp

- Không có `py`: cài Python Launcher hoặc dùng đường dẫn đầy đủ đến Python 3.13.
- Sai interpreter/ModuleNotFoundError: kiểm tra `.venv/Scripts/python.exe --version`,
  cài bằng chính interpreter đó; không dùng pip của Python hệ thống.
- .venv sai phiên bản: giữ bản sao/đổi tên môi trường cũ sau khi kiểm tra dữ liệu,
  rồi tự tạo môi trường 3.13; setup sẽ dừng chứ không xóa.
- Script bị chặn: dùng hướng dẫn thủ công, không cần đổi ExecutionPolicy.
- Tải thư viện thất bại: kiểm tra mạng, proxy, dung lượng; chạy lại pip và đọc lỗi.
  Không tắt kiểm tra TLS. PyTorch có thể tải khá lâu.
- Torch lỗi DLL: kiểm tra Windows 64-bit, Python chuẩn và runtime Visual C++ phù hợp.
- NotImplementedError khi reset/step trên `main`: environment mới là stub; bản triển
  khai nằm ở `feature/environment` và cần merge. `train`/`evaluate` vẫn là bootstrap.
- Demo báo thiếu cấu hình: YAML vật lý/weather còn `null`; xem TASKS, không điền 0.
- .idea vẫn hiện trong Git: file đã staged/tracked từ trước không bị .gitignore loại bỏ.

Chưa có dữ liệu thực địa hay khẳng định hiệu quả tiết kiệm nước. Cần thống nhất
hệ số vật lý, phân phối thời tiết và API học trước các bước tiếp theo.
