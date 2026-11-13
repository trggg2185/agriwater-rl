# Hợp đồng kỹ thuật hiện hành — môi trường AgriWater-RL

Phạm vi: môi trường thử nghiệm đã tích hợp, chưa triển khai thuật toán. Python 3.13. Nguồn nghiệp vụ: mục III.2 và IV của docs/HocTangCuongN10_HoanChinh.docx. Chi tiết báo cáo và các điểm chưa nhất quán: [BAO_CAO_MOI_TRUONG](BAO_CAO_MOI_TRUONG.md). Hợp đồng này thay thế các đề xuất trước merge.

## Observation và action

Observation là ndarray float32, shape=(7,), Box(0,1).

| Index | Thuộc tính | Miền thực | Chuẩn hóa |
|---|---|---|---|
| 0 | crop_type | int 0..3 | /3 |
| 1 | growth_stage | int 0..3 | /3 |
| 2 | soil_moisture | 0..1 | giữ nguyên |
| 3 | temperature | 15..45°C | (T−15)/30 |
| 4 | rain_probability | 0..1 | giữ nguyên |
| 5 | rain_forecast_mm | 0..50 mm | /50 |
| 6 | last_irrigation | 0..25 L | /25 |

Mã cây/stage phải đúng biểu diễn float32 của 0,1/3,2/3,1; giải mã bằng round(value*3). Không làm tròn 0,5 thành mã hợp lệ. Last_irrigation là lượng tưới ở bước ngay trước, kể cả 0, không phải thời gian từ lần tưới cuối.

Discrete(6): action 0..5 ánh xạ [0,5,10,15,20,25] L. Từ chối bool, float và chỉ số ngoài miền. Không thay đổi thứ tự, chuẩn hóa hoặc số chiều mà không cập nhật hợp đồng/test.

## API và vòng đời

`AgriWaterEnv(scenario=None,max_days=None,render_mode=None)` lấy mặc định từ YAML (random,30), hoặc dùng override của caller. Một step là một ngày. render_mode hỗ trợ None và ansi.

`reset(*,seed=None,options=None)` trả (observation,info), gọi super().reset(seed=seed), lấy snapshot environment config. Options cho phép crop_type, growth_stage, soil_moisture, weather; tên sai bị từ chối. Không truyền trạng thái đầu thì dùng initial_state từ YAML. Last_irrigation khởi tạo 0.

`step(action)` trả (observation,reward,terminated,truncated,info). Phải reset trước step và sau khi kết thúc; nếu sai ném ResetNeeded. Observation trả về là bản sao. Reward lỗi thì không lưu transition dở dang. `render()` trả chuỗi trạng thái khi mode=ansi, còn lại None.

- terminated: độ ẩm sau bước ≤ngưỡng chết thấp hoặc ≥ngưỡng chết cao.
- truncated: đạt max_days.
- Hai cờ độc lập, **có thể cùng True** nếu chết đúng ngày cuối.
- Stress <0,20/>0,85 chỉ là điều kiện reward, không phải chết cây tức thời.

## Info

Info chứa day, water_used_liters, actual_rain_mm, soil_moisture, is_ideal, is_stressed, reward_components. Nước/mưa là của bước vừa thực hiện, không phải tổng tích lũy. Reset: day=0, nước/mưa=0, reward_components={}.

Sau step, water_balance chứa before_liters, irrigation_liters, rain_liters, evapotranspiration_liters, drainage_liters, after_liters. Reward components có đủ sáu khóa dưới đây. Không dùng private state trong demo/agent.

## Weather và tái lập

`generate_weather(scenario,days,*,seed)` trả list WeatherDay gồm temperature, rain_probability, rain_forecast_mm, actual_rain_mm. Sinh uniform từng biến trong bounds YAML, Bernoulli quyết định mưa; có mưa thì actual=forecast, không mưa thì actual=0. Đây là mô hình đơn giản, chưa có tương quan nhiều ngày hay sai số lượng mưa.

