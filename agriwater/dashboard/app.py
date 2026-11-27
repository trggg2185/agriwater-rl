"""Streamlit dashboard: visual, non-learning AgriWater-RL demo.

Run from the repository root:

    python -m streamlit run agriwater/dashboard/app.py

The committed ``configs/*.yaml`` values are still ``null``, so this dashboard
uses an in-memory v0.1 overlay (see ``demo_config.py``). It never writes YAML
and never trains an agent.
"""

from typing import Any

import altair as alt
import pandas as pd
import streamlit as st

from agriwater.dashboard.demo_config import (
    DEMO_NOTE,
    build_demo_config,
    demo_scenario_ranges,
)
from agriwater.dashboard.plots import (
    REWARD_KEYS,
    component_totals,
    compute_metrics,
    cumulative_reward,
    daily_ideal_bounds,
    records_to_frame,
)
from agriwater.environment.demo import RECORD_COLUMNS, run_episode
from agriwater.environment.weather import generate_weather

SCENARIOS = {
    "dry": "Khô hạn",
    "stormy": "Mưa nhiều",
    "random": "Ngẫu nhiên",
}
ACTION_LITERS = [0, 5, 10, 15, 20, 25]


def _policy_label(action: int | None) -> str:
    if action is None:
        return "ngẫu nhiên"
    return f"cố định {action} ({ACTION_LITERS[action]} L)"


@st.cache_data(show_spinner=False)
def _simulate(scenario: str, seed: int, action: int | None) -> tuple[list[dict[str, Any]], dict]:
    """Run one episode with the demo overlay and return records plus config."""
    config = build_demo_config()
    max_days = config.get("max_days")
    if isinstance(max_days, bool) or not isinstance(max_days, int) or max_days < 1:
        raise ValueError("environment.max_days must be a positive integer")
    # A separate seed keeps weather generation independent from action sampling.
    weather_seed = (seed + 1) % (2**32)
    weather = generate_weather(
        scenario,
        max_days + 1,
        seed=weather_seed,
        ranges=demo_scenario_ranges(scenario),
    )
    records = run_episode(
        scenario,
        seed,
        action,
        config=config,
        weather=weather,
    )
    return records, config


def _moisture_chart(frame: pd.DataFrame, config: dict) -> alt.LayerChart:
    low, high = daily_ideal_bounds(frame, config)
    band_frame = frame[["day"]].copy()
    band_frame["ideal_low"] = low
    band_frame["ideal_high"] = high
    x = alt.X("day:Q", title="Ngày")
    band = (
        alt.Chart(band_frame)
        .mark_area(color="#2e7d32", opacity=0.15)
        .encode(x=x, y=alt.Y("ideal_low:Q", title="Độ ẩm đất"), y2="ideal_high:Q")
    )
    line = (
        alt.Chart(frame)
        .mark_line(point=True, color="#1565c0", strokeWidth=2.5)
        .encode(x=x, y=alt.Y("soil_moisture:Q", scale=alt.Scale(domain=[0, 1])))
    )
    return alt.layer(band, line).properties(height=300, title="Độ ẩm đất theo ngày")


def _water_chart(frame: pd.DataFrame) -> alt.LayerChart:
    x = alt.X("day:Q", title="Ngày")
    base = alt.Chart(frame).encode(x=x)
    irrigation = base.mark_bar(color="#42a5f5", opacity=0.85).encode(
        y=alt.Y("water_used_liters:Q", title="Nước tưới (L)")
    )
    rain = base.mark_line(point=True, color="#7b1fa2", strokeWidth=2.5).encode(
        y=alt.Y("actual_rain_mm:Q", title="Mưa thực (mm)")
    )
    return (
        alt.layer(irrigation, rain)
        .resolve_scale(y="independent")
        .properties(height=300, title="Nước tưới và mưa thực")
    )


def _reward_chart(frame: pd.DataFrame) -> alt.Chart:
    cumulative = cumulative_reward(frame).reset_index()
    return (
        alt.Chart(cumulative)
        .mark_area(line=True, color="#ef6c00", opacity=0.35)
        .encode(
            x=alt.X("day:Q", title="Ngày"),
            y=alt.Y("reward:Q", title="Reward tích lũy"),
        )
        .properties(height=300, title="Reward tích lũy")
    )


def _component_chart(frame: pd.DataFrame) -> alt.Chart:
    totals = component_totals(frame)
    components = pd.DataFrame(
        {
            "component": list(totals),
            "value": list(totals.values()),
        }
    )
    return (
        alt.Chart(components)
        .mark_bar()
        .encode(
            x=alt.X("component:N", title=None, sort=None),
            y=alt.Y("value:Q", title="Tổng reward"),
            color=alt.condition(
                alt.datum.value >= 0,
                alt.value("#2e7d32"),
                alt.value("#c62828"),
            ),
        )
        .properties(height=260, title="Phân rã sáu thành phần reward")
    )


