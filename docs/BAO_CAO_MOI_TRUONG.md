# Hướng dẫn chạy và báo cáo môi trường — Trưởng & Minh

## 1. Kết quả của tuần này

Nhóm đã ghép phần Trưởng (dynamics, thời tiết, Gymnasium) và phần Minh (loader,
reward, demo/CSV) thành môi trường chạy được. Chưa cài baseline, Q-Learning, DQN,
huấn luyện hay so sánh thuật toán; đó là nhiệm vụ tuần sau của các thành viên khác.
Hành động ngẫu nhiên/cố định chỉ dùng để kiểm tra môi trường.

Kiểm tra ngày 13/11/2026: **163 tests passed, không skip**, gồm check_env của
Gymnasium với loader/reward thật và demo thật của cả ba scenario.
Các unit test dùng mock vẫn giữ để cô lập lỗi, không thay thế kiểm thử tích hợp.

## 2. Chạy trên PowerShell

### Giao diện trực quan

```powershell
.venv/Scripts/python.exe -m streamlit run agriwater/dashboard/app.py
```

Mở http://localhost:8501 và giữ terminal đang chạy.

1. Thanh bên: chọn kịch bản, seed, số ngày, mã cây, giai đoạn và độ ẩm đầu.
2. Bấm **Khởi tạo / Làm lại** để áp dụng; thay thông số chưa bấm nút không đổi lượt chạy.
3. Chọn lượng tưới 0–25 L, bấm **Chạy một ngày** để trình bày một transition.
4. Xem biểu đồ, dự báo, sáu thành phần reward và cân bằng nước của bước vừa chạy.
5. Chọn chạy hết với mức tưới cố định hoặc ngẫu nhiên. Khi kết thúc, các nút chạy
   bị khóa và màn hình giải thích nguyên nhân dừng.
6. **Tải lịch sử CSV** trước khi khởi tạo lại để giữ dữ liệu. Mỗi phiên trình duyệt
   có môi trường riêng; tải lại/đóng phiên có thể mất lịch sử chưa tải xuống.

Ctrl+C trong terminal để dừng. Nếu cổng bận, thêm `--server.port 8502` và mở
http://localhost:8502. Giao diện dùng môi trường thật, chưa có học hoặc so sánh
thuật toán. Mưa thực chỉ xuất hiện sau bước; biểu đồ mưa mm và tưới L tách riêng.

Kiểm tra sau bổ sung giao diện: **165 tests passed**, gồm hai bài Streamlit AppTest
kiểm tra chạy từng bước, kết thúc, reset, tưới cố định và hai phiên độc lập.

### CLI và kiểm tra

Mở terminal ở thư mục gốc repository (có configs/, agriwater/, requirements.txt).
Không cần kích hoạt .venv; gọi trực tiếp Python để tránh nhầm interpreter:

```powershell
.venv/Scripts/python.exe --version
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
```

Dùng Python 3.13. Nếu chưa có .venv, tạo bằng `py -3.13 -m venv .venv`, rồi cài
`.venv/Scripts/python.exe -m pip install -r requirements.txt`. Không tạo đè môi
trường hiện có. Nếu đã di chuyển thư mục dự án, kiểm tra interpreter và cài lại
môi trường khi cần; `.venv` không phải artifact để chuyển giữa máy.

Máy này có lỗi quyền thư mục cache/temp cũ. Nếu pytest báo Access denied ở temp,
có thể dùng thư mục mới trong logs (đặt tên mới cho mỗi lần, vì pytest dọn basetemp):

```powershell
.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider --basetemp logs/pytest-presentation-01
```

Lệnh demo (tên output mới để giữ kết quả cũ):

```powershell
.venv/Scripts/python.exe -X utf8 -m agriwater.environment.demo --scenario dry --seed 42 --output results/presentation-dry.csv
.venv/Scripts/python.exe -X utf8 -m agriwater.environment.demo --scenario stormy --seed 42 --action 0 --output results/presentation-stormy.csv
.venv/Scripts/python.exe -X utf8 -m agriwater.environment.demo --scenario random --seed 42 --output results/presentation-random.csv
```

