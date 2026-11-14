"""Interactive, session-local exploration of the irrigation environment."""

import numpy as np
import pandas as pd
import streamlit as st

from agriwater.config import load_config
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.demo import RECORD_COLUMNS, _record


def main() -> None:
    """Run manual or random actions against the real environment."""
    st.set_page_config(page_title="AgriWater-RL", page_icon="🌱", layout="wide")
    st.title("🌱 AgriWater-RL")
    st.caption("Phòng thử nghiệm tưới tiêu · Một bước = một ngày · Chưa huấn luyện thuật toán")
    config = load_config("environment")
    with st.sidebar:
        st.header("Thiết lập lượt chạy")
        with st.form("setup"):
            scenario = st.selectbox("Kịch bản", ["dry", "stormy", "random"], index=2)
            seed = st.number_input("Seed", min_value=0, max_value=2**32 - 1, value=42, step=1)
            days = st.number_input(
                "Số ngày tối đa", min_value=1, max_value=365, value=config["max_days"], step=1
            )
            crop = st.selectbox("Nhóm cây (mã giả lập)", [0, 1, 2, 3])
            stage = st.selectbox("Giai đoạn ban đầu", [0, 1, 2, 3])
            moisture = st.slider("Độ ẩm ban đầu (%)", 0, 100, 50)
            reset = st.form_submit_button("Khởi tạo / Làm lại", type="primary")
        st.caption("Khởi tạo lại sẽ xóa lịch sử trên màn hình. Tải CSV trước nếu cần giữ.")
        st.info("Thông số vật lý là giả định demo, chưa hiệu chuẩn nông học.")

    if reset:
        env = AgriWaterEnv(scenario, int(days))
        try:
            state, info = env.reset(
                seed=int(seed),
                options={
                    "crop_type": crop,
                    "growth_stage": stage,
                    "soil_moisture": moisture / 100,
                },
            )
        except (ValueError, OSError, NotImplementedError) as exc:
            env.close()
            st.error(f"Không thể khởi tạo: {exc}")
        else:
            previous = st.session_state.get("simulation")
            if previous:
                previous["env"].close()
            st.session_state.simulation = dict(
                env=env,
                state=state,
                info=info,
                rows=[],
                done=False,
                rng=np.random.default_rng(int(seed)),
                scenario=scenario,
                seed=int(seed),
                initial_moisture=moisture / 100,
            )

    sim = st.session_state.get("simulation")
    if sim is None:
        st.info("Chọn thiết lập ở bên trái, rồi bấm Khởi tạo / Làm lại để bắt đầu.")
        return

    st.caption(
        f"Lượt đang chạy: {sim['scenario']} · seed {sim['seed']} · "
        f"tối đa {sim['env'].max_days} ngày"
    )
    action = st.select_slider(
        "Lượng nước tưới cho ngày tiếp theo (lít)", options=[0, 5, 10, 15, 20, 25], value=10
    )
    left, middle, right = st.columns(3)
    one = left.button("Chạy một ngày", disabled=sim["done"], use_container_width=True)
    fixed = middle.button(
        "Chạy hết với mức tưới này", disabled=sim["done"], use_container_width=True
    )
    random = right.button("Chạy hết ngẫu nhiên", disabled=sim["done"], use_container_width=True)
    if one or fixed or random:
        try:
            for _ in range(1 if one else sim["env"].max_days - len(sim["rows"])):
                chosen = int(sim["rng"].integers(0, 6)) if random else action // 5
                state, reward, terminated, truncated, info = sim["env"].step(chosen)
                sim["rows"].append(_record(info, chosen, reward, terminated, truncated))
                sim.update(state=state, info=info, done=terminated or truncated)
                if sim["done"]:
                    break
        except (ValueError, OSError, NotImplementedError) as exc:
            st.error(f"Không thể tiếp tục: {exc}. Hãy kiểm tra cấu hình và khởi tạo lại.")
        else:
            st.rerun()

    state, info, rows = sim["state"], sim["info"], sim["rows"]
    a, b, c, d = st.columns(4)
    a.metric("Ngày đã chạy", f"{info['day']} / {sim['env'].max_days}")
    b.metric("Độ ẩm hiện tại", f"{state[2] * 100:.1f}%")
    c.metric("Tổng nước tưới", f"{sum(r['water_used_liters'] for r in rows):.0f} L")
    d.metric("Tổng reward", f"{sum(r['reward'] for r in rows):.1f}")
    if sim["done"]:
        last = rows[-1]
        reasons = []
        if last["terminated"]:
            reasons.append(
                "kết thúc sinh học: cạn nước" if state[2] <= 0.5 else "kết thúc sinh học: ngập úng"
            )
        if last["truncated"]:
            reasons.append("đạt giới hạn ngày")
        st.warning("Lượt chạy đã dừng — " + "; ".join(reasons) + ". Khởi tạo lại để thử tiếp.")
    elif info["is_stressed"]:
        st.warning("Độ ẩm đang ngoài vùng an toàn (stress).")
    elif info["is_ideal"]:
        st.success("Độ ẩm đang trong vùng lý tưởng của giai đoạn hiện tại.")
    else:
        st.info("Độ ẩm chưa lý tưởng nhưng chưa vượt ngưỡng stress.")

    with st.expander("Trạng thái và dự báo trước hành động tiếp theo", expanded=True):
        st.write(
            f"Nhóm cây {round(float(state[0]) * 3)} · "
            f"Giai đoạn {round(float(state[1]) * 3)} · "
            f"Nhiệt độ {state[3] * 30 + 15:.1f} °C · "
            f"Xác suất mưa {state[4] * 100:.0f}% · "
            f"Mưa dự báo {state[5] * 50:.1f} mm · "
            f"Tưới bước trước {state[6] * 25:.0f} L"
        )
        st.caption("Nếu lượt đã kết thúc, đây là observation cuối. Mưa thực chỉ hiện sau bước.")
    curve = pd.DataFrame(
        {
            "Ngày": [0] + [r["day"] for r in rows],
            "Độ ẩm (%)": [sim["initial_moisture"] * 100] + [r["soil_moisture"] * 100 for r in rows],
        }
    ).set_index("Ngày")
    st.subheader("Diễn biến độ ẩm")
    st.line_chart(curve)
    if rows:
        frame = pd.DataFrame(rows, columns=RECORD_COLUMNS)
        charts, details = st.tabs(["Nước và reward", "Bảng dữ liệu"])
        with charts:
            st.caption("Nước tưới (L) và mưa thực (mm) có đơn vị khác nhau, hiển thị riêng.")
            x, y = st.columns(2)
            x.bar_chart(frame.set_index("day")[["water_used_liters"]])
            y.bar_chart(frame.set_index("day")[["actual_rain_mm"]])
            st.line_chart(frame.set_index("day")[["reward"]])
        with details:
            st.dataframe(frame, use_container_width=True, hide_index=True)
        st.subheader("Giải thích bước vừa chạy")
        st.dataframe(
            pd.DataFrame(info["reward_components"].items(), columns=["Thành phần", "Điểm"]),
            hide_index=True,
        )
        with st.expander("Cân bằng nước bước vừa chạy (lít)"):
            st.json(info["water_balance"])
        st.download_button(
            "Tải lịch sử CSV",
            frame.to_csv(index=False).encode("utf-8-sig"),
            file_name=f"agriwater-{sim['scenario']}-seed{sim['seed']}.csv",
            mime="text/csv",
        )


if __name__ == "__main__":
    main()