Reset nhận list weather có max_days+1 bản ghi, kiểm tra miền và sao chép. Bản ghi t cung cấp dự báo/nhiệt độ observation trước action t và mưa thực của transition t→t+1. Bản ghi cuối chỉ cung cấp thời tiết observation cuối. Không đưa mưa thực vào observation trước action.

Chuỗi được tạo trước, độc lập action; demo dùng RNG hành động riêng. Đối chứng cần cùng weather, cùng trạng thái đầu và cùng cấu hình, không chỉ cùng seed.

## Reward

`calculate_reward(state,action,next_state,*,config=None)` trả (float,dict[str,float]). Ba đối số cũ vẫn hợp lệ; config=None đọc YAML hiện tại. Environment truyền snapshot config để reward và dynamics dùng cùng hệ số suốt episode. Không còn lru_cache/cache_clear cho reward.

| Khóa | Công thức |
|---|---|
| R_health | +10 nếu next moisture thuộc vùng lý tưởng |
| R_stress | −100 nếu next moisture <0,20 hoặc >0,85 |
| R_water | −2×action |
| R_waste | −10×action nếu current moisture ≥0,60 |
| R_rain | −5×action nếu current p≥0,70 và forecast≥15 mm |
| R_delay | −8×action nếu current last_irrigation≥12,5 L |

Vùng lý tưởng theo next_stage: stage 2 là [0,50;0,75], còn lại [0,40;0,70], bao gồm biên. Không thỏa thì 0; action=0 thì phạt tưới=0. So sánh ngưỡng theo float32, không epsilon rộng. Tổng bằng tổng sáu thành phần, không sửa arrays đầu vào.

## Dynamics và đơn vị

Nước trước = moisture × capacity. Tưới hiệu dụng = lít tưới × hiệu suất; nhân thêm hệ số tưới lặp nếu lượng tưới trước đạt ngưỡng. Mưa hiệu dụng = mm × diện tích m² × hiệu suất (1 mm trên 1 m² = 1 L).

ET yêu cầu = (ET nền tại 15°C + slope×(T−15)) × crop_factor × stage_factor; ET thực không vượt nước sẵn có. Sau ET, tiêu thoát tối đa drainage_liters_per_day trên phần vượt drainage_threshold×capacity. Nước còn vượt capacity được cộng vào drainage như nước tràn. Nước sau = trước+tưới+mưa−ET−drainage; chia capacity ra next_moisture.

Thứ tự: giữ state cũ → tưới → weather ngày hiện tại → cân bằng → ngày/stage → next_state và dự báo kế tiếp → reward → cờ dừng → lưu state/trả kết quả. Stage=min(3,initial_stage+số mốc ngày đã đạt).

## Cấu hình và giới hạn

load_config chỉ nhận environment/scenarios/training, dùng safe_load theo gốc repo và kiểm tra mapping. Consumer kiểm tra miền. environment.yaml/scenarios.yaml hiện có giá trị demo, ghi rõ chưa hiệu chuẩn. Xem bảng thông số trong BAO_CAO_MOI_TRUONG; YAML là nguồn giá trị thực thi duy nhất.

Mặc định capacity=100 L, diện tích=1 m², trạng thái đầu crop/stage=0 và moisture uniform [0,40;0,70], mốc stage=[8,16,24], ngưỡng chết=[0,05;0,95]. Không coi đây là hệ số đã được thầy xác nhận hoặc chuẩn FAO-56.

Lịch sinh trưởng phụ thuộc ngày nhưng observation không có ngày; chưa khẳng định MDP đầy đủ. Cần thảo luận trước huấn luyện, không tự đổi bảy chiều lúc này. Mã cây là nhóm giả lập, chưa hiệu chuẩn theo giống thật.

Các module agents khác/train/evaluate chỉ giữ interface cho tuần sau. Không chốt bins Q-table hoặc thuật toán trong phạm vi môi trường này.
