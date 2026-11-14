# Phân công xây dựng môi trường thử nghiệm

**Cập nhật sau merge:** phần môi trường của Trưởng và loader/reward/demo của Minh
đã tích hợp, kiểm tra 163 tests passed. Hai người dùng BAO_CAO_MOI_TRUONG.md để
trình bày với thầy và review các giả định. Bảng công việc dưới đây là phân công
ban đầu, không phải yêu cầu làm lại. Thuật toán để thành viên khác làm tuần sau.

AI đọc [AI_START_HERE](AI_START_HERE.md), rồi [AI_TRUONG](AI_TRUONG.md) hoặc
[AI_MINH](AI_MINH.md). Hướng dẫn vai trò có thứ tự thực hiện và test cụ thể.

Mục tiêu tuần này theo mục III–IV của HocTangCuongN10_HoanChinh.docx là triển khai
môi trường thử nghiệm, reward và demo không học. Chưa triển khai thuật toán học.

## Trạng thái hiện tại

| Phần | Trạng thái | Ghi chú |
|---|---|---|
| `config.py` + `tests/test_config.py` | Xong trên `feature/reward-demo` | `load_config` cho 3 tên, giữ `null`, lỗi rõ |
| `reward.py` + `tests/test_reward.py` | Xong trên `feature/reward-demo` | Sáu thành phần, validate, biên float32 |
| `demo.py` + `tests/test_demo.py` | Xong code + unit test | Chờ chốt YAML để chạy 3 scenario thật |
| `agriwater_env.py`, `weather.py` + `tests/test_environment.py` | Đã merge vào `feature/reward-demo` (PR #1) | Xem `TRUONG_HANDOFF.md` |
| YAML vật lý/weather | Còn `null` | Phải chốt trước khi chạy thật |
| Baseline, Q-Learning, DQN, train, evaluation, dashboard | Chưa làm | Giai đoạn sau |

Kết quả tham khảo: `feature/reward-demo` có 154 passed, 1 skipped; skip duy nhất là
`check_env` tích hợp vì YAML vật lý còn `null`. Luôn chạy lại trên nhánh đang làm;
không coi skipped là nghiệm thu.

## Phân công

| Người | File phụ trách | Công việc | Tiêu chí hoàn thành |
|---|---|---|---|
| Nguyễn Thế Trưởng | `agriwater/environment/agriwater_env.py`, `agriwater/environment/weather.py`, `tests/test_environment.py` | reset/step/render, cân bằng nước, thời tiết ba kịch bản có seed | `check_env` đạt; đúng đơn vị; kiểm thử seed, kết thúc và chuỗi thời tiết độc lập hành động |
| Nguyễn Minh | `agriwater/config.py`, `agriwater/agents/reward.py`, `agriwater/environment/demo.py`, các test tương ứng | Loader chung, sáu thành phần reward, demo hành động cố định/ngẫu nhiên và CSV | Giải chuẩn hóa đúng, tổng reward khớp thành phần, không sửa input; demo chạy được 3 scenario sau tích hợp |

Hai người bắt đầu từ cùng commit bộ khung trên `main`, làm riêng trên
`feature/environment` và `feature/reward-demo`; environment đã merge vào
`feature/reward-demo` qua PR #1. Không thay reward bằng kết quả giả để tuyên bố môi
trường đã hoàn thành.

## Checklist của Minh

Đã xong:

- [x] `load_config(name)` chỉ nhận `environment`/`scenarios`/`training`, đọc theo
      gốc repo, dùng `yaml.safe_load`, kiểm tra top-level mapping.
- [x] Loader giữ `null` là `None`, không chặn reward vì khóa vật lý còn thiếu.
- [x] Test loader: tên sai, file thiếu, YAML hỏng, non-mapping, `chdir`, `null`.
- [x] `calculate_reward` đủ sáu khóa, đúng state/next_state, validate shape/dtype/
      miền/action, không sửa input, tổng bằng tổng components.
- [x] Reward đọc hệ số từ YAML, so sánh ngưỡng bằng `float32`, có test biên và
      ví dụ chuẩn tổng `−150`.
- [x] Demo `run_episode`, RNG riêng cho action, dừng theo terminated/truncated,
      `finally: close()`, CLI `--scenario/--seed/--action/--output/--force`.
- [x] CSV đúng schema 16 cột, không ghi đè âm thầm; unit test dùng environment giả.

Còn chờ:

- [ ] Chạy `run_episode` thật cho `dry`, `stormy`, `random` sau khi chốt YAML.
- [ ] Ghi kết quả ba scenario và CSV mẫu vào `results/` hoặc mô tả trong PR.
- [ ] Gửi Trưởng ví dụ reward chuẩn, biên float32, cách dùng loader và lệnh demo.
- [ ] Cùng Trưởng chốt giá trị YAML; không tự sửa phần vật lý.

## Checklist của Trưởng

Đã xong và đã merge vào `feature/reward-demo`:

- [x] `reset()` tái lập với cùng seed; inject weather qua `options`.
- [x] `step()` tính cân bằng nước, cập nhật stage và `last_irrigation`.
- [x] `terminated`/`truncated` tách biệt, ưu tiên `terminated`.
- [x] `generate_weather` dùng RNG riêng, sinh trước chuỗi.
- [x] Unit test dynamics/weather với loader/reward giả.

Còn chờ:

- [x] Merge `feature/environment` sau khi loader/reward của Minh sẵn sàng.
- [ ] Bỏ skip `test_gymnasium_contract`, chạy `check_env` với loader/reward thật
      sau khi chốt YAML vật lý.
- [ ] Chốt và điền các giá trị `null` trong `environment.yaml`/`scenarios.yaml`.
- [ ] Chạy lại toàn suite và ba scenario cùng Minh trước nghiệm thu.

## Test môi trường tối thiểu

- [ ] `reset` cùng seed/options → cùng observation và chuỗi weather.
- [ ] Cùng weather, action khác nhau → mưa/nhiệt độ từng ngày không đổi.
- [ ] Action 0 và 5 → đúng 0/25 lít; `water_used_liters` là của bước hiện tại.
- [ ] Không mưa, không tưới → nước giảm đúng ET/tiêu thoát.
- [ ] Có mưa/tưới → phương trình cân bằng khớp, sai số số thực được giải thích.
- [ ] Mốc stage → đúng `next_stage`, reward nhận `next_state` mới.
- [ ] Cờ dừng → tách sinh học và thời hạn; kiểm tra ngày cuối.
- [ ] Input sai → từ chối action ngoài 0..5, bool/float, NaN/Inf, options/weather sai.
- [ ] Bản sao dữ liệu → sửa observation trả về không đổi state nội bộ/weather caller.
- [ ] `check_env` đạt, reset/step đúng kiểu và shape.

Mock chỉ dùng trong unit test. Khi dependency chưa có, ghi test chưa kiểm tra tích
hợp, không đưa placeholder thành công vào production.

## Thứ tự tích hợp

1. Minh đã bàn giao loader/reward/demo trên `feature/reward-demo`.
2. Trưởng review loader/reward, merge `feature/environment` và nối vào `step` (đã xong
   qua PR #1).
3. Hai người chốt giá trị YAML v0.1 bằng PR riêng; cập nhật `DESIGN_CONTRACT.md`.
4. Minh chạy demo thật ba scenario; cả hai chạy toàn suite, `check_env` và kiểm tra
   tái lập.
5. Chỉ sau đó mới coi môi trường v0.1 hoàn thành và chuyển sang baseline/thuật toán.

## Definition of Done cho môi trường v0.1

- Không còn test môi trường/reward bị skip.
- `check_env` pass với loader và reward thật.
- Không còn khóa `null` bắt buộc cho một lần chạy.
- Ba scenario chạy được, cùng seed cho cùng kết quả.
- Demo xuất CSV đúng schema và ghi rõ số ngày thực chạy.
- `DESIGN_CONTRACT.md`, `TASKS.md` và `EXPERIMENT_GUIDE.md` khớp code.

## File chung cần thống nhất trước khi sửa

`README.md`, `requirements.txt`, `pyproject.toml`, `configs/*`, `agriwater/config.py`,
`docs/DESIGN_CONTRACT.md`, `agriwater/agents/base_agent.py`, `tests/test_interfaces.py`.

Hai người thống nhất hệ số cân bằng nước, trạng thái đầu, lịch giai đoạn, ngưỡng
chết cây (khác stress) và phân phối thời tiết. `null` trong YAML là chưa quyết định,
không phải số 0. Minh là đầu mối viết `config.py`, Trưởng review và sử dụng.
Mọi thay đổi hợp đồng phải ghi ảnh hưởng trong PR.

## Giai đoạn sau

Baseline, Q-Learning, DQN, huấn luyện, benchmark và dashboard so sánh vẫn giữ
interface để mở rộng, không thuộc nhiệm vụ tuần này. Báo cáo có năm thành viên;
bảng này chỉ phân công hai người đang phát triển repository.
