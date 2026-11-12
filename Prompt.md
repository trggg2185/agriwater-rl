# PROMPT CODEX – KHỞI TẠO DỰ ÁN AGRIWATER-RL

Bạn là Senior Python Developer, Reinforcement Learning Engineer và Software Architect.

Hãy trực tiếp khởi tạo cấu trúc và các cấu hình nền tảng cho dự án **AgriWater-RL – Hệ thống ra quyết định tưới tiêu tự động tối ưu hóa nguồn nước trong nông nghiệp** tại thư mục làm việc hiện tại.

Dự án được thực hiện bởi hai thành viên là **Trưởng và Minh**, sử dụng GitHub để cộng tác. Mục tiêu quan trọng nhất là tạo ra một nền tảng thống nhất, dễ mở rộng, giúp hai người phát triển song song và hạn chế tối đa xung đột mã nguồn.

**YÊU CẦU QUAN TRỌNG:** Đây là giai đoạn khởi tạo dự án (Project Bootstrap), chưa phải giai đoạn triển khai toàn bộ hệ thống. Chỉ tạo cấu trúc, cấu hình, interface, tài liệu và những bài kiểm thử nền tảng. Không tự ý xây dựng hoàn chỉnh các thuật toán học tăng cường.

## I. THÔNG TIN VÀ CÔNG NGHỆ DỰ ÁN

Tên dự án: `AgriWater-RL`

Mô tả: Xây dựng môi trường mô phỏng tưới tiêu nông nghiệp theo chuẩn Gymnasium, kết hợp các chiến lược Rule-based Baseline, Tabular Q-Learning và Deep Q-Network (DQN), nhằm đánh giá khả năng tiết kiệm nước trong khi duy trì độ ẩm đất phù hợp cho cây trồng.

Công nghệ:

- Python 3.12.
- Gymnasium: xây dựng môi trường học tăng cường.
- NumPy: xử lý vector trạng thái và tính toán.
- PyTorch: triển khai DQN.
- Pandas: xử lý kết quả thực nghiệm.
- Matplotlib: trực quan hóa biểu đồ.
- Streamlit: xây dựng giao diện Dashboard.
- Pytest: kiểm thử tự động.
- Ruff: lint và format mã nguồn.
- Git/GitHub: quản lý phiên bản và cộng tác.

Ưu tiên tương thích Windows 10/11, VS Code, PowerShell và chạy bằng CPU. Không yêu cầu CUDA hoặc GPU chuyên dụng.

## II. KIỂM TRA REPOSITORY TRƯỚC KHI THỰC HIỆN

Trước khi chỉnh sửa:

1. Kiểm tra thư mục hiện tại và Git repository.
2. Kiểm tra các file và thư mục đang tồn tại.
3. Không xóa, ghi đè hoặc di chuyển code hiện có một cách tùy tiện.
4. Nếu phát hiện file có thay đổi chưa commit, phải giữ nguyên các thay đổi đó.
5. Nếu repository đã có cấu trúc, hãy điều chỉnh theo hướng bổ sung và tương thích, không phá vỡ chức năng hiện tại.
6. Không tự chạy `git init` nếu repository đã tồn tại.
7. Không tự commit, push, tạo branch, merge hoặc tạo Pull Request.

## III. CẤU TRÚC THƯ MỤC

Hãy tạo cấu trúc sau:

```text
AgriWater-RL/
│
├── agriwater/
│   ├── __init__.py
│   │
│   ├── environment/
│   │   ├── __init__.py
│   │   ├── agriwater_env.py
│   │   └── weather.py
│   │
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── base_agent.py
│   │   ├── baseline.py
│   │   ├── q_learning.py
│   │   ├── dqn.py
│   │   └── reward.py
│   │
│   ├── training/
│   │   ├── __init__.py
│   │   └── train.py
│   │
│   ├── evaluation/
│   │   ├── __init__.py
│   │   ├── evaluate.py
│   │   └── metrics.py
│   │
│   └── dashboard/
│       ├── __init__.py
│       └── app.py
│
├── configs/
│   ├── environment.yaml
│   ├── training.yaml
│   └── scenarios.yaml
│
├── tests/
│   ├── __init__.py
│   ├── test_environment.py
│   ├── test_reward.py
│   └── test_interfaces.py
│
├── scripts/
│   └── setup.ps1
│
├── docs/
│   ├── DESIGN_CONTRACT.md
│   ├── CONTRIBUTING.md
│   ├── TASKS.md
│   └── EXPERIMENT_GUIDE.md
│
├── models/
│   └── .gitkeep
│
├── results/
│   └── .gitkeep
│
├── logs/
│   └── .gitkeep
│
├── requirements.txt
├── pyproject.toml
├── .gitignore
├── .gitattributes
├── .editorconfig
├── .env.example
└── README.md
```

