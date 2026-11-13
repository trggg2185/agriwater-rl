"""Weather must be generated ahead of evaluation, independently of actions."""

from typing import TypedDict

import numpy as np

from agriwater.config import load_config


class WeatherDay(TypedDict):
    """Physical units: degrees Celsius, probability, and millimeters."""

    temperature: float
    rain_probability: float
    rain_forecast_mm: float
    actual_rain_mm: float


def generate_weather(scenario: str, days: int, *, seed: int) -> list[WeatherDay]:
    """Generate a reusable seeded daily sequence from configs/scenarios.yaml."""
    scenarios = load_config("scenarios")
    if scenario not in scenarios:
        raise ValueError("Unknown weather scenario")
    if isinstance(days, bool) or not isinstance(days, int) or days < 1:
        raise ValueError("days must be a positive integer")
    config = scenarios[scenario]
    fields = ("temperature_range_c", "rain_probability_range", "rain_amount_range_mm")
    bounds = []
    for field, domain in zip(fields, ((15, 45), (0, 1), (0, 50)), strict=True):
        value = config.get(field)
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError(f"Configure scenarios.{scenario}.{field} with two bounds")
        if any(type(x) not in (int, float) or not np.isfinite(x) for x in value):
            raise ValueError(f"Invalid bounds: {field}")
        if not domain[0] <= value[0] <= value[1] <= domain[1]:
            raise ValueError(f"Out-of-domain bounds: {field}")
        bounds.append(value)
    rng = np.random.default_rng(seed)
    result = []
    for _ in range(days):
        temperature, probability, forecast = [float(rng.uniform(*b)) for b in bounds]
        result.append(
            WeatherDay(
                temperature=temperature,
                rain_probability=probability,
                rain_forecast_mm=forecast,
                actual_rain_mm=forecast if rng.random() < probability else 0.0,
            )
        )
    return result