Không truyền --action: lấy hành động ngẫu nhiên. --action 0..5: giữ mức tưới đó
mỗi ngày (0,5,10,15,20,25 L). --seed kiểm soát tính tái lập. --output lưu CSV,
tự tạo thư mục cha. File tồn tại thì dừng, chỉ dùng --force khi chủ động muốn ghi đè.
-X utf8 giúp in tiếng Việt đúng trong terminal.

Mở CSV bằng Excel hoặc lệnh `Import-Csv results/presentation-dry.csv`.
Mỗi dòng là một ngày đã thực hiện, gồm action, nước, mưa, độ ẩm sau bước, reward,
sáu thành phần, is_ideal/is_stressed và terminated/truncated. Không phải Q-table.

## 3. Kết quả đã chạy để đối chiếu

| Scenario / đầu vào | Seed | Số ngày | Nước tưới | Tổng reward | Diễn giải |
|---|---|---|---|---|---|
| dry / random action | 42 | 30 | 420 L | −2192 | Chạy hết thời hạn; tưới ngẫu nhiên có nhiều phạt |
| stormy / action 0 | 42 | 4 | 0 L | −190 | Mưa gây ngập, kết thúc sớm dù không tưới |
| random / random action | 42 | 3 | 35 L | −198 | Điều kiện ngập dẫn tới kết thúc sớm |

CSV đã chạy: results/report-dry-42.csv, report-stormy-42.csv, report-random-42.csv.
Các file này bị gitignore; người khác phải chạy lệnh để tạo lại.
Kết quả phụ thuộc cấu hình hiện tại và phiên bản NumPy. Khi đổi YAML, bảng trên là
mốc lịch sử, cần chạy và ghi lại kết quả mới. Không so tổng nước của episode chết
sớm với episode sống đủ 30 ngày để kết luận tối ưu. Không tuyên bố RL tiết kiệm
nước khi chưa huấn luyện hoặc đánh giá chính sách.

## 4. Trưởng trình bày gì (khoảng 4 phút)

**Mở đầu:** “Em phụ trách xây dựng môi trường nhận hành động tưới, mô phỏng một
ngày và trả lại trạng thái, phần thưởng cùng thông tin kiểm tra.”

Mở agriwater/environment/agriwater_env.py và giải thích:

1. Observation là ndarray float32 có 7 phần tử trong [0,1]. Crop và stage mã 0..3
   chia 3; moisture giữ nguyên; nhiệt độ (T−15)/30; xác suất giữ nguyên; dự báo/50;
   lượng tưới bước trước/25. Action là chỉ số 0..5, không phải số lít.
2. reset đọc snapshot YAML, chọn trạng thái đầu, sinh/copy weather max_days+1
   bản ghi. Bản ghi cuối cung cấp dự báo cho observation sau ngày cuối.
3. step giữ state cũ; ánh xạ action sang lít; lấy thời tiết ngày hiện tại; tính
   nước sau; cập nhật stage và dự báo kế tiếp; gọi reward của Minh; kiểm tra dừng.
4. returned observation là bản sao. Nếu reward lỗi, không lưu bước dở dang.
5. terminated báo điều kiện chết cây giả lập; truncated báo hết số ngày. Hai cờ
   có thể cùng đúng. Sau kết thúc phải reset mới được step.

Mở weather.py: dùng RNG riêng, sinh toàn chuỗi trước action. Nhiệt độ, xác suất
và lượng dự báo lấy uniform trong khoảng cấu hình. Bernoulli quyết định có mưa;
nếu có thì lượng thực bằng dự báo. Chưa mô phỏng sai số lượng mưa hay tương quan
nhiều ngày. Các agent tương lai cần cùng chuỗi và cùng trạng thái đầu để đối chứng.

