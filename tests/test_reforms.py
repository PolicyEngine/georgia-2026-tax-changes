"""
Tests for the sc_tax_calc.reforms module.

These tests verify that the inverse reform (reverting South Carolina
2026 parameters to their pre-2026/2025 values) is loaded correctly from
reform.json.
"""

import json
from pathlib import Path

import pytest
from sc_tax_calc.reforms import (
    REFORM_PATH,
    load_reform,
    get_reform_provisions,
)


class TestReformPath:
    """Tests for the reform.json path constant."""

    def test_reform_path_points_to_repo_root_file(self):
        """REFORM_PATH should resolve to reform.json at repo root."""
        assert isinstance(REFORM_PATH, Path)
        assert REFORM_PATH.name == "reform.json"
        assert REFORM_PATH.exists(), f"Expected reform.json at {REFORM_PATH}"

    def test_reform_json_is_valid_json(self):
        """reform.json must parse as JSON."""
        with open(REFORM_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, dict)


class TestLoadReform:
    """Tests for load_reform()."""

    def test_load_returns_dict(self):
        reform = load_reform()
        assert isinstance(reform, dict)

    def test_includes_bracket_revert_keys(self):
        """The reform must revert pre-2026 bracket rate schedule keys."""
        reform = load_reform()
        expected_keys = [
            "gov.states.sc.tax.income.rates.brackets[0].rate",
            "gov.states.sc.tax.income.rates.brackets[1].threshold",
            "gov.states.sc.tax.income.rates.brackets[1].rate",
            "gov.states.sc.tax.income.rates.brackets[2].threshold",
        ]
        for key in expected_keys:
            assert key in reform, f"Missing bracket revert key: {key}"

    def test_bracket_threshold_values(self):
        """Pre-2026 thresholds are $3,560 (bracket 1) and $17,830 (bracket 2)."""
        reform = load_reform()
        periods_b1 = reform["gov.states.sc.tax.income.rates.brackets[1].threshold"]
        assert any(v == 3560 for v in periods_b1.values())
        periods_b2 = reform["gov.states.sc.tax.income.rates.brackets[2].threshold"]
        assert any(v == 17830 for v in periods_b2.values())

    def test_sciad_reverted_off(self):
        """The reform turns the SCIAD deduction off (pre-2026 behavior)."""
        reform = load_reform()
        key = "gov.states.sc.tax.income.deductions.sciad.in_effect"
        assert key in reform
        periods = reform[key]
        assert any(v is False for v in periods.values())

    def test_eitc_cap_effectively_uncapped(self):
        """The reform reverts the EITC cap to an effectively uncapped value."""
        reform = load_reform()
        key = "gov.states.sc.tax.income.credits.eitc.max"
        assert key in reform
        periods = reform[key]
        # Any very large value indicates "uncapped" in practice.
        assert any(v >= 1_000_000 for v in periods.values())

    def test_reform_structure_for_policyengine(self):
        """Structure must be compatible with Reform.from_dict()."""
        reform = load_reform()
        assert isinstance(reform, dict)
        for param_path, periods in reform.items():
            assert isinstance(param_path, str)
            assert param_path.startswith("gov.states.sc."), (
                f"Non-SC parameter in reform: {param_path}"
            )
            assert isinstance(periods, dict)
            for period_str in periods:
                # Expect PolicyEngine "YYYY-MM-DD.YYYY-MM-DD" period strings
                assert "." in period_str
                start, end = period_str.split(".")
                assert len(start) == 10
                assert len(end) == 10


class TestGetReformProvisions:
    """Tests for get_reform_provisions()."""

    def test_returns_all_provisions(self):
        provisions = get_reform_provisions()

        expected_keys = [
            "h4216_bracket0_rate",
            "h4216_bracket1_rate",
            "h4216_bracket2_rate",
            "h4216_sciad_in_effect",
            "h4216_eitc_cap",
        ]
        for key in expected_keys:
            assert key in provisions
            assert "description" in provisions[key]
            assert "parameter" in provisions[key]

    def test_h4216_bracket_rates(self):
        """H.4216 changes the top-rate to 5.21% (pre-2026: 6%)."""
        provisions = get_reform_provisions()
        bracket2 = provisions["h4216_bracket2_rate"]
        assert bracket2["pre_2026_value"] == 0.06
        assert bracket2["current_law_value"] == 0.0521

    def test_h4216_eitc_cap_values(self):
        """H.4216 caps the SC EITC at $200 (pre-2026: no cap)."""
        provisions = get_reform_provisions()
        eitc = provisions["h4216_eitc_cap"]
        assert eitc["pre_2026_value"] >= 1_000_000
        assert eitc["current_law_value"] == 200
