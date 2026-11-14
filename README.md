# AgriWater-RL

**Cập nhật trạng thái:** loader cấu hình, reward sáu thành phần, demo không học và
environment/weather đã có trên `feature/reward-demo` (154 passed, 1 skipped). YAML
vật lý/weather vẫn `null` nên `check_env` tích hợp và demo thật còn chờ chốt cấu
hình. Xem [DESIGN_CONTRACT](docs/DESIGN_CONTRACT.md), [TASKS](docs/TASKS.md) và
[bàn giao Trưởng](docs/TRUONG_HANDOFF.md) để biết schema, công thức và điểm nối.

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
reward sáu thành phần, demo không học và environment/weather. `config.py`,
`reward.py`, `demo.py`, `agriwater_env.py` và `weather.py` cùng test tương ứng đã
có trên `feature/reward-demo` (environment merge từ `feature/environment`).
Baseline, Q-Learning, DQN, train, evaluate và metrics vẫn chưa triển khai.
Dashboard chỉ hiện thông báo trạng thái bootstrap.
Các hệ số vật lý/weather chưa chốt là `null`; tuyệt đối không thay `null` bằng 0
để chạy thử. Unit test demo dùng environment giả; demo/reset thật còn chờ chốt YAML.

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

Tests kiểm tra imports, YAML, spaces/interface, loader, reward, demo và environment.
Trên `feature/reward-demo`: 154 passed, 1 skipped; skip duy nhất là `check_env` tích
hợp vì YAML vật lý còn `null`. Số liệu thay đổi theo nhánh; luôn chạy lại. Trên
Linux/macOS dùng `.venv/bin/python` thay cho `.venv/Scripts/python.exe`. Ruff bỏ qua
`main.py` có sẵn để không thay đổi nội dung người dùng; mã mới trong agriwater đều
được kiểm tra.

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

`--output` không ghi đè file cũ; thêm `--force` nếu muốn thay. CSV có 16 cột:
`day`, `action`, `water_used_liters`, `actual_rain_mm`, `soil_moisture`, `reward`,
`is_ideal`, `is_stressed`, `terminated`, `truncated` và sáu cột reward.
Demo cần YAML vật lý hợp lệ; hiện các khóa còn `null` nên chỉ unit test với
environment giả chạy được, chưa có CSV thật.

## Huấn luyện và đánh giá sau này

Sau khi hoàn thành module và chốt CLI, các entry point là
`python -m agriwater.training.train` và `python -m agriwater.evaluation.evaluate`.
**Hiện các lệnh này chỉ báo chưa triển khai**, không sinh mô hình hay kết quả.
Xem [hướng dẫn thực nghiệm](docs/EXPERIMENT_GUIDE.md) trước khi xây pipeline.
Để xem màn hình trạng thái: `.venv/Scripts/python.exe -m streamlit run agriwater/dashboard/app.py`.

## Cộng tác và quy tắc

Minh đã hoàn thành loader, reward và demo; Trưởng đã hoàn thành environment/weather
và đã merge vào `feature/reward-demo`. Bước tiếp theo là review, chốt các giá trị
YAML còn `null` rồi chạy `check_env`/demo thật. File chung cần trao đổi trước
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
- NotImplementedError khi reset/step trên `main`: environment mới là stub; nhánh
  `feature/reward-demo` đã có environment nhưng reset cần chốt YAML vật lý.
  `train`/`evaluate` vẫn là bootstrap.
- Demo báo thiếu cấu hình: YAML vật lý/weather còn `null`; xem TASKS, không điền 0.
- .idea vẫn hiện trong Git: file đã staged/tracked từ trước không bị .gitignore loại bỏ.

Chưa có dữ liệu thực địa hay khẳng định hiệu quả tiết kiệm nước. Cần thống nhất
hệ số vật lý, phân phối thời tiết và API học trước các bước tiếp theo.