**Công thức cân bằng nước (đơn vị L):**

```text
W_before = soil_moisture × soil_capacity_liters
I = action_liters[action] × irrigation_efficiency × hệ số tưới lặp (nếu có)
R = actual_rain_mm × plot_area_m2 × rain_efficiency
ET_demand = (ET_base + slope × (T−15)) × crop_factor × stage_factor
ET = min(W_before + I + R, ET_demand)
D = min(phần vượt drainage_threshold × capacity, drainage_liters_per_day)
D += phần còn vượt capacity (nước tràn)
W_after = W_before + I + R − ET − D
next_moisture = W_after / capacity
```

Info.water_balance ghi các đại lượng này để test tính tay. Không cộng mm trực tiếp
với lít hoặc độ ẩm. Một mm mưa trên một m² bằng một lít.

**Ví dụ một bước:** crop=0, stage=0, moisture=0,50; T=15°C, không mưa, action=2.
W_before=50 L; I=10×0,85=8,5 L; ET=3×0,9×0,7=1,89 L; không tiêu thoát.
W_after=56,61 L → độ ẩm 0,5661. Reward khi không có dự báo mưa/tưới trước lớn:
+10 health −4 water = **+6**. Đây là ví dụ với dữ liệu weather truyền vào để kiểm tra.

## 5. Minh trình bày gì (khoảng 4 phút)

**Mở đầu:** “Em phụ trách đọc cấu hình chung, chuyển mục tiêu bài toán thành hàm
reward có thể kiểm thử, và viết chương trình thử môi trường xuất dữ liệu.”

Mở config.py: chỉ nhận environment/scenarios/training, đọc safe_load từ đường dẫn
repo, báo lỗi YAML/file/mapping. Mỗi consumer kiểm tra phần cấu hình mình cần.

Mở agents/reward.py: reward thuộc môi trường, không phải thuật toán học. Health và
stress dùng next_state; waste/rain/delay dùng state trước tưới. Đọc giai đoạn mới
bằng giải mã /3. Trả tổng và đủ sáu khóa, kể cả khi giá trị bằng 0.

| Thành phần | Giá trị/điều kiện |
|---|---|
| R_health | +10 nếu moisture mới trong vùng lý tưởng |
| R_stress | −100 nếu moisture mới <0,20 hoặc >0,85 |
| R_water | −2×action |
| R_waste | −10×action nếu moisture cũ ≥0,60 |
| R_rain | −5×action nếu p≥0,70 và forecast≥15 mm |
| R_delay | −8×action nếu bước trước tưới ≥12,5 L |

Vùng lý tưởng stage=2 là [0,50;0,75], stage khác [0,40;0,70], bao gồm biên.
Action=0 làm các phạt tưới bằng 0. Tổng là tổng sáu thành phần, không phải xác suất.
Ví dụ tất cả penalty: state moisture=0,60, p=0,70, forecast=15 mm, last=12,5 L;
action=2, next moisture=0,90 → 0−100−4−20−10−16=**−150**.

Giải thích sửa lỗi merge: không chấp nhận mã chuẩn hóa 0,5 là stage hợp lệ rồi
âm thầm làm tròn; chỉ nhận biểu diễn float32 của 0,1/3,2/3,1. Environment truyền
`config=` snapshot cho reward để dynamics/threshold/reward cùng cấu hình trong
một episode. Gọi reward ba đối số như trước vẫn được, đọc YAML hiện tại.

Mở demo.py: random action dùng RNG riêng, fixed action giữ một mức, dừng ở một
trong hai cờ, luôn đóng env, lưu đủ component ra CSV. Không cập nhật giá trị Q,
không neural network, không loss. Không gọi random action là baseline đã học.

## 6. Các giả định cấu hình phải nói rõ

