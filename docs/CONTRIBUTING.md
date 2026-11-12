# Cộng tác với GitHub Flow

main là nhánh ổn định, không push trực tiếp. Mỗi chức năng dùng feature/...;
Conventional Commits (feat, fix, docs, test, chore). Người còn lại review PR trước merge.
Không đổi API hoặc sửa file người khác phụ trách khi chưa trao đổi.
File chung cần ghi rõ ảnh hưởng đến cả hai phần trong PR.

Ví dụ tạo nhánh (các lệnh để thành viên tự chạy, bootstrap không thực hiện):

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/weather
git add agriwater/environment/weather.py tests/test_environment.py
git commit -m "feat: implement seeded weather"
git push -u origin feature/weather
```

Mở Pull Request trên GitHub, mô tả thay đổi, API/cấu hình bị ảnh hưởng và kết quả test.
Trước merge chạy `.venv/Scripts/python.exe -m pytest`,
`.venv/Scripts/python.exe -m ruff check .` và
`.venv/Scripts/python.exe -m ruff format --check .`.

Cập nhật nhánh sau khi đã commit hoặc cất công việc đang làm:

```powershell
git fetch origin
git merge origin/main
```

Nếu xung đột: xem `git status`, trao đổi với người phụ trách, sửa từng khối
<<<<<<< / ======= / >>>>>>> để giữ logic cần thiết, chạy test/lint,
`git add <file-da-sua>` rồi `git commit`. Không lấy toàn bộ ours/theirs thiếu kiểm tra.
Nếu muốn hủy lần merge đang xung đột, dùng `git merge --abort`.
Không force push hay commit secret, môi trường ảo, checkpoint, log, dữ liệu nhạy cảm.
.gitignore không bỏ theo dõi file đã staged/tracked; .idea hiện có được giữ nguyên,
hai thành viên tự xem xét việc bỏ theo dõi riêng sau khi bảo toàn thay đổi.
