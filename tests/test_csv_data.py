"""
Tests for the precomputed CSV data files.

These tests verify that the CSV files have the correct structure and
can be parsed by the frontend. Only tax year 2026 is meaningful for the
South Carolina 2026 tax changes dashboard.
"""

import csv
from pathlib import Path

import pytest


DATA_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"
EXPECTED_YEARS = [2026]
EXPECTED_BRACKETS = {
    "$0 - $25k",
    "$25k - $50k",
    "$50k - $75k",
    "$75k - $100k",
    "$100k - $150k",
    "$150k - $200k",
    "$200k+",
}


class TestDistributionalImpactCSV:
    """Tests for distributional_impact_revert.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / "distributional_impact_revert.csv"
        if not filepath.exists():
            pytest.skip("distributional_impact_revert.csv not generated yet")
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = ["year", "decile", "average_change", "relative_change"]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_all_deciles(self, data):
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            deciles = {r["decile"] for r in year_data}
            expected = {str(d) for d in range(1, 11)}
            assert deciles == expected, f"Missing deciles for year {year}"

    def test_values_are_numeric(self, data):
        for row in data:
            float(row["year"])
            float(row["average_change"])
            float(row["relative_change"])


class TestMetricsCSV:
    """Tests for metrics_revert.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / "metrics_revert.csv"
        if not filepath.exists():
            pytest.skip("metrics_revert.csv not generated yet")
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = ["year", "metric", "value"]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_required_metrics(self, data):
        required_metrics = [
            "budgetary_impact",
            "state_tax_revenue_impact",
            "federal_tax_revenue_impact",
            "winners",
            "losers",
            "poverty_baseline_rate",
            "poverty_reform_rate",
        ]
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            metrics = {r["metric"] for r in year_data}
            for metric in required_metrics:
                assert metric in metrics, (
                    f"Missing metric '{metric}' for year {year}"
                )


class TestWinnersLosersCSV:
    """Tests for winners_losers_revert.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / "winners_losers_revert.csv"
        if not filepath.exists():
            pytest.skip("winners_losers_revert.csv not generated yet")
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = [
            "year", "decile",
            "gain_more_5pct", "gain_less_5pct", "no_change",
            "lose_less_5pct", "lose_more_5pct",
        ]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_all_deciles_and_all(self, data):
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            deciles = {r["decile"] for r in year_data}
            expected = {"All"} | {str(d) for d in range(1, 11)}
            assert deciles == expected, f"Missing deciles for year {year}"

    def test_values_sum_to_one(self, data):
        for row in data:
            total = (
                float(row["gain_more_5pct"])
                + float(row["gain_less_5pct"])
                + float(row["no_change"])
                + float(row["lose_less_5pct"])
                + float(row["lose_more_5pct"])
            )
            assert abs(total - 1.0) < 0.01, f"Row does not sum to 1: {row}"


class TestIncomeBracketsCSV:
    """Tests for income_brackets_revert.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / "income_brackets_revert.csv"
        if not filepath.exists():
            pytest.skip("income_brackets_revert.csv not generated yet")
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = ["year", "bracket", "beneficiaries", "total_cost", "avg_benefit"]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_all_brackets(self, data):
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            brackets = {r["bracket"] for r in year_data}
            assert brackets == EXPECTED_BRACKETS, (
                f"Missing brackets for year {year}"
            )


class TestCongressionalDistrictsCSV:
    """Tests for congressional_districts_revert.csv (South Carolina only)."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / "congressional_districts_revert.csv"
        if not filepath.exists():
            pytest.skip("congressional_districts_revert.csv not generated yet")
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = [
            "district",
            "average_household_income_change",
            "relative_household_income_change",
            "state",
            "year",
        ]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_south_carolina_only(self, data):
        """All rows must be South Carolina districts."""
        states = {r["state"] for r in data}
        assert states == {"SC"}, f"Expected only SC rows, got {states}"

    def test_seven_districts(self, data):
        """South Carolina has 7 congressional districts."""
        districts = {r["district"] for r in data}
        expected = {f"SC-0{d}" for d in range(1, 8)}
        assert districts == expected, (
            f"Expected South Carolina districts SC-01..SC-07, got {districts}"
        )
