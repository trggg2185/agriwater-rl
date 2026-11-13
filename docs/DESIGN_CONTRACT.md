# Hợp đồng kỹ thuật AgriWater-RL

Trưởng và Minh phải thống nhất trước khi thay đổi API, ý nghĩa dữ liệu hoặc cấu hình.
Python sử dụng **3.13** theo quyết định của người dùng, thay cho 3.12 trong Prompt.md.
Đây là bootstrap, chưa có mô hình nông học hay thuật toán hoàn chỉnh.

## Phạm vi theo báo cáo tuần này

Nguồn: HocTangCuongN10_HoanChinh.docx, mục III–IV. Repository chỉ chuẩn bị interface,
cấu hình và tài liệu để Trưởng/Minh tự triển khai môi trường, thời tiết, reward và
demo không học. Mục V (thuật toán dự kiến) dành giai đoạn sau.
Reward thuộc phản hồi môi trường dù giữ đường dẫn agents/reward.py để tương thích.
Demo và config loader mới có chữ ký, chưa có logic thực thi.

## Observation và action

Observation là `np.ndarray`, `dtype=np.float32`, `shape=(7,)`.
`spaces.Box(low=0.0, high=1.0, shape=(7,), dtype=np.float32)`.

| Index | Thuộc tính | Miền thực tế | Chuẩn hóa |
|---|---|---|---|
| 0 | crop_type | số nguyên 0–3 | crop_type / 3 |
| 1 | growth_stage | số nguyên 0–3 | growth_stage / 3 |
| 2 | soil_moisture | 0–1 | giữ nguyên |
| 3 | temperature | 15–45 °C | (temperature − 15) / 30 |
| 4 | rain_probability | 0–1 | giữ nguyên |
| 5 | rain_forecast_mm | 0–50 mm | rain_forecast_mm / 50 |
| 6 | last_irrigation | 0–25 lít | last_irrigation / 25 |

Không đổi thứ tự, số chiều hay chuẩn hóa. Giải mã crop_type và growth_stage
về số nguyên (làm tròn giá trị nhân 3) trước khi xử lý nghiệp vụ;
không so sánh growth_stage đã chuẩn hóa với số nguyên 2.
Khi triển khai phải kiểm tra shape, dtype, miền hữu hạn và mã loại/giai đoạn hợp lệ.

`spaces.Discrete(6)`: action 0, 1, 2, 3, 4, 5 tương ứng 0, 5, 10, 15, 20, 25 lít.
Action là chỉ số; water_liters là thể tích. Ánh xạ cấu hình tại environment.yaml.

## Thời gian và Gymnasium

Một step = một ngày; mặc định tối đa 30 ngày/episode. Đây là quy ước mô phỏng,
không phải thông số đã được kiểm chứng bằng dữ liệu thực địa.
`terminated=True` cho kết thúc sinh học (điều kiện chưa chốt).
`truncated=True` khi đạt max_days; không dùng hai cờ thay thế nhau.

`AgriWaterEnv(scenario="random", max_days=30)` khai báo spaces và kiểm tra tham số.
`reset(*, seed=None, options=None)` sẽ trả `(observation, info)`;
`step(action)` sẽ trả `(observation, reward, terminated, truncated, info)`.
`render()` chưa triển khai. Hiện reset/step/render đều báo NotImplementedError.
Khi triển khai reset cần gọi `super().reset(seed=seed)`.
Info tối thiểu: `day`, `water_used_liters`, `actual_rain_mm`, `soil_moisture`,
`is_ideal`, `is_stressed`, `reward_components`; lượng nước/mưa tính cho bước hiện tại.

## Thời tiết công bằng

Ba kịch bản: dry (khô hạn), stormy (mưa nhiều), random (ngẫu nhiên).
`generate_weather(scenario, days, seed=...)` sẽ tạo trước chuỗi WeatherDay,
gồm temperature (°C), rain_probability, rain_forecast_mm và actual_rain_mm.
Các chính sách phải dùng cùng chuỗi theo ngày, độc lập với hành động.
Chỉ truyền cùng seed là chưa đủ nếu chính sách tiêu thụ RNG khác nhau.
Đặc tả bàn giao cho hai nhánh (chưa triển khai): reset options nhận `weather` là
list WeatherDay có max_days+1 bản ghi. Ngày t dùng dự báo/nhiệt độ của bản ghi t
cho state trước action và actual_rain của bản ghi t cho chuyển trạng thái. Bản ghi
cuối chỉ cung cấp thời tiết observation cuối. Không lộ actual_rain trước action;
kiểm tra miền và sao chép chuỗi để không sửa dữ liệu caller.
Options thêm: crop_type/growth_stage nguyên 0–3 và soil_moisture hữu hạn 0–1.
Giá trị mặc định cần chốt trong cấu hình ban đầu, không tự điền số. Từ chối tên
options sai. Cùng weather nhưng khác trạng thái đầu chưa phải đối chứng công bằng.

