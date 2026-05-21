"""Local congressional-district pipeline for the GA HB463 dashboard.

Runs the 14 Georgia congressional-district Microsimulations against
the local policyengine-us editable install (in .venv-ga) so we can
ship district-level numbers without paying for Modal credits while
HB463 isn't on PyPI yet.

Writes ``frontend/public/data/congressional_districts_revert.csv``
with the columns the dashboard expects:

    district, average_household_income_change,
    relative_household_income_change, winners_share, losers_share,
    poverty_pct_change, child_poverty_pct_change, state, year

The frontend joins on the static GA_REPRESENTATIVES /
GA_DISTRICT_REGIONS maps in CongressionalDistrictImpact.tsx; we only
ship the raw microsim outputs.

Usage:
    .venv-ga/Scripts/python.exe scripts/district_pipeline_local.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from policyengine_us import Microsimulation  # noqa: E402

from ga_tax_calc.reforms import create_ga_reverted_reform  # noqa: E402

GA_DISTRICTS = list(range(1, 15))  # GA-01 through GA-14
GA_STATE = "GA"

YEARS = [2026, 2027, 2028]

OUTPUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "congressional_districts_revert.csv"


def calculate_district(district_id: str, year: int) -> dict | None:
    """Run baseline (pre-HB463 revert) vs. reform (current law) for one
    Georgia district at one tax year. Returns the row of district
    aggregates the dashboard CSV expects, or None on failure.
    """
    dataset_url = (
        f"hf://policyengine/policyengine-us-data/districts/{district_id}.h5"
    )
    print(f"  {district_id} TY{year}:", flush=True)

    try:
        reform = create_ga_reverted_reform()
        sim_baseline = Microsimulation(dataset=dataset_url, reform=reform)
        sim_reform = Microsimulation(dataset=dataset_url)

        household_weight = np.array(
            sim_baseline.calculate("household_weight", period=year)
        )
        baseline_net_income = np.array(
            sim_baseline.calculate("household_net_income", period=year)
        )
        reform_net_income = np.array(
            sim_reform.calculate("household_net_income", period=year)
        )
        # current_law - pre_hb463
        income_change = reform_net_income - baseline_net_income

        total_weight = float(household_weight.sum())

        if total_weight > 0:
            avg_change = (income_change * household_weight).sum() / total_weight
            avg_baseline = (
                (baseline_net_income * household_weight).sum() / total_weight
            )
            rel_change = avg_change / avg_baseline if avg_baseline > 0 else 0.0
            winners_share = (
                household_weight[income_change > 1].sum() / total_weight
            )
            losers_share = (
                household_weight[income_change < -1].sum() / total_weight
            )
        else:
            avg_change = 0.0
            rel_change = 0.0
            winners_share = 0.0
            losers_share = 0.0

        # SPM poverty (household-level). The state aggregate pipeline uses
        # in_poverty (person-level); we mirror the SC district pipeline here
        # which uses SPM-unit poverty so the district numbers stay in the
        # same units as the previous SC dashboard.
        try:
            spm_weight = np.array(
                sim_baseline.calculate("spm_unit_weight", period=year)
            )
            total_spm_w = float(spm_weight.sum())

            if total_spm_w > 0:
                pov_baseline = np.array(
                    sim_baseline.calculate(
                        "spm_unit_is_in_spm_poverty", period=year
                    )
                )
                pov_reform = np.array(
                    sim_reform.calculate(
                        "spm_unit_is_in_spm_poverty", period=year
                    )
                )
                pov_baseline_rate = (
                    (pov_baseline * spm_weight).sum() / total_spm_w
                )
                pov_reform_rate = (
                    (pov_reform * spm_weight).sum() / total_spm_w
                )
                poverty_pct_change = (
                    (pov_baseline_rate - pov_reform_rate)
                    / pov_reform_rate
                    * 100
                    if pov_reform_rate > 0
                    else 0.0
                )

                children = np.array(
                    sim_baseline.calculate(
                        "spm_unit_count_children", period=year
                    )
                )
                child_w = spm_weight * children
                total_child_w = float(child_w.sum())

                if total_child_w > 0:
                    base_child_rate = (
                        (pov_baseline * child_w).sum() / total_child_w
                    )
                    reform_child_rate = (
                        (pov_reform * child_w).sum() / total_child_w
                    )
                    child_poverty_pct_change = (
                        (base_child_rate - reform_child_rate)
                        / reform_child_rate
                        * 100
                        if reform_child_rate > 0
                        else 0.0
                    )
                else:
                    child_poverty_pct_change = 0.0
            else:
                poverty_pct_change = 0.0
                child_poverty_pct_change = 0.0
        except Exception as poverty_err:
            print(
                f"    Warning: poverty calc failed: {poverty_err}", flush=True
            )
            poverty_pct_change = 0.0
            child_poverty_pct_change = 0.0

        print(
            f"    avg=${avg_change:,.2f}  winners={winners_share:.1%}  "
            f"poverty={poverty_pct_change:+.2f}%",
            flush=True,
        )

        return {
            "district": district_id,
            "average_household_income_change": round(float(avg_change), 2),
            "relative_household_income_change": round(float(rel_change), 6),
            "winners_share": round(float(winners_share), 4),
            "losers_share": round(float(losers_share), 4),
            "poverty_pct_change": round(float(poverty_pct_change), 2),
            "child_poverty_pct_change": round(
                float(child_poverty_pct_change), 2
            ),
            "state": GA_STATE,
            "year": year,
        }

    except Exception as exc:
        print(f"    ERROR {district_id}: {exc}", flush=True)
        return None


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for year in YEARS:
        print(f"\n=== Year {year} ===", flush=True)
        for d in GA_DISTRICTS:
            district_id = f"{GA_STATE}-{d:02d}"
            row = calculate_district(district_id, year)
            if row is not None:
                rows.append(row)

    if not rows:
        print("ERROR: no district rows produced", flush=True)
        return

    df = pd.DataFrame(rows)
    df = df.sort_values(["year", "district"]).reset_index(drop=True)
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSaved {len(df)} rows -> {OUTPUT_PATH}", flush=True)

    summary = df.groupby("year")["average_household_income_change"]
    print("\nAvg household income change by year:")
    for year, mean in summary.mean().items():
        lo = summary.min()[year]
        hi = summary.max()[year]
        print(f"  {year}: ${mean:,.2f} (min ${lo:,.2f}, max ${hi:,.2f})")


if __name__ == "__main__":
    main()
