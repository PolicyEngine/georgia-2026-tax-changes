"""Schema validation for the precomputed example_households.json payload.

The dashboard's "Example households" cards and the chart's per-provision
lines read this file directly via the frontend; a typo in
``scripts/compute_example_households.py`` (e.g., dropping a key,
renaming a field, dropping the ``interaction_residual`` sub-object)
would silently produce broken UI without these tests catching it.

These tests are pure schema checks against the committed JSON — they
do not re-run any PolicyEngine sims.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

PAYLOAD_PATH = (
    Path(__file__).resolve().parent.parent
    / "frontend"
    / "public"
    / "data"
    / "example_households.json"
)


@pytest.fixture(scope="module")
def payload() -> dict:
    with PAYLOAD_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def test_top_level_shape(payload: dict) -> None:
    assert payload["year"] == 2026
    assert isinstance(payload["households"], list)
    assert len(payload["households"]) >= 1


@pytest.fixture(scope="module")
def households(payload: dict) -> list[dict]:
    return payload["households"]


def test_profile_fields_present(households: list[dict]) -> None:
    required = {"label", "income", "age_head", "married", "dependents"}
    for h in households:
        assert required <= h.keys(), (
            f"household {h.get('label')} missing fields: {required - h.keys()}"
        )


def test_baseline_and_reform_fields(households: list[dict]) -> None:
    required = {"household_net_income", "sc_income_tax", "income_tax"}
    for h in households:
        for key in ("baseline", "reform"):
            assert required <= h[key].keys(), (
                f"household {h['label']}/{key} missing fields: "
                f"{required - h[key].keys()}"
            )


def test_top_level_changes_present(households: list[dict]) -> None:
    for h in households:
        for key in ("net_income_change", "sc_tax_change", "federal_tax_change"):
            assert key in h, f"household {h['label']} missing '{key}'"
            assert isinstance(h[key], (int, float))


def test_chart_arrays_aligned(households: list[dict]) -> None:
    """All chart arrays must have the same length as income_range."""
    for h in households:
        chart = h["chart"]
        n = len(chart["income_range"])
        assert n > 1, f"household {h['label']} chart.income_range too short"
        for key in ("net_income_change", "state_tax_change", "federal_tax_change"):
            assert len(chart[key]) == n, (
                f"household {h['label']} chart.{key} has {len(chart[key])} "
                f"entries vs income_range {n}"
            )


def test_provisions_structure(households: list[dict]) -> None:
    """Each provision must carry net_income_change; rates/sciad/eitc also
    carry state_tax_change and federal_tax_change."""
    for h in households:
        provisions = h["provisions"]
        for key in ("rates", "sciad", "eitc"):
            assert key in provisions, (
                f"household {h['label']} missing provisions.{key}"
            )
            for field in (
                "net_income_change",
                "state_tax_change",
                "federal_tax_change",
            ):
                assert field in provisions[key], (
                    f"household {h['label']} provisions.{key} missing {field}"
                )
        assert "interaction_residual" in provisions
        assert "net_income_change" in provisions["interaction_residual"]


def test_provisions_chart_arrays_aligned(households: list[dict]) -> None:
    """provisions_chart arrays must match income_range length."""
    for h in households:
        n = len(h["chart"]["income_range"])
        pc = h["provisions_chart"]
        for key in ("rates", "sciad", "eitc"):
            assert key in pc
            for field in (
                "net_income_change",
                "state_tax_change",
                "federal_tax_change",
            ):
                assert len(pc[key][field]) == n, (
                    f"household {h['label']} provisions_chart.{key}.{field} "
                    f"length mismatch ({len(pc[key][field])} vs {n})"
                )
        # interaction_residual only carries net_income_change.
        assert len(pc["interaction_residual"]["net_income_change"]) == n


def test_sign_convention_rates_revert_raises_sc_tax(
    households: list[dict],
) -> None:
    """Pre-2026 SC top rate was 6% vs current law's 5.21%, so reverting
    only the rate schedule must RAISE SC tax (negative state_tax_change
    under baseline-minus-revert) for any household that actually owes
    SC tax. Households below the filing threshold pay $0 either way.
    """
    for h in households:
        rates = h["provisions"]["rates"]
        if abs(rates["state_tax_change"]) < 1:
            continue
        assert rates["state_tax_change"] < 0, (
            f"household {h['label']}: rates-only revert state_tax_change="
            f"{rates['state_tax_change']:.2f} should be negative "
            f"(pre-2026 6% top rate > current 5.21%). Baseline/revert may "
            f"have been swapped."
        )


def test_federal_channel_visible_for_itemizer(households: list[dict]) -> None:
    """A profile labeled 'itemizer' must actually itemize federally and
    therefore show a non-zero federal_tax_change on rate revert (SALT
    flow-through). PE-US's federal mortgage-interest deduction reads
    tax-unit-level inputs; passing person-level home_mortgage_interest
    is a silent no-op that previously kept this profile on the standard
    deduction and zeroed the federal channel. This test guards against
    that regression.
    """
    itemizers = [h for h in households if "itemizer" in h["label"].lower()]
    if not itemizers:
        pytest.skip("no itemizer profile in payload")
    for h in itemizers:
        fed_rates = h["provisions"]["rates"]["federal_tax_change"]
        assert abs(fed_rates) >= 1, (
            f"household {h['label']}: itemizer profile's rates-only "
            f"revert produced federal_tax_change={fed_rates:.2f}. PE-US "
            f"may be reading mortgage interest from the wrong variable "
            f"again — check build_household() routes "
            f"home_mortgage_interest -> first_home_mortgage_* on the "
            f"tax unit."
        )
