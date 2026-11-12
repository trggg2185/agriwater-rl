# Phân công và tiêu chí hoàn thành

| Người | File phụ trách | Tiêu chí hoàn thành |
|---|---|---|
| Nguyễn Thế Trưởng | agriwater/environment/agriwater_env.py; agriwater/environment/weather.py; tests/test_environment.py | Cân bằng nước có đơn vị, seed tái lập, chuỗi độc lập action, Gymnasium check_env đạt, kiểm thử kết thúc và mốc giai đoạn |
| Nguyễn Thế Trưởng | agriwater/evaluation/evaluate.py; agriwater/evaluation/metrics.py; agriwater/dashboard/app.py | Đánh giá cùng thời tiết, thống kê nước/độ ẩm/reward, dashboard dùng dữ liệu thật |
| Nguyễn Minh | agriwater/agents/reward.py; tests/test_reward.py | Sáu thành phần đúng, kiểm thử biên và giải chuẩn hóa, không sửa state đầu vào |
| Nguyễn Minh | agriwater/agents/baseline.py; agriwater/agents/q_learning.py; agriwater/agents/dqn.py; agriwater/training/train.py | Baseline rõ luật, API học chung, train CPU tái lập, lưu/nạp và đánh giá không exploration |

File chung: README.md, requirements.txt, pyproject.toml, configs/*,
docs/DESIGN_CONTRACT.md, agriwater/agents/base_agent.py, tests/test_interfaces.py.
Trao đổi trước khi đổi hợp đồng, ghi ảnh hưởng trong PR và yêu cầu người còn lại review.

Thứ tự tiếp theo: Trưởng chốt hệ số cân bằng nước và mô hình thời tiết;
Minh triển khai reward cùng test biên, sau đó baseline. Hai bên tích hợp môi trường
với baseline trước khi phát triển Q-Learning, DQN, train và đánh giá.

Các quyết định cần chốt: crop codes, trạng thái ban đầu, mốc giai đoạn, kết thúc sinh học,
phân phối dự báo/mưa thực tế, hệ số vật lý, xử lý dữ liệu vượt miền, giai đoạn dùng cho
reward ở ngày chuyển giai đoạn, API học và truyền chuỗi weather, cách rời rạc hóa Q-table.
Python 3.13 đã được người dùng chấp thuận; không cần quay về 3.12.
