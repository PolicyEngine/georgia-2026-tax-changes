"""Reform definitions for the Georgia 2026 tax changes dashboard.

PolicyEngine-US current law (post-PR #8306) already includes HB463. To
isolate the package, this module applies an inverse reform that
restores the pre-HB463 parameters via
:func:`create_ga_reverted_reform`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


# Path to the canonical inverse-reform JSON at the repository root.
REFORM_PATH = Path(__file__).resolve().parent.parent / "reform_revert.json"


def load_reform() -> Dict[str, Any]:
    """Load the GA inverse reform dictionary from ``reform_revert.json``.

    Returns:
        Dict of parameter overrides that revert HB463 to pre-HB463 values.
    """
    with open(REFORM_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.pop("_comment", None)
    return data


def create_ga_reverted_reform():
    """Build a PolicyEngine Reform that restores pre-HB463 GA parameters."""
    import re

    from policyengine_core.periods import instant
    from policyengine_core.reforms import Reform

    overrides = load_reform()

    def modify(parameters):
        for path, periods in overrides.items():
            node = parameters
            for segment in path.split("."):
                match = re.match(r"(\w+)\[(\d+)\]", segment)
                if match:
                    node = getattr(node, match.group(1))[int(match.group(2))]
                else:
                    node = getattr(node, segment)
            for period_str, value in periods.items():
                if "." in period_str and len(period_str) > 10:
                    start_str, stop_str = period_str.split(".")
                else:
                    start_str = (
                        period_str if "-" in period_str else f"{period_str}-01-01"
                    )
                    stop_str = "2100-12-31"
                node.update(
                    start=instant(start_str),
                    stop=instant(stop_str),
                    value=value,
                )
        return parameters

    class GARevertedReform(Reform):
        def apply(self):
            self.modify_parameters(modify)

    return GARevertedReform


# Backwards-compatible alias for callers that imported the SC name.
create_sc_reverted_reform = create_ga_reverted_reform


# Keys here MUST match the waterfall PROVISION_ORDER in
# frontend/components/AggregateImpact.tsx.
def get_reform_provisions() -> Dict[str, Dict[str, Any]]:
    """Provision-level descriptions of HB463 for the waterfall chart.

    Each entry maps a provision key to its parameter path, pre-HB463
    baseline value, and the current-law (HB463) value. The waterfall
    pipeline builds one isolated-revert reform per provision so each
    provision's individual contribution can be measured.
    """
    return {
        "flat_rate": {
            "label": "Flat rate cut (5.19% → 4.99%)",
            "parameter": "gov.states.ga.tax.income.main.flat_rate",
            "pre_hb463_value": 0.0519,
            "current_law_value": 0.0499,
            "first_year": 2026,
        },
        "standard_deduction": {
            "label": "Standard deduction increase",
            "parameter": "gov.states.ga.tax.income.deductions.standard.amount",
            "pre_hb463_value": {
                "SINGLE": 12000,
                "HEAD_OF_HOUSEHOLD": 12000,
                "SEPARATE": 12000,
                "JOINT": 24000,
                "SURVIVING_SPOUSE": 24000,
            },
            "current_law_value": {
                "SINGLE": 15000,
                "HEAD_OF_HOUSEHOLD": 15000,
                "SEPARATE": 15000,
                "JOINT": 30000,
                "SURVIVING_SPOUSE": 30000,
            },
            "first_year": 2026,
        },
        "dependent_exemption": {
            "label": "Dependent exemption ($4k → $5k)",
            "parameter": "gov.states.ga.tax.income.exemptions.dependent",
            "pre_hb463_value": 4000,
            "current_law_value": 5000,
            "first_year": 2026,
        },
        "retirement_exclusion": {
            "label": "Age-65+ retirement exclusion ($65k → $70k)",
            "parameter": "gov.states.ga.tax.income.agi.exclusions.retirement.cap.older",
            "pre_hb463_value": 65000,
            "current_law_value": 70000,
            "first_year": 2027,
        },
        "overtime_exclusion": {
            "label": "Qualified overtime exclusion (new, $1,750 cap)",
            "parameter": "gov.states.ga.tax.income.agi.exclusions.overtime.cap",
            "pre_hb463_value": 0,
            "current_law_value": 1750,
            "first_year": 2026,
            "last_year": 2028,
        },
        "tip_exclusion": {
            "label": "Cash tip exclusion (new, $1,750 cap)",
            "parameter": "gov.states.ga.tax.income.agi.exclusions.tips.cap",
            "pre_hb463_value": 0,
            "current_law_value": 1750,
            "first_year": 2026,
            "last_year": 2028,
        },
    }