Các file Python chưa được triển khai phải có docstring, type hints và chữ ký hàm cần thiết.

Có thể sử dụng `NotImplementedError` cho phần logic chưa được phát triển.

**Không tạo logic giả khiến người dùng hiểu nhầm rằng thuật toán hoặc môi trường đã hoàn thành.**

Nếu có bài kiểm thử cho một chức năng chưa triển khai, hãy đánh dấu `pytest.mark.skip` với lý do cụ thể. Không tạo bài kiểm thử giả luôn trả về thành công.

## IV. THỐNG NHẤT HỢP ĐỒNG KỸ THUẬT

Tạo file `docs/DESIGN_CONTRACT.md` mô tả chính xác các quy ước sau.

### 1. Không gian trạng thái

Trạng thái của môi trường có 7 thành phần theo thứ tự cố định:

| Index | Thuộc tính | Miền dữ liệu thực tế | Biểu diễn trong observation |
|---|---|---|---|
| 0 | crop_type | Số nguyên 0–3 | crop_type / 3 |
| 1 | growth_stage | Số nguyên 0–3 | growth_stage / 3 |
| 2 | soil_moisture | 0–1 | Giữ nguyên |
| 3 | temperature | 15–45 °C | (temperature − 15) / 30 |
| 4 | rain_probability | 0–1 | Giữ nguyên |
| 5 | rain_forecast_mm | 0–50 mm | rain_forecast_mm / 50 |
| 6 | last_irrigation | 0–25 lít | last_irrigation / 25 |

Observation có kiểu `np.ndarray`, `dtype=np.float32`, `shape=(7,)`.

`observation_space = spaces.Box(low=0.0, high=1.0, shape=(7,), dtype=np.float32)`.

Không được tự ý thay đổi thứ tự, số chiều, cách chuẩn hóa hoặc ý nghĩa của các thành phần.

Lưu ý: Mã `crop_type` và `growth_stage` phải được chuyển về số nguyên tương ứng trước khi xử lý logic nghiệp vụ. Không so sánh trực tiếp giá trị growth stage đã chuẩn hóa với số nguyên 2.

### 2. Không gian hành động

`action_space = spaces.Discrete(6)`.

Ánh xạ hành động:

- Action 0: 0 lít.
- Action 1: 5 lít.
- Action 2: 10 lít.
- Action 3: 15 lít.
- Action 4: 20 lít.
- Action 5: 25 lít.

Phân biệt rõ `action` là chỉ số nguyên từ 0 đến 5, còn `water_liters` là thể tích nước thực tế.

### 3. Thời gian mô phỏng

Quy định cho phiên bản thử nghiệm đầu tiên:

- Một step tương ứng một ngày.
- Mỗi episode tối đa 30 ngày.
- `terminated=True` khi xảy ra điều kiện kết thúc sinh học được định nghĩa trong mô hình.
- `truncated=True` khi đạt giới hạn số ngày mô phỏng.

Đây là quy ước mô phỏng, không phải thông số nông học được kiểm chứng bằng dữ liệu thực địa.

### 4. Các kịch bản thời tiết

Hỗ trợ ba kịch bản:

- `dry`: thời tiết khô hạn, ít mưa.
- `stormy`: thời tiết mưa nhiều.
- `random`: thời tiết thay đổi ngẫu nhiên.

Bộ sinh thời tiết phải hỗ trợ seed để tái lập kết quả.

Trong cùng một lần đánh giá, các thuật toán phải sử dụng cùng chuỗi thời tiết độc lập với hành động của Agent. Không chỉ dựa vào việc truyền cùng seed nếu lượng số ngẫu nhiên tiêu thụ thay đổi theo chính sách.

