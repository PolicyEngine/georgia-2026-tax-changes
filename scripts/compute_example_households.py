"""Pre-compute representative GA households so the household tab can show
example impacts without hitting the PE API on page load.

For each profile, runs the current-law sim plus the full inverse-reform
sim plus six per-provision reverts (flat_rate, standard_deduction,
dependent_exemption, retirement_exclusion, overtime_exclusion,
tip_exclusion) so the dashboard can attribute the household impact
to each provision individually. Sweep arrays are computed for each
variant so the chart can render per-provision lines instantly.

Sign convention: impact = current law (HB463) - pre-HB463 (revert
applied), so positive numbers mean the household gains under HB463.
``interaction_residual`` captures the non-additivity from tax-math
interactions; it equals ``total - sum(provisions)``.

Usage:
    uv run --with requests scripts/compute_example_households.py
"""

import json
from pathlib import Path

from policyengine_core.reforms import Reform
from policyengine_us import Simulation

YEAR = 2026
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "example_households.json"

# Three SC-mirrored household profiles, rebased for Georgia. The
# single-parent profile is rewired to a tipped + overtime-eligible
# job (server in Georgia) so the new HB463 overtime and tip
# exclusions actually fire.
PROFILES = [
    {
        "label": "Single parent server, $35k wages + $8k tips + $2k overtime, 2 kids",
        "income": 25_000,  # regular hourly wages
        "age_head": 30,
        "married": False,
        "dependents": [4, 7],
        "tip_income": 8_000,
        "fsla_overtime_premium": 2_000,
        "tip_income_deduction_occupation_requirement_met": True,
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
# Overtime + tip exclusions self-repeal end of TY 2028.
_PERIOD_OVERTIME_TIP = "2026-01-01.2028-12-31"
# Retirement exclusion bump kicks in TY 2027.
_PERIOD_RETIREMENT = "2027-01-01.2100-12-31"


def _flat_rate_overrides() -> dict:
    """Revert HB463's flat-rate cut: 4.99% (current law) -> 5.19%."""
    return {
        "gov.states.ga.tax.income.main.flat_rate": {_PERIOD: 0.0519},
    }


def _standard_deduction_overrides() -> dict:
    """Revert HB463's SD bumps: 30k/15k -> 24k/12k by filing status."""
    return {
        "gov.states.ga.tax.income.deductions.standard.amount.JOINT": {
            _PERIOD: 24_000
        },
        "gov.states.ga.tax.income.deductions.standard.amount.SURVIVING_SPOUSE": {
            _PERIOD: 24_000
        },
        "gov.states.ga.tax.income.deductions.standard.amount.SINGLE": {
            _PERIOD: 12_000
        },
        "gov.states.ga.tax.income.deductions.standard.amount.HEAD_OF_HOUSEHOLD": {
            _PERIOD: 12_000
        },
        "gov.states.ga.tax.income.deductions.standard.amount.SEPARATE": {
            _PERIOD: 12_000
        },
    }


def _dependent_exemption_overrides() -> dict:
    """Revert HB463's dependent-exemption bump: $5,000 -> $4,000."""
    return {
        "gov.states.ga.tax.income.exemptions.dependent": {_PERIOD: 4_000},
    }


def _retirement_exclusion_overrides() -> dict:
    """Revert HB463's age-65+ retirement exclusion bump (TY 2027+)."""
    return {
        "gov.states.ga.tax.income.agi.exclusions.retirement.cap.older": {
            _PERIOD_RETIREMENT: 65_000
        },
    }


def _overtime_exclusion_overrides() -> dict:
    """Revert HB463's new $1,750 overtime exclusion (TY 2026-2028)."""
    return {
        "gov.states.ga.tax.income.agi.exclusions.overtime.cap": {
            _PERIOD_OVERTIME_TIP: 0
        },
    }


def _tip_exclusion_overrides() -> dict:
    """Revert HB463's new $1,750 cash tip exclusion (TY 2026-2028)."""
    return {
        "gov.states.ga.tax.income.agi.exclusions.tips.cap": {
            _PERIOD_OVERTIME_TIP: 0
        },
    }


def reform_policy() -> dict:
    """Full revert: all six provisions reverted simultaneously.

    Equivalent to ``reform_revert.json`` at the repo root.
    """
    return {
        **_flat_rate_overrides(),
        **_standard_deduction_overrides(),
        **_dependent_exemption_overrides(),
        **_retirement_exclusion_overrides(),
        **_overtime_exclusion_overrides(),
        **_tip_exclusion_overrides(),
    }


# Per-provision revert variants used for the household-impact attribution.
# Keys mirror the waterfall PROVISION_ORDER in the frontend.
PROVISION_OVERRIDES: dict[str, dict] = {
    "flat_rate": _flat_rate_overrides(),
    "standard_deduction": _standard_deduction_overrides(),
    "dependent_exemption": _dependent_exemption_overrides(),
    "retirement_exclusion": _retirement_exclusion_overrides(),
    "overtime_exclusion": _overtime_exclusion_overrides(),
    "tip_exclusion": _tip_exclusion_overrides(),
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
    for var in (
        "real_estate_taxes",
        "charitable_cash_donations",
        "tip_income",
        "fsla_overtime_premium",
        "tip_income_deduction_occupation_requirement_met",
    ):
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
        "ga_income_tax": {year: None},
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
                "state_code": {year: "GA"},
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


def calc(situation: dict, policy: dict | None) -> Simulation:
    """Build a Simulation from the situation + optional reform overrides.

    Returns the Simulation object directly so callers can pull the
    variables they need at the entity level. We use direct policyengine
    calls instead of the public API because HB463 (PR #8306) is merged
    on master but the live api.policyengine.org service is still on a
    pre-merge snapshot.
    """
    if policy:
        reform = Reform.from_dict(policy, country_id="us")
        return Simulation(situation=situation, reform=reform)
    return Simulation(situation=situation)


def extract(sim: Simulation) -> dict:
    """Pull the single-point values (no axes) from a Simulation."""
    yr = str(YEAR)
    return {
        "household_net_income": float(
            sim.calculate("household_net_income", yr, map_to="household")[0]
        ),
        "ga_income_tax": float(
            sim.calculate("ga_income_tax", yr, map_to="tax_unit")[0]
        ),
        "income_tax": float(
            sim.calculate("income_tax", yr, map_to="tax_unit")[0]
        ),
    }


def _sweep_arrays(sim: Simulation) -> dict:
    """Pull the sweep arrays from a Simulation built with an axis.

    All arrays are aggregated to the household level so they have a
    consistent length (= axis count). ``income_range`` sums
    ``employment_income`` over household members, which equals the
    head's wages since only ``you`` has employment income in our
    profiles.
    """
    yr = str(YEAR)
    return {
        "income_range": sim.calculate(
            "employment_income", yr, map_to="household"
        ).tolist(),
        "net_income": sim.calculate(
            "household_net_income", yr, map_to="household"
        ).tolist(),
        "state_tax": sim.calculate(
            "ga_income_tax", yr, map_to="household"
        ).tolist(),
        "income_tax": sim.calculate(
            "income_tax", yr, map_to="household"
        ).tolist(),
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
    ga_change_total = base_pt["ga_income_tax"] - full_pt["ga_income_tax"]
    fed_change_total = base_pt["income_tax"] - full_pt["income_tax"]

    # Per-provision point impacts at the user's income.
    provisions_pt: dict[str, dict] = {}
    for key, pt in provision_pts.items():
        provisions_pt[key] = {
            "net_income_change": (
                base_pt["household_net_income"] - pt["household_net_income"]
            ),
            "state_tax_change": (
                base_pt["ga_income_tax"] - pt["ga_income_tax"]
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

    # Top-level chart arrays (kept for backward compatibility with SC layout).
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
        "ga_tax_change": ga_change_total,
        "federal_tax_change": fed_change_total,
        "chart": chart,
        "provisions": {
            **provisions_pt,
            "interaction_residual": {
                "net_income_change": interaction_residual_pt,
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

    Pre-HB463 GA had a 5.19% flat rate vs current law's 4.99%, so
    reverting only the flat rate must *raise* state tax (negative
    state_tax_change in our convention) for any household with non-zero
    GA liability. Catch sign flips before we ship a broken JSON.
    """
    for row in rows:
        rate = row.get("provisions", {}).get("flat_rate", {})
        # Households below the GA filing threshold have $0 liability
        # either way and don't constrain the check.
        if abs(rate.get("state_tax_change", 0)) < 1:
            continue
        if rate["state_tax_change"] >= 0:
            raise SystemExit(
                f"Sign-convention check failed for {row['label']}: "
                f"flat_rate-only revert produced state_tax_change="
                f"{rate['state_tax_change']:.2f} but pre-HB463 5.19% "
                f"rate should raise GA tax (negative under "
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
