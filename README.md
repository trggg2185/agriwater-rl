# AgriWater-RL

**AI mới nhận dự án:** bắt đầu ở [AI_START_HERE](docs/AI_START_HERE.md), rồi đọc
[hướng dẫn Trưởng](docs/AI_TRUONG.md) hoặc [hướng dẫn Minh](docs/AI_MINH.md).
Các tài liệu có phạm vi file, API, thứ tự triển khai và tiêu chí nghiệm thu để
làm việc mà không cần lịch sử cuộc hội thoại.

Dự án môn Học tăng cường của **Nguyễn Thế Trưởng** và **Nguyễn Minh**:
hỗ trợ quyết định tưới tiêu để tiết kiệm nước và duy trì độ ẩm phù hợp cho cây.
Đây là **bộ khung khởi tạo**, chưa phải hệ thống tưới tiêu có thể sử dụng thực tế.

**Phạm vi tuần này:** chuẩn bị cấu trúc chung để Trưởng và Minh tự xây dựng môi
trường thử nghiệm theo mục III–IV của `docs/HocTangCuongN10_HoanChinh.docx`.
Trưởng triển khai môi trường/thời tiết; Minh triển khai reward và demo. Các thuật
toán baseline, Q-Learning, DQN, huấn luyện và benchmark dành cho giai đoạn sau.

Các thành phần dự kiến: môi trường Gymnasium và thời tiết, Rule-based Baseline,
Tabular Q-Learning, DQN, huấn luyện, đánh giá và dashboard Streamlit.
Công nghệ: Python **3.13**, NumPy, Gymnasium, PyTorch (CPU), Pandas, Matplotlib,
Streamlit, PyYAML, Pytest, Ruff và Git/GitHub. Python 3.13 thay thế yêu cầu 3.12
trong Prompt.md theo lựa chọn của người dùng; Prompt.md được giữ nguyên.

## Cấu trúc và trạng thái

```text
agriwater/
  __init__.py
  config.py     (interface đọc cấu hình chung, chưa triển khai)
  environment/  (__init__.py, agriwater_env.py, weather.py, demo.py)
  agents/       (__init__.py, base_agent.py, baseline.py, q_learning.py, dqn.py, reward.py)
  training/     (__init__.py, train.py)
  evaluation/   (__init__.py, evaluate.py, metrics.py)
  dashboard/    (__init__.py, app.py)
configs/        (environment.yaml, training.yaml, scenarios.yaml)
tests/          (__init__.py, test_environment.py, test_reward.py, test_interfaces.py)
scripts/        (setup.ps1)
docs/           (DESIGN_CONTRACT.md, CONTRIBUTING.md, TASKS.md, EXPERIMENT_GUIDE.md)
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

Đã có spaces, kiểm tra tham số khởi tạo, BaseAgent trừu tượng, chữ ký hàm,
cấu hình và kiểm thử hợp đồng. Reset/step/weather/reward/agent/train/evaluate/metrics
chưa triển khai và báo lỗi rõ ràng. Dashboard chỉ hiện thông báo trạng thái bootstrap.
Các test cho logic chưa có được skip với lý do cụ thể.
Các hệ số vật lý chưa chốt là null; tuyệt đối không thay null bằng 0 để chạy thử.
Demo hiện chỉ có chữ ký `run_episode(scenario, seed, action)` và entry point báo
chưa triển khai; chưa có lệnh chạy mô phỏng hoặc dữ liệu thực nghiệm để sử dụng.

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

Tests kiểm tra imports, YAML, spaces và interface. Passed chỉ xác nhận bộ khung;
skipped là các kiểm tra môi trường/reward đang chờ triển khai. Ruff bỏ qua main.py
có sẵn để không thay đổi nội dung người dùng; mã mới trong agriwater đều được kiểm tra.

## Huấn luyện và đánh giá sau này

Sau khi hoàn thành module và chốt CLI, các entry point là
`python -m agriwater.training.train` và `python -m agriwater.evaluation.evaluate`.
**Hiện các lệnh này chỉ báo chưa triển khai**, không sinh mô hình hay kết quả.
Xem [hướng dẫn thực nghiệm](docs/EXPERIMENT_GUIDE.md) trước khi xây pipeline.
Để xem màn hình trạng thái: `.venv/Scripts/python.exe -m streamlit run agriwater/dashboard/app.py`.

## Cộng tác và quy tắc

Tuần này Trưởng viết môi trường, thời tiết và test môi trường; Minh viết reward,
test reward và demo hành động cố định/ngẫu nhiên. Hai người có thể làm song song
trên `feature/environment` và `feature/reward-demo`, cùng xuất phát từ main.
File chung cần trao đổi trước khi thay đổi; chi tiết tại [TASKS](docs/TASKS.md).
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
- NotImplementedError khi reset/train: đúng trạng thái bootstrap, xem TASKS.
- .idea vẫn hiện trong Git: file đã staged/tracked từ trước không bị .gitignore loại bỏ.

Chưa có dữ liệu thực địa hay khẳng định hiệu quả tiết kiệm nước. Cần thống nhất
hệ số vật lý, phân phối thời tiết và API học trước các bước tiếp theo.
