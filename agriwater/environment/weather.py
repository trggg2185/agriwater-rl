"""Weather must be generated ahead of evaluation, independently of actions."""

from typing import TypedDict


class WeatherDay(TypedDict):
    """Physical units: degrees Celsius, probability, and millimeters."""

    temperature: float
    rain_probability: float
    rain_forecast_mm: float
    actual_rain_mm: float


def generate_weather(scenario: str, days: int, *, seed: int) -> list[WeatherDay]:
    """Generate a reusable seeded daily sequence from configs/scenarios.yaml."""
    raise NotImplementedError("Weather distributions must be agreed before implementation")
