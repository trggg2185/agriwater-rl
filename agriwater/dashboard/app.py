"""Interactive, session-local exploration of the irrigation environment."""

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import streamlit as st

from agriwater.config import load_config
from agriwater.environment.agriwater_env import AgriWaterEnv
from agriwater.environment.demo import RECORD_COLUMNS, _record

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _resolve_checkpoint(raw_path: str) -> Path:
    candidate = Path(raw_path)
    return candidate if candidate.is_absolute() else _REPO_ROOT / candidate


@st.cache_resource
def _load_dqn_agent(path_str: str, mtime_ns: int) -> Any:
    from agriwater.agents.dqn import DQNAgent

    _ = mtime_ns
    return DQNAgent.from_checkpoint(path_str)


def main() -> None:
    """Run manual, random or trained DQN actions against the real environment."""
    st.set_page_config(page_title="AgriWater-RL", page_icon="🌱", layout="wide")
    st.title("🌱 AgriWater-RL")
    st.caption("Phòng thử nghiệm tưới tiêu · Một bước = một ngày · Thủ công / Ngẫu nhiên / DQN")
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
        st.divider()
        policy_mode = st.selectbox(
            "Thuật toán điều khiển",
            ["Thủ công / Ngẫu nhiên", "DQN (Deep Q-Network)"],
        )
        dqn_path_text = st.text_input("Checkpoint DQN (.pt)", value="models/dqn_best.pt")
        dqn_path = _resolve_checkpoint(dqn_path_text)
        dqn_ready = dqn_path.is_file()
        if dqn_ready:
            st.success("DQN sẵn sàng (đã tìm thấy checkpoint).")
        else:
            st.warning(f"Chưa tìm thấy checkpoint `{dqn_path_text}`.")
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
    dqn_left, dqn_right = st.columns(2)
    dqn_one = dqn_left.button(
        "DQN chạy một ngày",
        disabled=sim["done"] or not dqn_ready,
        type="primary" if policy_mode == "DQN (Deep Q-Network)" else "secondary",
        use_container_width=True,
    )
    dqn_all = dqn_right.button(
        "Chạy hết bằng DQN",
        disabled=sim["done"] or not dqn_ready,
        type="primary" if policy_mode == "DQN (Deep Q-Network)" else "secondary",
        use_container_width=True,
    )
    if policy_mode == "DQN (Deep Q-Network)" and dqn_ready and not sim["done"]:
        preview_agent = _load_dqn_agent(str(dqn_path.resolve()), dqn_path.stat().st_mtime_ns)
        rec_action = preview_agent.select_action(sim["state"], training=False)
        st.info(f"DQN gợi ý cho ngày kế tiếp: **tưới {rec_action * 5} L** (action {rec_action}).")
    if not dqn_ready:
        st.caption(
            f"Chưa tìm thấy checkpoint `{dqn_path_text}`. "
            "Chạy `.venv/Scripts/python.exe -m agriwater.training.train` để huấn luyện DQN."
        )
    if one or fixed or random or dqn_one or dqn_all:
        try:
            dqn_agent = (
                _load_dqn_agent(str(dqn_path.resolve()), dqn_path.stat().st_mtime_ns)
                if (dqn_one or dqn_all)
                else None
            )
            steps_to_run = 1 if (one or dqn_one) else sim["env"].max_days - len(sim["rows"])
            for _ in range(steps_to_run):
                if dqn_agent is not None:
                    chosen = dqn_agent.select_action(sim["state"], training=False)
                elif random:
                    chosen = int(sim["rng"].integers(0, 6))
                else:
                    chosen = action // 5
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