## Reward duy nhất

`calculate_reward(state, action, next_state) -> tuple[float, dict[str, float]]`
trong agents/reward.py. Environment phải gọi hàm này, không có reward thứ hai.
Các thành phần không thỏa điều kiện có giá trị 0; tổng bằng tổng dictionary.

| Khóa | Điều kiện và giá trị |
|---|---|
| R_health | +10 nếu độ ẩm next_state trong khoảng lý tưởng (bao gồm hai biên) |
| R_stress | −100 nếu độ ẩm next_state < 0,20 hoặc > 0,85 |
| R_water | −2 × action |
| R_waste | −10 × action nếu độ ẩm state ≥ 0,60 và action > 0 |
| R_rain | −5 × action nếu dự báo state có xác suất ≥ 0,70 và lượng ≥ 15 mm, action > 0 |
| R_delay | −8 × action nếu last_irrigation của state ≥ 12,5 lít và action > 0 |

Khoảng lý tưởng: giai đoạn 2 là [0,50; 0,75], còn lại [0,40; 0,70].
Dùng giai đoạn next_state cho R_health theo công thức gt+1 tại mục III.2.3 của
báo cáo; giải mã giá trị chuẩn hóa trước khi so sánh và kiểm thử bước chuyển giai đoạn.
Dự báo và lần tưới trước phải giải chuẩn hóa (nhân 50 và 25).
Hệ số thưởng nằm duy nhất trong configs/environment.yaml, không sao chép vào agent.

## Chuyển trạng thái

Nước sau bước = Nước trước bước + nước tưới hiệu dụng + nước mưa hiệu dụng
− bốc thoát hơi − tiêu thoát.
Đổi đơn vị trước khi cộng: 1 mm mưa trên 1 m² tương ứng 1 lít.
Các hệ số vật lý, diện tích, sức chứa đất, mốc tăng trưởng và điều kiện kết thúc
chưa có dữ liệu nên để null trong environment.yaml; null không được diễn giải là 0.
Không khẳng định đây là tiêu chuẩn FAO-56. Cần hiệu chuẩn trước ứng dụng thực tế.

Thứ tự bắt buộc:

1. Giữ bản sao state hiện tại và nhận action.
2. Ánh xạ action sang lượng nước.
3. Lấy thời tiết ngày hiện tại.
4. Tính cân bằng nước và độ ẩm mới.
5. Cập nhật giai đoạn nếu đến mốc.
6. Xây dựng next_state.
7. Tính reward từ state, action, next_state chưa bị ghi đè.
8. Kiểm tra kết thúc sinh học và giới hạn ngày.
9. Trả kết quả cho Agent.

## Agent và cấu hình

BaseAgent là ABC với `select_action(state, training=False) -> int`.
Baseline không bắt buộc learn/save/load. Q-Learning và DQN chưa có thuật toán;
Minh phải thống nhất API học chung trước khi viết train, không đọc private fields.
Evaluation chỉ gọi select_action với training=False.
Các entry point train/evaluate hiện dừng với thông báo bootstrap.

environment.yaml quản lý môi trường, ánh xạ hành động, ngưỡng và reward;
scenarios.yaml quản lý phân phối thời tiết; training.yaml quản lý seed và siêu tham số
phân nhóm Q-Learning/DQN. Các giá trị training là đề xuất khởi đầu, không tối ưu đã chứng minh.
Khi triển khai, mọi tham số thực nghiệm phải được đọc từ ba cấu hình này;
các default của constructor là API tiện dụng, runner phải truyền giá trị đã đọc từ YAML.
agriwater/config.py khai báo load_config(name), chưa triển khai. Minh viết loader,
Trưởng review. Tên hợp lệ: environment/scenarios/training; đọc safe_load theo đường
dẫn repository, kiểm tra mapping. Consumer kiểm tra phần cần dùng: reward không
bị chặn bởi null vật lý, environment/weather phải từ chối null bắt buộc trước chạy.

Các điểm phải chốt trước khi triển khai: mã cây, trạng thái đầu, hệ số ET/tiêu thoát,
lịch giai đoạn, ngưỡng chết khác ngưỡng stress và phân phối weather. Không dùng các
hệ số tự chọn như dữ liệu thực địa hoặc khẳng định là FAO-56. Nếu lịch sinh trưởng
phụ thuộc ngày nhưng observation thiếu ngày, cần đánh giá lại tính Markov trước
khi huấn luyện. Chưa tự thêm chiều observation hay chốt hệ số thay hai thành viên.
