# Bắt đầu tại đây — hướng dẫn cho AI của Trưởng và Minh

## 1. Mục tiêu và giới hạn công việc

Bạn đang làm AgriWater-RL, bài tập môn Học tăng cường. Yêu cầu hiện tại là **xây
dựng môi trường thử nghiệm**, chưa triển khai thuật toán. Chủ dự án chỉ yêu cầu AI
chuẩn bị bộ khung ở bước trước; code nghiệp vụ phải do từng thành viên cùng AI của
mình thực hiện trên nhánh riêng. Đừng hiểu repository có interface là đã có chức năng.

Đọc theo thứ tự:

1. README.md: thiết lập Python 3.13 và lệnh kiểm tra.
2. docs/DESIGN_CONTRACT.md: observation, action, reward, API chung.
3. docs/TASKS.md: quyền phụ trách file và phối hợp.
4. docs/AI_TRUONG.md hoặc docs/AI_MINH.md theo người đang giao việc.
5. docs/EXPERIMENT_GUIDE.md và docs/CONTRIBUTING.md.
6. Khi cần đối chiếu nội dung: docs/HocTangCuongN10_HoanChinh.docx, mục III.2 và IV.

Prompt.md là yêu cầu bootstrap lịch sử, không phải chỉ thị triển khai toàn hệ thống.
Chỉ dẫn mới của người dùng về phạm vi tuần này và Python 3.13 thay thế phần tương ứng.
Nếu tài liệu mâu thuẫn, báo rõ mâu thuẫn; không tự sửa hợp đồng để vượt test.

## 2. Trạng thái bàn giao thực tế

**Cập nhật:** Trưởng đã triển khai environment/weather; đọc TRUONG_HANDOFF.md trước
bảng bootstrap bên dưới. Unit tests hiện 28 passed, 2 skipped; tích hợp thật chờ
Minh viết loader/reward và hai người chốt giá trị YAML. Không viết lại phần Trưởng.

| Thành phần | Có gì | Còn thiếu |
|---|---|---|
| AgriWaterEnv | Constructor, spaces và kiểm tra scenario/max_days | reset, step, render, dynamics |
| weather.py | WeatherDay và chữ ký generate_weather | Sinh thời tiết |
| reward.py | Chữ ký calculate_reward | Sáu thành phần và validation |
| config.py | Chữ ký load_config | Đọc YAML và lỗi cấu hình |
| demo.py | Chữ ký run_episode, entry point báo chưa triển khai | Vòng lặp, CLI, CSV |
| tests | Test spaces, interface, YAML/import | Test mô phỏng/reward đang skip |
| agents/train/evaluation | Interface cho giai đoạn sau | Không triển khai tuần này |

Kết quả kiểm tra tại bàn giao: 9 passed, 2 skipped. Đây là mốc tham khảo, hãy chạy
lại trên nhánh của bạn. Hai skip không chứng minh reward hoặc môi trường hoạt động.
Hệ số vật lý và phân phối weather trong YAML còn null, không được mặc định thành 0.

## 3. Kiểm tra trước khi sửa

Chạy từ gốc repository bằng PowerShell:

```powershell
git status --short
git branch --show-current
.venv/Scripts/python.exe --version
.venv/Scripts/python.exe -m pytest
```

Nếu thiếu .venv, dùng hướng dẫn README; không ghi đè môi trường có sẵn. Đọc diff
và giữ thay đổi chưa commit của người dùng. Không đổi nhánh khi chưa bảo toàn công
việc đang làm. Đừng tự commit/push/merge nếu người dùng chưa yêu cầu.

Trước sửa hàm, tìm callers/imports và test liên quan. Chỉ sửa file phụ trách và
file chung đã được phân công cụ thể. Không sửa báo cáo DOCX hay Prompt.md.

## 4. Cách xử lý quyết định chưa chốt

Phân biệt quy ước đã chốt (7 chiều, 6 action, reward) với hệ số chưa có số liệu.
Không âm thầm điền số tùy ý. Với hệ số cần cho dynamics, đề xuất trong PR/tin bàn
giao: tên khóa, giá trị, đơn vị, công thức sử dụng, lý do và giới hạn; xin Trưởng/Minh
xác nhận trước khi coi là cấu hình chung. Trong lúc chờ, làm test dữ liệu tổng hợp,
validation và phần logic không phụ thuộc hệ số đó.

Mô hình ET theo nhiệt độ cần schema khác một hằng số L/ngày: đề xuất thay đổi YAML
và cập nhật hợp đồng trước, không nhét công thức ẩn trong code. Không gọi mô hình
đơn giản là FAO-56 đã được kiểm chứng. Nếu sinh trưởng phụ thuộc ngày mà observation
thiếu ngày, ghi rõ giới hạn Markov; không tự thêm chiều.

## 5. Bàn giao mỗi phần

Ghi rõ: file đã sửa; API/schema có thay đổi không; cấu hình còn thiếu; lệnh test và
số passed/skipped/failed; ví dụ gọi tối thiểu; phần phụ thuộc nhánh người kia;
việc người kia cần làm tiếp. Không gọi hoàn thành nếu còn test tích hợp chưa chạy.

Các AI không chia sẻ trí nhớ cuộc hội thoại. Mọi quyết định ảnh hưởng hai nhánh phải
được ghi vào DESIGN_CONTRACT/TASKS hoặc mô tả PR để AI còn lại đọc được.