### 5. API Gymnasium

File `agriwater/environment/agriwater_env.py` phải định nghĩa lớp:

```python
class AgriWaterEnv(gym.Env):
    def __init__(
        self,
        scenario: str = "random",
        max_days: int = 30,
    ) -> None:
        ...

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict | None = None,
    ):
        ...

    def step(self, action: int):
        ...

    def render(self):
        ...
```

`reset()` phải trả về `(observation, info)`.

`step()` phải trả về `(observation, reward, terminated, truncated, info)`.

Trong `info`, khi môi trường được triển khai, cần cung cấp các thông tin tối thiểu:

- `day`
- `water_used_liters`
- `actual_rain_mm`
- `soil_moisture`
- `is_ideal`
- `is_stressed`
- `reward_components`

### 6. Hàm phần thưởng

File `agriwater/agents/reward.py` có chữ ký:

```python
def calculate_reward(
    state: np.ndarray,
    action: int,
    next_state: np.ndarray,
) -> tuple[float, dict[str, float]]:
    ...
```

Quy định sáu thành phần thưởng/phạt:

- R_health: thưởng +10 khi độ ẩm tiếp theo thuộc khoảng lý tưởng.
- R_stress: phạt −100 khi độ ẩm tiếp theo dưới 0,20 hoặc trên 0,85.
- R_water: phạt −2 × action.
- R_waste: phạt −10 × action nếu độ ẩm trước tưới từ 0,60 trở lên và action > 0.
- R_rain: phạt −5 × action nếu dự báo mưa có xác suất từ 0,70 và lượng mưa dự báo từ 15 mm, đồng thời action > 0.
- R_delay: phạt −8 × action khi lượng tưới lần trước từ 12,5 lít trở lên và action > 0.

Khoảng độ ẩm lý tưởng:
- Giai đoạn sinh trưởng 2: 0,50–0,75.
- Các giai đoạn còn lại: 0,40–0,70.

Giữ logic cơ bản theo báo cáo của nhóm.

Hàm trả về tổng reward và dictionary thể hiện các thành phần thưởng/phạt để tiện kiểm thử.

Không viết một hàm reward khác bên trong `AgriWaterEnv`.

### 7. Quy định chuyển trạng thái

Tài liệu thiết kế phải mô tả nguyên tắc cân bằng nước:

`Nước sau bước = Nước trước bước + nước tưới hiệu dụng + nước mưa hiệu dụng − bốc thoát hơi − tiêu thoát`.

Các hệ số vật lý chưa có số liệu đo thực tế phải được đặt trong `configs/environment.yaml`, kèm đơn vị và giải thích giả định.

Không tự khẳng định các hệ số này là tiêu chuẩn FAO-56.

Thứ tự xử lý thống nhất:

1. Nhận trạng thái hiện tại và hành động.
2. Xác định lượng nước tưới.
3. Sử dụng dữ liệu thời tiết của ngày hiện tại.
4. Tính cân bằng nước và độ ẩm mới.
5. Cập nhật giai đoạn sinh trưởng nếu đến mốc chuyển giai đoạn.
6. Xây dựng next_state.
7. Tính reward từ state, action và next_state.
8. Kiểm tra điều kiện kết thúc.
9. Trả kết quả cho Agent.

Đảm bảo các dữ liệu đầu vào reward chưa bị ghi đè trước khi tính toán.

## V. CÁC INTERFACE DÙNG CHUNG

Tạo abstract base class `BaseAgent` trong `base_agent.py` với phương thức:

```python
def select_action(
    self,
    state: np.ndarray,
    training: bool = False,
) -> int:
    ...
```

Với các Agent có học, có thể bổ sung `learn()`, `save()` và `load()` trong lớp triển khai phù hợp.

Không ép Baseline phải có phương thức huấn luyện vì Baseline là phương pháp luật cố định.

Các module Train và Evaluation phải sử dụng API thống nhất để không phụ thuộc trực tiếp vào cấu trúc nội bộ của Q-Learning hoặc DQN.

## VI. CẤU HÌNH CHUNG

Tạo các file YAML:

**`environment.yaml`**

