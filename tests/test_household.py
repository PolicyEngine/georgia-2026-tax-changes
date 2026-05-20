"""
Tests for the sc_tax_calc.household module.

These tests verify that the household-situation builder produces correct
PolicyEngine-compatible dictionaries, defaulting to South Carolina (SC)
for this dashboard.
"""

import pytest
from sc_tax_calc.household import build_household_situation


class TestBuildHouseholdSituation:
    """Tests for build_household_situation()."""

    def test_default_state_is_south_carolina(self):
        """state_code defaults to SC when not specified."""
        situation = build_household_situation(
            age_head=30,
            age_spouse=None,
            dependent_ages=[],
            income=40000,
            year=2026,
            max_earnings=500000,
            include_axes=False,
        )
        assert situation["households"]["your household"]["state_code"]["2026"] == "SC"

    def test_single_parent_with_one_child(self):
        situation = build_household_situation(
            age_head=30,
            age_spouse=None,
            dependent_ages=[2],
            income=20000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=False,
        )

        assert "you" in situation["people"]
        assert situation["people"]["you"]["age"]["2026"] == 30
        assert "your first dependent" in situation["people"]
        assert situation["people"]["your first dependent"]["age"]["2026"] == 2
        assert "your partner" not in situation["people"]
        assert situation["households"]["your household"]["state_code"]["2026"] == "SC"

    def test_married_couple_with_two_children(self):
        situation = build_household_situation(
            age_head=32,
            age_spouse=30,
            dependent_ages=[1, 3],
            income=30000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=False,
        )

        assert "you" in situation["people"]
        assert "your partner" in situation["people"]
        assert situation["people"]["your partner"]["age"]["2026"] == 30
        assert "your first dependent" in situation["people"]
        assert "your second dependent" in situation["people"]

        members = situation["tax_units"]["your tax unit"]["members"]
        assert "you" in members
        assert "your partner" in members
        assert "your first dependent" in members
        assert "your second dependent" in members

    def test_three_plus_children(self):
        situation = build_household_situation(
            age_head=35,
            age_spouse=33,
            dependent_ages=[0, 1, 2, 3],
            income=35000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=False,
        )

        assert "your first dependent" in situation["people"]
        assert "your second dependent" in situation["people"]
        assert "dependent_3" in situation["people"]
        assert "dependent_4" in situation["people"]

    def test_no_children(self):
        situation = build_household_situation(
            age_head=45,
            age_spouse=None,
            dependent_ages=[],
            income=30000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=False,
        )

        assert len(situation["people"]) == 1
        assert "you" in situation["people"]

    def test_axes_included(self):
        situation = build_household_situation(
            age_head=30,
            age_spouse=None,
            dependent_ages=[2],
            income=20000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=True,
        )

        assert "axes" in situation
        assert len(situation["axes"]) == 1
        assert len(situation["axes"][0]) == 1

        axis = situation["axes"][0][0]
        assert axis["name"] == "employment_income"
        assert axis["min"] == 0
        assert axis["max"] == 500000
        assert axis["period"] == "2026"

    def test_axes_excluded(self):
        situation = build_household_situation(
            age_head=30,
            age_spouse=None,
            dependent_ages=[2],
            income=20000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=False,
        )
        assert "axes" not in situation

    def test_axis_max_uses_higher_of_income_or_max_earnings(self):
        """Axis maximum is the larger of income and max_earnings."""
        situation_high_income = build_household_situation(
            age_head=30,
            age_spouse=None,
            dependent_ages=[],
            income=1000000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=True,
        )
        assert situation_high_income["axes"][0][0]["max"] == 1000000

        situation_high_max = build_household_situation(
            age_head=30,
            age_spouse=None,
            dependent_ages=[],
            income=100000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=True,
        )
        assert situation_high_max["axes"][0][0]["max"] == 500000

    def test_marital_units_created_correctly(self):
        """Each child gets their own marital unit."""
        situation = build_household_situation(
            age_head=35,
            age_spouse=None,
            dependent_ages=[5, 10],
            income=50000,
            year=2026,
            max_earnings=500000,
            state_code="SC",
            include_axes=False,
        )

        assert "your marital unit" in situation["marital_units"]
        assert "you" in situation["marital_units"]["your marital unit"]["members"]
        assert "your first dependent's marital unit" in situation["marital_units"]
        assert "your second dependent's marital unit" in situation["marital_units"]
