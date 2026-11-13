# Phân công xây dựng môi trường thử nghiệm

AI đọc [AI_START_HERE](AI_START_HERE.md), rồi [AI_TRUONG](AI_TRUONG.md) hoặc
[AI_MINH](AI_MINH.md). Hướng dẫn vai trò có thứ tự thực hiện và test cụ thể.

Hiện repository chỉ có bộ khung, cấu hình mẫu và hợp đồng kỹ thuật. Mục tiêu tuần này theo mục III–IV của HocTangCuongN10_HoanChinh.docx là để Trưởng và Minh tự triển khai môi trường thử nghiệm. Chưa triển khai thuật toán học.

| Người | File phụ trách | Công việc cần viết | Tiêu chí hoàn thành |
|---|---|---|---|
| Nguyễn Thế Trưởng | agriwater/environment/agriwater_env.py, agriwater/environment/weather.py, tests/test_environment.py | reset/step/render, cân bằng nước, thời tiết ba kịch bản có seed | Gymnasium check_env đạt; đúng đơn vị; kiểm thử seed, kết thúc và chuỗi thời tiết độc lập hành động |
| Nguyễn Minh | agriwater/agents/reward.py, tests/test_reward.py, agriwater/environment/demo.py | Sáu thành phần reward; kiểm thử biên; demo hành động cố định/ngẫu nhiên và xuất CSV | Giải chuẩn hóa đúng, tổng reward khớp thành phần, không sửa input; demo chạy sau khi tích hợp môi trường |

Hai người bắt đầu từ cùng commit bộ khung trên main, làm riêng trên feature/environment và feature/reward-demo. Trưởng có thể phát triển dynamics bằng kiểm thử riêng; Minh làm reward bằng các cặp state/next_state mẫu mà không cần môi trường hoàn chỉnh. Demo tích hợp sau khi reset/step và reward sẵn sàng. Không thay reward bằng kết quả giả để tuyên bố môi trường đã hoàn thành.

## File chung cần thống nhất trước khi sửa

README.md, requirements.txt, pyproject.toml, configs/*, agriwater/config.py, docs/DESIGN_CONTRACT.md, agriwater/agents/base_agent.py, tests/test_interfaces.py.

Hai người thống nhất hệ số cân bằng nước, trạng thái đầu, lịch giai đoạn, ngưỡng chết cây (khác stress) và phân phối thời tiết. null trong YAML là chưa quyết định, không phải số 0. Minh là đầu mối viết config.py, Trưởng review và sử dụng. Mọi thay đổi hợp đồng phải ghi ảnh hưởng trong PR.

## Thứ tự tích hợp

1. Minh làm loader/reward và test bằng state mẫu; Trưởng làm weather/dynamics,
   đề xuất hệ số còn null.
2. Minh bàn giao loader/reward qua PR nhỏ; Trưởng cập nhật nhánh và nối vào step
   sau khi thao tác Git được người dùng cho phép.
3. Trưởng bàn giao reset/step/weather; Minh nối demo/CLI/CSV.
4. Cả hai chạy toàn suite, ba scenario và kiểm tra tái lập rồi mới nghiệm thu.

Mock chỉ dùng trong unit test. Khi dependency chưa có, ghi test chưa kiểm tra
tích hợp, không đưa placeholder thành công vào production.

## Giai đoạn sau

Baseline, Q-Learning, DQN, huấn luyện, benchmark và dashboard so sánh vẫn giữ interface để mở rộng, không thuộc nhiệm vụ tuần này. Báo cáo có năm thành viên; bảng này chỉ phân công hai người đang phát triển repository.
