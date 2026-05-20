"""South Carolina 2026 tax changes calculation module.

This module provides utilities for calculating household and aggregate
impacts of South Carolina H.4216 (Act 110), signed March 30, 2026 and
effective for tax years beginning after 2025, using an inverse reform
framework.
"""

from .household import build_household_situation, calculate_household_impact
from .reforms import create_ga_reverted_reform, load_reform, REFORM_PATH
from .microsimulation import calculate_aggregate_impact

__all__ = [
    "build_household_situation",
    "calculate_household_impact",
    "create_ga_reverted_reform",
    "load_reform",
    "REFORM_PATH",
    "calculate_aggregate_impact",
]

__version__ = "1.0.0"
