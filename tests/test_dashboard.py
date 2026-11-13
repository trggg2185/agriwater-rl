"""Streamlit interactions exercise the real environment, not a fake dashboard."""

from pathlib import Path

from streamlit.testing.v1 import AppTest

APP = Path(__file__).parents[1] / "agriwater/dashboard/app.py"


def click(app, label):
    return next(button for button in app.button if button.label == label).click().run()


def test_dashboard_manual_run_finish_and_reset():
    app = AppTest.from_file(str(APP)).run(timeout=20)
    assert not app.exception
    click(app, "Khởi tạo / Làm lại")
    assert not app.exception
    click(app, "Chạy một ngày")
    assert not app.exception
    sim = app.session_state["simulation"]
    assert len(sim["rows"]) == 1
    assert sim["rows"][0]["water_used_liters"] == 10
    click(app, "Chạy hết ngẫu nhiên")
    assert not app.exception
    sim = app.session_state["simulation"]
    assert sim["done"]
    assert sim["rows"][-1]["terminated"] or sim["rows"][-1]["truncated"]
    assert next(b for b in app.button if b.label == "Chạy một ngày").disabled
    click(app, "Khởi tạo / Làm lại")
    assert not app.exception
    assert app.session_state["simulation"]["rows"] == []
    assert not app.session_state["simulation"]["done"]


def test_dashboard_fixed_action_and_independent_sessions():
    first = AppTest.from_file(str(APP)).run(timeout=20)
    click(first, "Khởi tạo / Làm lại")
    first.select_slider[0].set_value(0).run()
    click(first, "Chạy hết với mức tưới này")
    assert not first.exception
    records = first.session_state["simulation"]["rows"]
    assert records and all(r["water_used_liters"] == 0 for r in records)
    second = AppTest.from_file(str(APP)).run(timeout=20)
    click(second, "Khởi tạo / Làm lại")
    assert second.session_state["simulation"]["rows"] == []
