# Kế hoạch kiểm thử môi trường (chưa triển khai)

Hiện chỉ chạy được kiểm thử bộ khung. Test mô phỏng và reward được skip có lý do; không coi skipped là nghiệm thu môi trường.

```powershell
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
```

Sau khi Trưởng và Minh hoàn thành:

1. Bật test Gymnasium và reward; bổ sung test cân bằng nước, biên, action/options không hợp lệ, terminated/truncated và seed.
2. Viết demo chạy hành động cố định hoặc ngẫu nhiên, không học. Entry point dự kiến: python -m agriwater.environment.demo; hiện chỉ báo chưa triển khai, CLI chưa chốt.
3. Chạy dry/stormy/random, ghi seed và bản sao cấu hình. Kiểm tra cùng input cho cùng kết quả; dùng chuỗi thời tiết tạo trước và cùng trạng thái đầu để đối chứng.
4. Xuất CSV gồm ngày, action, lít nước, mưa, độ ẩm, reward từng thành phần và cờ dừng. Ghi số ngày thực chạy; cây chết sớm không có nghĩa tiết kiệm nước tốt.
5. Đưa kết quả kiểm chứng môi trường vào báo cáo, phân biệt giả định mô phỏng với dữ liệu thực địa.

Huấn luyện, loss, hội tụ và so sánh thuật toán dành cho giai đoạn sau.

## Hồ sơ nghiệm thu sau triển khai

| Nhóm kiểm tra | Bằng chứng cần có |
|---|---|
| Gymnasium | check_env và reset/step thật, không mock reward |
| Reward | Sáu thành phần, biên float32, stage next_state, input không đổi |
| Vật lý | Một bước tính tay khớp code, cùng đơn vị |
| Weather | Seed tái lập, thời tiết không phụ thuộc action |
| Kết thúc | terminated/truncated riêng, không step sau kết thúc |
| Demo | CSV ba scenario, lệnh/seed/cấu hình, số ngày thực chạy |

Lưu dữ liệu sinh ra ở results/ hoặc logs/. Nếu hệ số chưa chốt, báo thiếu cấu hình;
không điền 0 để tạo kết quả. PR ghi cách tái lập thay vì commit dữ liệu sinh tự động.