Các số dưới là **cấu hình demo đề xuất**, báo cáo DOCX không cung cấp đủ số để
hiệu chuẩn chúng. Mục đích là kiểm tra phần mềm; cần nhóm/thầy review trước dùng
cho kết luận thực nghiệm nghiêm túc. Chúng nằm trong YAML, không hardcode vào dynamics.

| Thông số | Demo hiện tại |
|---|---|
| Ô đất / sức chứa | 1 m² / 100 L |
| Hiệu suất tưới / mưa | 0,85 / 0,80 |
| ET nền tại 15°C / slope | 3 L/ngày / 0,15 L/ngày/°C |
| Hệ số cây 0..3 | [0,9;1,0;1,1;1,2] |
| Hệ số stage 0..3 | [0,7;1,0;1,2;0,8] |
| Tiêu thoát | tối đa 5 L/ngày trên moisture 0,70; cộng nước tràn |
| Tưới lặp | lần trước ≥12,5 L → nhân hiệu suất thêm 0,75 |
| Stage / chết cây | mốc ngày 8,16,24 / moisture ≤0,05 hoặc ≥0,95 |
| Reset | crop=0, stage=0, moisture uniform [0,40;0,70], last=0 |
| dry | T 35–42°C, p 0–0,05, forecast 0–5 mm |
| stormy | T 20–30°C, p 0,70–1, forecast 15–50 mm |
| random | T 15–45°C, p 0–1, forecast 0–50 mm |

## 7. Đối chiếu DOCX và các câu hỏi thầy có thể hỏi

Đã đọc bản DOCX trong docs, đặc biệt mục III.2 và IV. Văn bản trích xuất không có
khác biệt so với DOCX ở HEAD tại lần kiểm tra này; thay đổi nhị phân có thể thuộc
metadata/định dạng. Không tự sửa DOCX của nhóm.

| Điểm trong DOCX | Cách triển khai / điều cần giải thích |
|---|---|
| III.2.2 nói bước 1 phút; IV nói mùa 30 ngày | Code dùng một bước một ngày, lượng tưới là L/ngày; phút bơm là hoạt động trong ngày, không đổi ET/ngày thành ET/phút. Nhóm cần thống nhất lại câu chữ DOCX |
| Ví dụ Q-table K=3 (864) và đoạn khác K=4 (4320) | Môi trường giữ 4 mã cây theo hợp đồng; chưa rời rạc hóa hoặc tạo Q-table |
| Mã giả so sánh g_next==2 trong state chuẩn hóa | Code giải mã trước so sánh, dùng next_stage đúng công thức gt+1 |
| FAO-56 Penman-Monteith “thu nhỏ” | Code chỉ ET tuyến tính theo T và hệ số; không khẳng định đã cài FAO-56 |
| “Đảm bảo Markov” | Lịch stage phụ thuộc ngày mà observation không có ngày; cần nói rõ giới hạn này, chưa khẳng định MDP đầy đủ. Chưa tự đổi 7 chiều |
| Stress và cây chết | Stress <0,20/>0,85 là reward; chết ≤0,05/≥0,95 là giả định riêng |
| Baseline ví dụ 500 bước | Không triển khai baseline; môi trường mặc định 30 ngày |

**Vì sao có reward khi chưa học?** Reward là đầu ra của môi trường; agent tuần sau
mới sử dụng nó để cập nhật chính sách.

**Có chứng minh tiết kiệm nước chưa?** Chưa. Hiện chứng minh API và mô hình mô
phỏng hoạt động/tái lập, chưa chứng minh phương pháp RL tốt hơn đối chứng.

**Seed giống nhau đã đủ chưa?** Cần cùng trạng thái đầu, cấu hình và chuỗi thời
tiết độc lập action. reset(options={"weather":...}) cho phép replay cùng dữ liệu.

**Tuần sau bàn giao gì?** AgriWaterEnv, schema observation/action, reward, các
scenario và test/CSV; thành viên khác cắm agent qua API public. Cần giải quyết
giới hạn thời gian/Markov và review hệ số trước khi diễn giải kết quả học.