def _results(
    records: list[dict[str, Any]], config: dict, scenario: str, seed: int, action: int | None
) -> None:
    frame = records_to_frame(records)
    metrics = compute_metrics(frame)

    st.caption(
        f"Kịch bản **{SCENARIOS[scenario]}** · seed **{seed}** · "
        f"kết thúc: **{metrics['termination_reason']}**"
    )
    columns = st.columns(5)
    columns[0].metric("Số ngày chạy", metrics["days"])
    columns[1].metric("Tổng nước tưới", f"{metrics['total_water_liters']:.1f} L")
    columns[2].metric("Tổng reward", f"{metrics['total_reward']:.1f}")
    columns[3].metric(
        "Ngày lý tưởng",
        f"{metrics['ideal_days']}/{metrics['days']}",
        f"{metrics['ideal_ratio']:.0%}",
    )
    columns[4].metric("Ngày stress", metrics["stress_days"])
    st.caption(
        f"Lãng phí tưới: **{metrics['overwater_days']}** ngày · "
        f"tưới khi có mưa: **{metrics['rain_waste_days']}** ngày · "
        f"tưới lặp: **{metrics['delay_days']}** ngày"
    )

    left, right = st.columns(2)
    with left:
        st.altair_chart(_moisture_chart(frame, config), width="stretch")
    with right:
        st.altair_chart(_water_chart(frame), width="stretch")

    left, right = st.columns(2)
    with left:
        st.altair_chart(_reward_chart(frame), width="stretch")
    with right:
        st.altair_chart(_component_chart(frame), width="stretch")

    st.subheader("Bảng theo ngày")
    st.dataframe(frame, width="stretch", hide_index=True)

    st.download_button(
        "Tải CSV",
        data=frame.to_csv(index=False).encode("utf-8-sig"),
        file_name=f"agriwater_{scenario}_seed{seed}.csv",
        mime="text/csv",
    )

    with st.expander("Cấu hình đã dùng (overlay trong bộ nhớ)"):
        st.write(f"Policy: **{_policy_label(action)}**")
        st.json(
            {
                "water_balance": config.get("water_balance"),
                "growth_stage_days": config.get("growth_stage_days"),
                "biological_termination": config.get("biological_termination"),
                "initial_state": config.get("initial_state"),
                "weather_ranges": demo_scenario_ranges(scenario),
                "reward_components": REWARD_KEYS,
                "csv_columns": RECORD_COLUMNS,
            }
        )


def main() -> None:
    st.set_page_config(
        page_title="AgriWater Lab",
        page_icon="🌱",
        layout="wide",
    )
    st.title("🌱 AgriWater Lab — mô phỏng tưới tiêu")
    st.caption(
        "Demo không học: chỉ chạy môi trường với hành động ngẫu nhiên hoặc cố định. "
        "Không huấn luyện, không tối ưu chính sách."
    )
    st.warning(DEMO_NOTE)

    if "run_params" not in st.session_state:
        st.session_state.run_params = {"scenario": "dry", "seed": 42, "action": 2}

    with st.sidebar:
        st.header("Điều khiển")
        with st.form("controls"):
            scenario = st.selectbox(
                "Kịch bản thời tiết",
                list(SCENARIOS),
                index=list(SCENARIOS).index(st.session_state.run_params["scenario"]),
                format_func=lambda value: f"{value} — {SCENARIOS[value]}",
            )
            seed = st.number_input(
                "Seed",
                min_value=0,
                max_value=2**31 - 1,
                value=int(st.session_state.run_params["seed"]),
                step=1,
            )
            policy = st.radio(
                "Chính sách",
                ["Ngẫu nhiên", "Hành động cố định"],
                index=0 if st.session_state.run_params["action"] is None else 1,
            )
            action_index = 0
            if st.session_state.run_params["action"] is not None:
                action_index = int(st.session_state.run_params["action"])
            action_choice = st.select_slider(
                "Mức tưới cố định",
                options=list(range(6)),
                value=action_index,
                format_func=lambda value: f"{value} · {ACTION_LITERS[value]} L",
                disabled=policy == "Ngẫu nhiên",
            )
            submitted = st.form_submit_button("Chạy mô phỏng", type="primary")

        if submitted:
            st.session_state.run_params = {
                "scenario": scenario,
                "seed": int(seed),
                "action": None if policy == "Ngẫu nhiên" else int(action_choice),
            }

        st.divider()
        st.markdown(
            "**Phạm vi**\n"
            "- 7 quan sát, 6 hành động, 1 bước = 1 ngày\n"
            "- Vật lý và thời tiết dùng đề xuất v0.1\n"
            "- Không ghi đè `configs/*.yaml`\n\n"
            "Chạy CLI tương đương:\n"
            "```bash\n"
            "python -m agriwater.environment.demo \\\n"
            "  --scenario dry --seed 42\n"
            "```"
        )

    params = st.session_state.run_params
    try:
        records, config = _simulate(params["scenario"], params["seed"], params["action"])
    except Exception as exc:  # noqa: BLE001 - show configuration errors in the UI
        st.error(f"Không chạy được mô phỏng: {exc}")
        st.info(
            "Kiểm tra cấu hình YAML và overlay demo. Không điền 0 thay cho `null` "
            "trong `configs/*.yaml`."
        )
        return

    if not records:
        st.info("Không có bản ghi nào được sinh ra.")
        return

    st.success(
        f"Đã chạy {len(records)} ngày · policy "
        f"**{_policy_label(params['action'])}** · seed **{params['seed']}**"
    )
    _results(records, config, params["scenario"], params["seed"], params["action"])


if __name__ == "__main__":
    main()
