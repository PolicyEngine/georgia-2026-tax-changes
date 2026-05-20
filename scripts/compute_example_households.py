"""Pre-compute representative SC households so the household tab can show
example impacts without hitting the PE API on page load.

For each profile, runs the current-law sim plus four inverse-reform sims
(full revert + each provision in isolation: rate brackets, SCIAD, and
the EITC $200 cap) so the dashboard can attribute the household impact
to each provision individually. Sweep arrays are computed for each
variant so the chart can render per-provision lines instantly.

Sign convention: impact = current law (no reform) - pre-2026 (revert
applied), so positive numbers mean the household gains under the 2026
changes. ``interaction_residual`` captures the non-additivity from
tax-math interactions; it equals ``total - (rates + sciad + eitc)``.

Usage:
    uv run --with requests scripts/compute_example_households.py
"""

import json
import os
from pathlib import Path

import requests

# Allow staging / dev override via env so the script can target a non-
# prod API without editing the source.
PE_API = os.environ.get(
    "PE_API_URL", "https://api.policyengine.org/us/calculate"
)
YEAR = 2026
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "example_households.json"

PROFILES = [
    {
        "label": "Single parent, $35k, 2 kids (EITC range)",
        "income": 35_000,
        "age_head": 30,
        "married": False,
        "dependents": [4, 7],
    },
    {
        "label": "Married couple, $80k, 1 kid",
        "income": 80_000,
        "age_head": 36,
        "married": True,
        "dependents": [9],
    },
    {
        "label": "Married couple, $200k, 2 kids, itemizer",
        "income": 200_000,
        "age_head": 45,
        "married": True,
        "dependents": [11, 14],
        "real_estate_taxes": 12_000,
        # PE-US's federal mortgage-interest deduction reads tax-unit-
        # level first_home_mortgage_interest / balance / origination
        # year (apply §163(h) acquisition-debt cap) — not the
        # person-level home_mortgage_interest variable, which is
        # derived. Pass all three so the deduction actually fires.
        "home_mortgage_interest": 20_000,
        "home_mortgage_balance": 300_000,
        "home_mortgage_origination_year": 2020,
        "charitable_cash_donations": 5_000,
    },
]


# Period covering 2026 forward; reused by every revert override.
_PERIOD = "2026-01-01.2100-12-31"


def _rates_overrides() -> dict:
    """Revert just the SC rate-bracket schedule to 2025 values."""
    return {
        "gov.states.sc.tax.income.rates[0].rate": {_PERIOD: 0},
        "gov.states.sc.tax.income.rates[1].threshold": {_PERIOD: 3_560},
        "gov.states.sc.tax.income.rates[1].rate": {_PERIOD: 0.03},
        "gov.states.sc.tax.income.rates[2].threshold": {_PERIOD: 17_830},
        "gov.states.sc.tax.income.rates[2].rate": {_PERIOD: 0.06},
    }


def _sciad_overrides() -> dict:
    """Disable the SCIAD deduction (revert to federal-style deduction)."""
    return {
        "gov.states.sc.tax.income.deductions.sciad.in_effect": {_PERIOD: False},
    }


def _eitc_overrides() -> dict:
    """Remove the $200 SC EITC cap (effectively uncapped)."""
    return {
        "gov.states.sc.tax.income.credits.eitc.max": {_PERIOD: 999_999_999},
    }


def reform_policy() -> dict:
    """Full revert: all three provisions reverted simultaneously.

    Equivalent to ``reform_revert.json`` at the repo root.
    """
    return {
        **_rates_overrides(),
        **_sciad_overrides(),
        **_eitc_overrides(),
    }


# Provision-only revert variants; each isolates one provision.
PROVISION_OVERRIDES: dict[str, dict] = {
    "rates": _rates_overrides(),
    "sciad": _sciad_overrides(),
    "eitc": _eitc_overrides(),
}