Chứa thời lượng episode, không gian hành động, các ngưỡng độ ẩm, thông số cân bằng nước, hệ số mô phỏng và cấu hình kịch bản mặc định.

**`training.yaml`**

Chứa siêu tham số được phân nhóm theo thuật toán: Q-Learning, DQN. Có thể thiết lập gamma mặc định bằng 0,99, cùng learning rate, epsilon, batch size, replay buffer size và số episode.

Các giá trị chưa được quyết định trong báo cáo phải được ghi là cấu hình khởi đầu đề xuất, không trình bày như giá trị tối ưu đã được chứng minh.

**`scenarios.yaml`**

Chứa cấu hình ba kịch bản thời tiết.

Tạo utility dùng chung nếu cần, nhưng không đưa những cấu hình trùng lặp vào nhiều file.

Mọi tham số ảnh hưởng đến kết quả thực nghiệm phải truy xuất từ cấu hình thống nhất.

## VII. CÀI ĐẶT THƯ VIỆN VÀ MÔI TRƯỜNG

Tạo `requirements.txt` gồm các thư viện cần thiết.

Chọn các phiên bản tương thích Python 3.12 và Windows. Không tự chọn các phiên bản quá cũ hoặc không được hỗ trợ.

Nếu có thể truy cập tài liệu hoặc package metadata, hãy xác minh khả năng tương thích trước khi quyết định ràng buộc phiên bản.

Tạo `pyproject.toml` để cấu hình Pytest và Ruff, đảm bảo tất cả thành viên sử dụng cùng chuẩn format/lint.

Tạo `scripts/setup.ps1`:

1. Kiểm tra Python 3.12.
2. Tạo `.venv` nếu chưa tồn tại.
3. Sử dụng Python trong `.venv` để nâng cấp pip.
4. Cài thư viện từ `requirements.txt`.
5. Kiểm tra import các thư viện chính.
6. Thông báo lỗi rõ ràng nếu có bước thất bại.

Script phải không xóa môi trường có sẵn hoặc tự sửa chính sách bảo mật PowerShell.

Hãy thực thi quá trình cài đặt trong môi trường hiện tại nếu có đủ quyền và điều kiện. Nếu bị chặn bởi quyền truy cập, mạng hoặc môi trường chạy lệnh, hãy báo rõ những bước chưa thực hiện được. Không tuyên bố đã cài thành công khi chưa kiểm tra.

## VIII. QUY ĐỊNH GIT VÀ HẠN CHẾ XUNG ĐỘT

Tạo `.gitignore` phù hợp cho Python, VS Code và dự án Machine Learning.

Không commit:

- `.venv/`
- `__pycache__/`
- `.pytest_cache/`
- `.env`
- API keys và dữ liệu nhạy cảm.
- Logs và kết quả được sinh tự động.
- Checkpoint mô hình lớn (`.pt`, `.pth`, `.npz`).

Giữ `.gitkeep` trong các thư mục lưu dữ liệu.

Tạo `.gitattributes` để giảm khác biệt xuống dòng giữa Windows và các hệ điều hành khác.

Tạo `.editorconfig` quy định UTF-8, LF, 4 spaces với Python và newline cuối file.

Tạo tài liệu `docs/CONTRIBUTING.md` hướng dẫn GitHub Flow:

- `main` là nhánh ổn định.
- Không push trực tiếp vào main.
- Mỗi chức năng có nhánh riêng `feature/...`.
- Commit theo Conventional Commits.
- Tạo Pull Request khi hoàn thành.
- Người còn lại review trước khi merge.
- Không tự ý sửa API đã thống nhất.
- Không sửa file người khác phụ trách nếu chưa trao đổi.
- Trước khi merge phải chạy test và lint liên quan.

Nêu rõ các ví dụ về cách tạo nhánh, commit, push, cập nhật nhánh và xử lý xung đột Git.

## IX. PHÂN CÔNG CHO TRƯỞNG VÀ MINH

Tạo `docs/TASKS.md` gồm nhiệm vụ, file phụ trách và tiêu chí hoàn thành.

**Nguyễn Thế Trưởng**

- `agriwater/environment/agriwater_env.py`
- `agriwater/environment/weather.py`
- `tests/test_environment.py`
- `agriwater/evaluation/evaluate.py`
- `agriwater/evaluation/metrics.py`
- `agriwater/dashboard/app.py`

