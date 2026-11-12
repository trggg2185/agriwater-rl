# Hướng dẫn thực nghiệm (sau khi triển khai)

Hiện chưa thể train/evaluate; không có kết quả chứng minh tiết kiệm nước.
Trước chạy phải chốt mọi null bắt buộc trong YAML, hoàn thành môi trường/reward/agent
và bật lại các test đang skip. Không coi test skip là kiểm thử thành công thuật toán.

1. Ghi commit code, Python/package versions (`python -m pip freeze`), cấu hình YAML,
   seed, phần cứng CPU và thuật toán vào hồ sơ lần chạy.
2. Tách seed huấn luyện và đánh giá. Tạo trước chuỗi thời tiết cho từng scenario/seed,
   lưu để cả baseline, Q-Learning, DQN dùng cùng trạng thái đầu và chuỗi ngày.
3. Dùng nhiều seed, thống nhất số episode và tiêu chí dừng trước khi so sánh.
   Tắt exploration khi đánh giá; không huấn luyện trên tập đánh giá.
4. Ghi mỗi ngày: action, nước lít, rain mm, độ ẩm, reward và sáu thành phần,
   is_ideal/is_stressed, terminated/truncated. Lưu models/, results/, logs/;
   không commit dữ liệu phát sinh hoặc checkpoint lớn.
5. Báo tổng nước, tổng reward, tỷ lệ ngày lý tưởng/căng thẳng trên số ngày thực chạy,
   số ngày sống và nguyên nhân dừng. Không khen tiết kiệm nước nếu cây chết sớm.
6. Đề xuất tiết kiệm (%) = 100 × (nước baseline − nước agent) / nước baseline;
   nếu baseline bằng 0 thì ghi N/A. Tổng hợp trung bình và độ lệch chuẩn qua seed,
   so sánh cặp cùng thời tiết. Hai thành viên cần xác nhận định nghĩa metric trước code.

Lệnh entry point dự kiến sau triển khai: `python -m agriwater.training.train` và
`python -m agriwater.evaluation.evaluate`; hiện chỉ báo chưa triển khai.
CLI chọn cấu hình/agent chưa chốt; không có tham số chạy thực nghiệm ở bootstrap.
Siêu tham số YAML là điểm khởi đầu đề xuất; mô phỏng chưa được kiểm chứng ngoài thực địa.