def build_household(profile: dict, with_axes: bool = False) -> dict:
    """Build a PolicyEngine household situation for the given profile.

    If ``with_axes`` is True, sweeps employment_income from $0 to a
    profile-derived max so we can pre-compute the full net-income chart.

    Itemizable inputs route to PE-US's actual reading locations:

    - ``real_estate_taxes`` and ``charitable_cash_donations`` are
      person-level inputs and feed federal SALT / charitable deductions
      directly.
    - Mortgage interest is computed at the tax-unit level via
      ``first_home_mortgage_interest`` + ``first_home_mortgage_balance``
      + ``first_home_mortgage_origination_year`` so the §163(h)
      acquisition-debt cap fires. The profile's ``home_mortgage_interest``
      key is conceptual; we translate it here.
    """
    year = str(YEAR)
    income_for_baseline = None if with_axes else profile["income"]
    you_attrs: dict = {
        "age": {year: profile["age_head"]},
        "employment_income": {year: income_for_baseline},
    }
    # Person-level itemization inputs. NOTE: home_mortgage_interest is
    # routed via the tax-unit-level variables below, not set here.
    for var in ("real_estate_taxes", "charitable_cash_donations"):
        if var in profile:
            you_attrs[var] = {year: profile[var]}
    people: dict = {"you": you_attrs}
    members = ["you"]
    marital_units: dict = {"your marital unit": {"members": ["you"]}}

    if profile["married"]:
        people["your partner"] = {"age": {year: 35}}
        members.append("your partner")
        marital_units["your marital unit"]["members"].append("your partner")

    for i, age in enumerate(profile["dependents"]):
        cid = (
            "your first dependent"
            if i == 0
            else "your second dependent"
            if i == 1
            else f"dependent_{i + 1}"
        )
        people[cid] = {"age": {year: age}}
        members.append(cid)
        marital_units[f"{cid}'s marital unit"] = {"members": [cid]}

    tax_unit: dict = {
        "members": members,
        "adjusted_gross_income": {year: None},
        "income_tax": {year: None},
        "sc_income_tax": {year: None},
    }
    # Federal mortgage-interest deduction is a tax-unit calculation in
    # PE-US: it needs both the interest paid and the outstanding
    # balance, plus the origination year for the §163(h) cap selection.
    if "home_mortgage_interest" in profile:
        tax_unit["first_home_mortgage_interest"] = {
            year: profile["home_mortgage_interest"]
        }
    if "home_mortgage_balance" in profile:
        tax_unit["first_home_mortgage_balance"] = {
            year: profile["home_mortgage_balance"]
        }
    if "home_mortgage_origination_year" in profile:
        tax_unit["first_home_mortgage_origination_year"] = {
            year: profile["home_mortgage_origination_year"]
        }

    situation: dict = {
        "people": people,
        "families": {"your family": {"members": members}},
        "marital_units": marital_units,
        "spm_units": {"your household": {"members": members}},
        "tax_units": {"your tax unit": tax_unit},
        "households": {
            "your household": {
                "members": members,
                "state_code": {year: "SC"},
                "household_net_income": {year: None},
            }
        },
    }

    if with_axes:
        axis_max = max(profile["income"] * 2, 100_000)
        situation["axes"] = [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": axis_max,
                    "count": 201,
                    "period": year,
                    "target": "person",
                }
            ]
        ]
    return situation


def calc(situation: dict, policy: dict | None) -> dict:
    body: dict = {"household": situation}
    if policy:
        body["policy"] = policy
    response = requests.post(
        PE_API, json=body, headers={"Content-Type": "application/json"}, timeout=180
    )
    if not response.ok:
        raise RuntimeError(f"{response.status_code}: {response.text[:500]}")
    return response.json()["result"]


def extract(result: dict) -> dict:
    yr = str(YEAR)
    hh = result["households"]["your household"]
    tu = result["tax_units"]["your tax unit"]
    return {
        "household_net_income": hh["household_net_income"][yr],
        "sc_income_tax": tu["sc_income_tax"][yr],
        "income_tax": tu["income_tax"][yr],
    }


def _sweep_arrays(result: dict) -> dict:
    """Pull the three sweep arrays we need from a /us/calculate response."""
    yr = str(YEAR)
    return {
        "income_range": result["people"]["you"]["employment_income"][yr],
        "net_income": result["households"]["your household"]["household_net_income"][yr],
        "state_tax": result["tax_units"]["your tax unit"]["sc_income_tax"][yr],
        "income_tax": result["tax_units"]["your tax unit"]["income_tax"][yr],
    }


def _diff(base: list[float], revert: list[float]) -> list[float]:
    """Element-wise current_law - revert: positive means household gains."""
    return [b - r for b, r in zip(base, revert)]