Phụ trách môi trường, mô phỏng thời tiết, kiểm thử môi trường, đánh giá và trực quan hóa kết quả.

**Nguyễn Minh**

- `agriwater/agents/reward.py`
- `agriwater/agents/baseline.py`
- `agriwater/agents/q_learning.py`
- `agriwater/agents/dqn.py`
- `agriwater/training/train.py`
- `tests/test_reward.py`

Phụ trách hàm thưởng, các thuật toán và huấn luyện.

**File chung**

- `README.md`
- `requirements.txt`
- `pyproject.toml`
- `configs/*`
- `docs/DESIGN_CONTRACT.md`
- `agriwater/agents/base_agent.py`
- `tests/test_interfaces.py`

Các file chung cần trao đổi trước khi sửa các hợp đồng kỹ thuật. Người sửa phải ghi rõ ảnh hưởng trong Pull Request.

## X. TẠO README CHUNG CHO HAI THÀNH VIÊN

Tạo `README.md` chuyên nghiệp bằng tiếng Việt, gồm đầy đủ:

1. Giới thiệu đề tài và mục tiêu.
2. Các thành phần chính của hệ thống.
3. Công nghệ sử dụng.
4. Cấu trúc thư mục và chức năng từng thư mục.
5. Điều kiện hệ thống và cách cài đặt Python.
6. Hướng dẫn clone repository.
7. Cài đặt bằng PowerShell và cách làm thủ công nếu script không chạy.
8. Cách chọn Python Interpreter trong VS Code.
9. Cách chạy test và kiểm tra lint.
10. Hướng dẫn huấn luyện và đánh giá sau khi các module đã hoàn thành.
11. Phân công Trưởng và Minh.
12. Quy trình làm việc với GitHub.
13. Những quy tắc không được tự ý thay đổi.
14. Trạng thái hiện tại của dự án và những chức năng chưa triển khai.
15. Các lỗi thường gặp khi thiết lập môi trường Python trên Windows.

Các câu lệnh phải chính xác với cấu trúc dự án mới.

Không ghi các lệnh như `python train.py` nếu file nằm trong một package và cần được chạy bằng `python -m`.

Không hướng dẫn chạy một chức năng chưa triển khai như thể nó đã hoạt động.

## XI. KIỂM TRA CHẤT LƯỢNG

Sau khi tạo xong các file:

1. Kiểm tra khả năng import các module.
2. Kiểm tra cấu hình Pytest và Ruff.
3. Kiểm tra cú pháp của các file Python.
4. Kiểm tra việc đọc YAML.
5. Kiểm tra sự nhất quán của các đường dẫn import.
6. Kiểm tra `.gitignore`.
7. Chạy các bài kiểm thử có thể thực hiện ở giai đoạn bootstrap.
8. Phân biệt rõ test đã vượt qua và test được bỏ qua do chưa triển khai.
9. Kiểm tra README có khớp với cấu trúc thực tế.

Không sửa các lỗi bằng cách xóa bài kiểm thử hoặc thay chúng bằng các assertion vô nghĩa.

## XII. KẾT QUẢ MONG MUỐN

Hãy thực hiện trực tiếp việc khởi tạo dự án, không chỉ giải thích bằng văn bản.

Khi hoàn thành, báo cáo:

- Danh sách file đã tạo hoặc chỉnh sửa.
- Cấu trúc thư mục cuối cùng.
- Các thư viện đã cài thành công và chưa cài được.
- Kết quả kiểm thử và lint.
- Các chức năng đã có.
- Các chức năng chưa được triển khai.
- Những quyết định kỹ thuật mới cần cả Trưởng và Minh xem xét.
- Việc Trưởng cần làm tiếp theo.
- Việc Minh cần làm tiếp theo.

**Không tự thực hiện commit, push hoặc merge. Không triển khai toàn bộ môi trường, Q-Learning hay DQN trong giai đoạn này.**

Ưu tiên cao nhất là tạo bộ khung rõ ràng, đúng chuẩn, có tài liệu chung và có thể đưa lên GitHub để hai người phát triển độc lập mà ít xung đột nhất.
