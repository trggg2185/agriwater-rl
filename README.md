# AgriWater-RL

**Cập nhật trạng thái:** môi trường Gymnasium, FastAPI và hai giao diện Web 2D,
Streamlit chạy với bộ tham số mô phỏng trong YAML. Các tham số chưa được hiệu
chuẩn thực địa. Xem [DESIGN_CONTRACT](docs/DESIGN_CONTRACT.md),
[BAO_CAO_MOI_TRUONG](docs/BAO_CAO_MOI_TRUONG.md) và [DASHBOARD](docs/DASHBOARD.md).

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

Các thành phần dự kiến: môi trường Gymnasium và thời tiết, dashboard Streamlit minh
họa, Rule-based Baseline, Tabular Q-Learning, DQN, huấn luyện và đánh giá.
Công nghệ: Python **3.13**, NumPy, Gymnasium, PyTorch (CPU), Pandas, Matplotlib,
Streamlit, PyYAML, Pytest, Ruff và Git/GitHub. Python 3.13 thay thế yêu cầu 3.12
trong Prompt.md theo lựa chọn của người dùng; Prompt.md được giữ nguyên.

## Dashboard 2D

Từ thư mục gốc, chạy `docker compose up -d --build`, rồi mở
[AgriWater-RL](http://127.0.0.1:5173/). Bản dựng web phục vụ dashboard Canvas 2D
và chuyển yêu cầu `/api/` tới FastAPI. Màn hình mở ở ruộng lúa, kịch bản khô hạn,
seed 42 và ngày 18. FastAPI chạy từng ngày bằng `AgriWaterEnv` theo baseline
đến mốc này. Bấm **Ngày tiếp** để dùng chính sách hiện tại. Để tưới thủ công,
chọn mức nước ở ngày mới nhất rồi bấm nút áp dụng ở thanh ngày.

API dùng cấu hình mô phỏng trong YAML. [Chế độ phát lại](http://127.0.0.1:5173/?preview=1)
mở dữ liệu đã xuất trước đó với bộ tham số v0.1.

Giao diện web tổ chức theo các use case thiết lập môi trường, huấn luyện,
thử nghiệm, so sánh và báo cáo. Hồ sơ môi trường, nhật ký CSV và kết quả
thử nghiệm được lưu trong trình duyệt. Thử nghiệm Baseline dùng một tệp JSON
chứa mảng `weather` hoặc mảng trực tiếp gồm `maxDays + 1` bản ghi với các
trường `temperature`, `rain_probability`, `rain_forecast_mm` và `actual_rain_mm`.
So sánh hỗ trợ nhập episode `agriwater.episode/1` đã hoàn tất. Nhật ký học
dùng CSV gồm `episode,reward,loss`, với `loss` tùy chọn.
Nút huấn luyện Q-Learning/DQN chờ tích hợp backend của các thuật toán.

## Cấu trúc và trạng thái

```text
agriwater/
  __init__.py
  config.py     (load_config dùng chung, đã triển khai)
  environment/  (__init__.py, agriwater_env.py, weather.py, demo.py)
  agents/       (__init__.py, base_agent.py, baseline.py, q_learning.py, dqn.py, reward.py)
  training/     (__init__.py, train.py)
  evaluation/   (__init__.py, evaluate.py, metrics.py)
  dashboard/    (__init__.py, app.py, demo_config.py, plots.py)
configs/        (environment.yaml, training.yaml, scenarios.yaml)
tests/          (test_config.py, test_environment.py, test_reward.py, test_demo.py, test_dashboard.py, test_interfaces.py)
scripts/        (setup.ps1)
docs/           (DESIGN_CONTRACT.md, CONTRIBUTING.md, TASKS.md, EXPERIMENT_GUIDE.md, DASHBOARD.md, AI_*.md)
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
API đã có Baseline theo ngưỡng độ ẩm. Huấn luyện và chạy thử trực tiếp
Q-Learning/DQN trên dashboard đang chờ tích hợp.

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

Tests kiểm tra imports, YAML, spaces/interface, loader, reward, demo, environment và
dashboard. Trên `feature/reward-demo`: 169 passed, 1 skipped; skip duy nhất là
`check_env` tích hợp vì YAML vật lý còn `null`. Số liệu thay đổi theo nhánh; luôn
chạy lại. Trên Linux/macOS dùng `.venv/bin/python` thay cho `.venv/Scripts/python.exe`.
Ruff bỏ qua `main.py` có sẵn để không thay đổi nội dung người dùng; mã mới trong
agriwater đều được kiểm tra.

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
CLI đọc cấu hình vật lý và thời tiết từ YAML.

### Dashboard minh họa

```bash
python -m streamlit run agriwater/dashboard/app.py
```

Dashboard đọc YAML và cho chọn kịch bản, seed, thông số đầu vụ và các chế độ
tưới mô phỏng. Có KPI, biểu đồ độ ẩm, nước tưới, mưa, reward và tải CSV. Chi tiết và giới hạn ở [DASHBOARD](docs/DASHBOARD.md).

## Huấn luyện và đánh giá sau này

Sau khi hoàn thành module và chốt CLI, các entry point là
`python -m agriwater.training.train` và `python -m agriwater.evaluation.evaluate`.
**Hiện các lệnh này chỉ báo chưa triển khai**, không sinh mô hình hay kết quả.
Xem [hướng dẫn thực nghiệm](docs/EXPERIMENT_GUIDE.md) trước khi xây pipeline.
Để xem dashboard minh họa: `python -m streamlit run agriwater/dashboard/app.py`.

## Cộng tác và quy tắc

Xem phân công và các hạng mục tích hợp đang thực hiện tại [TASKS](docs/TASKS.md).
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
- Nếu cấu hình thiếu hoặc không hợp lệ, kiểm tra YAML và tài liệu hợp đồng mô phỏng.
- Dashboard không khởi động: chạy từ gốc repo để import được `agriwater`; kiểm tra
  Streamlit đã cài trong `.venv` và cổng 8501 không bị chiếm.
- .idea vẫn hiện trong Git: file đã staged/tracked từ trước không bị .gitignore loại bỏ.

Chưa có dữ liệu thực địa hay khẳng định hiệu quả tiết kiệm nước. Cần thống nhất
hệ số vật lý, phân phối thời tiết và API học trước các bước tiếp theo.