def compute_profile(profile: dict) -> dict:
    """Run baseline (current law) plus full and per-provision reverts at
    the user's income point and as an income sweep so the page can render
    the full net-income chart instantly with per-provision lines."""
    point_situation = build_household(profile, with_axes=False)
    sweep_situation = build_household(profile, with_axes=True)

    base_pt = extract(calc(point_situation, None))
    base_sweep = _sweep_arrays(calc(sweep_situation, None))

    def run_revert(overrides: dict) -> tuple[dict, dict]:
        return (
            extract(calc(point_situation, overrides)),
            _sweep_arrays(calc(sweep_situation, overrides)),
        )

    full_pt, full_sweep = run_revert(reform_policy())

    provision_pts: dict[str, dict] = {}
    provision_sweeps: dict[str, dict] = {}
    for key, overrides in PROVISION_OVERRIDES.items():
        provision_pts[key], provision_sweeps[key] = run_revert(overrides)

    # Total impact (full revert).
    income_change_total = (
        base_pt["household_net_income"] - full_pt["household_net_income"]
    )
    sc_change_total = base_pt["sc_income_tax"] - full_pt["sc_income_tax"]
    fed_change_total = base_pt["income_tax"] - full_pt["income_tax"]

    # Per-provision point impacts at the user's income.
    provisions_pt: dict[str, dict] = {}
    for key, pt in provision_pts.items():
        provisions_pt[key] = {
            "net_income_change": (
                base_pt["household_net_income"] - pt["household_net_income"]
            ),
            "state_tax_change": (
                base_pt["sc_income_tax"] - pt["sc_income_tax"]
            ),
            "federal_tax_change": (
                base_pt["income_tax"] - pt["income_tax"]
            ),
        }

    # Per-provision sweep arrays.
    provisions_chart: dict[str, dict] = {}
    for key, sw in provision_sweeps.items():
        provisions_chart[key] = {
            "net_income_change": _diff(base_sweep["net_income"], sw["net_income"]),
            "state_tax_change": _diff(base_sweep["state_tax"], sw["state_tax"]),
            "federal_tax_change": _diff(base_sweep["income_tax"], sw["income_tax"]),
        }

    # Interaction residual: total minus the sum of provision-only impacts.
    sum_components_pt = sum(
        provisions_pt[k]["net_income_change"] for k in provisions_pt
    )
    interaction_residual_pt = income_change_total - sum_components_pt

    sum_components_chart = [
        sum(provisions_chart[k]["net_income_change"][i] for k in provisions_chart)
        for i in range(len(base_sweep["income_range"]))
    ]
    interaction_residual_chart = [
        total_pt - comp
        for total_pt, comp in zip(
            _diff(base_sweep["net_income"], full_sweep["net_income"]),
            sum_components_chart,
        )
    ]

    # Top-level chart arrays (kept for backward compatibility).
    chart = {
        "income_range": base_sweep["income_range"],
        "net_income_change": _diff(base_sweep["net_income"], full_sweep["net_income"]),
        "state_tax_change": _diff(base_sweep["state_tax"], full_sweep["state_tax"]),
        "federal_tax_change": _diff(
            base_sweep["income_tax"], full_sweep["income_tax"]
        ),
    }

    return {
        **profile,
        "baseline": base_pt,
        "reform": full_pt,
        "net_income_change": income_change_total,
        "sc_tax_change": sc_change_total,
        "federal_tax_change": fed_change_total,
        "chart": chart,
        "provisions": {
            **provisions_pt,
            "interaction_residual": {
                "net_income_change": interaction_residual_pt,
                # Residual on the tax components is rarely meaningful;
                # keep state/federal at the chart level only.
            },
        },
        "provisions_chart": {
            **provisions_chart,
            "interaction_residual": {
                "net_income_change": interaction_residual_chart,
            },
        },
    }


def _validate_sign_convention(rows: list[dict]) -> None:
    """Fail loud if the baseline/revert sign convention got flipped.

    Pre-2026 SC had a 6% top rate vs current law's 5.21%, so reverting
    only the rate schedule must *raise* state tax (negative
    state_tax_change in our convention) for any household with non-zero
    SC liability. If the wiring ever inverts, the entire dashboard
    reads backwards — catch it before we ship a broken JSON.
    """
    for row in rows:
        rates = row.get("provisions", {}).get("rates", {})
        # Households below the SC filing threshold have $0 liability
        # either way and don't constrain the check.
        if abs(rates.get("state_tax_change", 0)) < 1:
            continue
        if rates["state_tax_change"] >= 0:
            raise SystemExit(
                f"Sign-convention check failed for {row['label']}: "
                f"rates-only revert produced state_tax_change="
                f"{rates['state_tax_change']:.2f} but pre-2026 6% top "
                f"rate should raise SC tax (negative under "
                f"baseline-minus-revert). Did baseline and revert get "
                f"swapped?"
            )


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for profile in PROFILES:
        print(f"  Computing: {profile['label']}...")
        rows.append(compute_profile(profile))

    _validate_sign_convention(rows)

    with OUTPUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump({"year": YEAR, "households": rows}, fh, indent=2)
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
