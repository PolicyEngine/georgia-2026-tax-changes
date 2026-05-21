"""Modal-based congressional-district impact pipeline for the GA HB463 dashboard.

Calculates district-level impacts for Georgia's 14 congressional
districts (GA-01..GA-14; state_fips=13) using district-specific
datasets on HuggingFace.

Baseline sim applies the inverse reform (pre-HB463 parameters);
reform sim is current law. Impact = current_law - pre_hb463.

NOTE: The PyPI release of ``policyengine-us`` must include PR #8306
(Apply Georgia HB463 (2025-2026 session) tax cuts and refactor GA
flat-tax rate structure). If you get
``Unrecognized policy parameter 'gov.states.ga.tax.income.main.flat_rate'``
you need to bump the pinned version below.

Usage:
    modal run scripts/modal_district_pipeline.py
"""

import os

import modal

# Single inverse-reform variant; CSV is suffixed with this key.
VARIANT = "revert"

# Modal app definition
app = modal.App("georgia-2026-tax-changes-district-pipeline")

# Image with policyengine-us and dependencies. PE-US 1.702.1 (released
# 2026-05-21) is the first PyPI build that includes HB463 / PR #8306.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "policyengine-us>=1.702.1",
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "huggingface_hub",
    )
)

# Georgia: 14 congressional districts, state FIPS 13.
GA_STATE = "GA"
GA_STATE_FIPS = 13
GA_DISTRICTS = list(range(1, 15))

# HB463 spans TY 2026-2028. Each Modal invocation defaults to all
# three years; pass --year=2026 (etc.) on the command line to run a
# subset. Modal fans these out across district-years in parallel.
YEARS = [2026, 2027, 2028]

# Inverse reform: revert HB463 to pre-HB463 values. Mirrors the
# overrides in ``reform_revert.json`` and ``ga_tax_calc.reforms``.
# Period notes:
# - Flat rate / SD / dependent exemption revert from TY 2026 forward.
# - Overtime / tip exclusions self-repeal end of TY 2028 → revert is
#   only applied for TY 2026-2028.
# - Retirement-exclusion bump kicks in TY 2027 → revert applies from
#   TY 2027 forward.
REFORM_DICT = {
    "gov.states.ga.tax.income.main.flat_rate": {
        "2026-01-01.2100-12-31": 0.0519,
    },
    "gov.states.ga.tax.income.deductions.standard.amount.JOINT": {
        "2026-01-01.2100-12-31": 24000,
    },
    "gov.states.ga.tax.income.deductions.standard.amount.SURVIVING_SPOUSE": {
        "2026-01-01.2100-12-31": 24000,
    },
    "gov.states.ga.tax.income.deductions.standard.amount.SINGLE": {
        "2026-01-01.2100-12-31": 12000,
    },
    "gov.states.ga.tax.income.deductions.standard.amount.HEAD_OF_HOUSEHOLD": {
        "2026-01-01.2100-12-31": 12000,
    },
    "gov.states.ga.tax.income.deductions.standard.amount.SEPARATE": {
        "2026-01-01.2100-12-31": 12000,
    },
    "gov.states.ga.tax.income.exemptions.dependent": {
        "2026-01-01.2100-12-31": 4000,
    },
    "gov.states.ga.tax.income.agi.exclusions.retirement.cap.older": {
        "2027-01-01.2100-12-31": 65000,
    },
    "gov.states.ga.tax.income.agi.exclusions.overtime.cap": {
        "2026-01-01.2028-12-31": 0,
    },
    "gov.states.ga.tax.income.agi.exclusions.tips.cap": {
        "2026-01-01.2028-12-31": 0,
    },
}


def get_ga_districts() -> list[str]:
    """Return the list of Georgia congressional district IDs (GA-01..GA-14)."""
    return [f"{GA_STATE}-{d:02d}" for d in GA_DISTRICTS]


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=2,
)
def calculate_single_district_impact(
    district_id: str, year: int = YEARS[0]
) -> dict:
    """Calculate impact for a single Georgia congressional district.

    Uses the district-specific dataset on HuggingFace. Returns winners/
    losers share, average and relative income change, and poverty
    percent changes. Impact = current_law - pre_hb463.
    """
    import re

    import numpy as np
    from policyengine_us import Microsimulation
    from policyengine_core.reforms import Reform
    from policyengine_core.periods import instant

    print(f"Calculating impact for {district_id} TY{year}...")

    dataset_url = f"hf://policyengine/policyengine-us-data/districts/{district_id}.h5"

    try:
        # Walk dotted parameter paths and update the leaf parameter over
        # the given period. Bracket syntax (``name[N]``) is handled too,
        # though none of HB463's parameters use it — we keep the support
        # so this code can drop in unchanged from the SC pipeline.
        def modify(parameters):
            for path, periods in REFORM_DICT.items():
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

        class GAReform(Reform):
            def apply(self):
                self.modify_parameters(modify)

        reform = GAReform

        sim_baseline = Microsimulation(dataset=dataset_url, reform=reform)
        sim_reform = Microsimulation(dataset=dataset_url)

        household_weight = np.array(sim_baseline.calculate("household_weight", period=year))
        baseline_net_income = np.array(sim_baseline.calculate("household_net_income", period=year))
        reform_net_income = np.array(sim_reform.calculate("household_net_income", period=year))
        # current_law - pre_hb463
        income_change = reform_net_income - baseline_net_income

        total_weight = household_weight.sum()

        if total_weight > 0:
            avg_change = (income_change * household_weight).sum() / total_weight
            avg_baseline = (baseline_net_income * household_weight).sum() / total_weight
            rel_change = avg_change / avg_baseline if avg_baseline > 0 else 0.0

            winners_mask = income_change > 1
            losers_mask = income_change < -1
            winners_share = (household_weight * winners_mask).sum() / total_weight
            losers_share = (household_weight * losers_mask).sum() / total_weight
        else:
            avg_change = 0.0
            rel_change = 0.0
            winners_share = 0.0
            losers_share = 0.0

        try:
            spm_unit_weight = np.array(sim_baseline.calculate("spm_unit_weight", period=year))
            total_spm_weight = spm_unit_weight.sum()

            if total_spm_weight > 0:
                baseline_in_poverty = np.array(sim_baseline.calculate("spm_unit_is_in_spm_poverty", period=year))
                reform_in_poverty = np.array(sim_reform.calculate("spm_unit_is_in_spm_poverty", period=year))

                baseline_poverty_rate = (baseline_in_poverty * spm_unit_weight).sum() / total_spm_weight
                reform_poverty_rate = (reform_in_poverty * spm_unit_weight).sum() / total_spm_weight
                # baseline = pre_hb463, reform = current_law
                poverty_pct_change = (
                    (baseline_poverty_rate - reform_poverty_rate) / reform_poverty_rate * 100
                    if reform_poverty_rate > 0
                    else 0.0
                )

                spm_unit_children = np.array(sim_baseline.calculate("spm_unit_count_children", period=year))
                child_weight = spm_unit_weight * spm_unit_children
                total_child_weight = child_weight.sum()

                if total_child_weight > 0:
                    baseline_child_poverty_rate = (baseline_in_poverty * child_weight).sum() / total_child_weight
                    reform_child_poverty_rate = (reform_in_poverty * child_weight).sum() / total_child_weight
                    child_poverty_pct_change = (
                        (baseline_child_poverty_rate - reform_child_poverty_rate) / reform_child_poverty_rate * 100
                        if reform_child_poverty_rate > 0
                        else 0.0
                    )
                else:
                    child_poverty_pct_change = 0.0
            else:
                poverty_pct_change = 0.0
                child_poverty_pct_change = 0.0
        except Exception as poverty_err:
            print(f"  Warning: Poverty calculation failed for {district_id}: {poverty_err}")
            poverty_pct_change = 0.0
            child_poverty_pct_change = 0.0

        state = district_id.split("-")[0]
        result = {
            "district": district_id,
            "average_household_income_change": round(float(avg_change), 2),
            "relative_household_income_change": round(float(rel_change), 6),
            "winners_share": round(float(winners_share), 4),
            "losers_share": round(float(losers_share), 4),
            "poverty_pct_change": round(float(poverty_pct_change), 2),
            "child_poverty_pct_change": round(float(child_poverty_pct_change), 2),
            "state": state,
            "year": year,
        }

        print(
            f"  {district_id} TY{year}: avg=${avg_change:.2f}, "
            f"winners={winners_share:.1%}, poverty={poverty_pct_change:+.1f}%"
        )
        return result

    except Exception as e:
        print(f"  ERROR for {district_id} TY{year}: {e}")
        return None


@app.local_entrypoint()
def main(year: str = ""):
    """Run Georgia district-level analysis on Modal and save to CSV.

    Args:
        year: Comma-separated list of years to run. If empty, runs the
              default set (2026, 2027, 2028) for all 14 GA districts.
    """
    import pandas as pd

    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    target_years = (
        [int(y.strip()) for y in year.split(",")] if year else list(YEARS)
    )
    districts = get_ga_districts()

    print("Running Georgia HB463 district analysis on Modal...")
    print(f"Years: {target_years}")
    print(f"State: {GA_STATE} (FIPS {GA_STATE_FIPS})")
    print(f"Districts: {districts}")
    print(f"Output directory: {output_dir}")

    # Fan out (district, year) pairs across Modal workers.
    tasks = [(d, y) for y in target_years for d in districts]
    args_iter = [t[0] for t in tasks]
    kwargs_iter = [{"year": t[1]} for t in tasks]
    results = list(
        calculate_single_district_impact.starmap(
            zip(args_iter, [k["year"] for k in kwargs_iter])
        )
    )

    new_rows = [r for r in results if r is not None]

    failed_count = len(results) - len(new_rows)
    if failed_count > 0:
        print(f"WARNING: {failed_count} district-years failed to calculate")

    if not new_rows:
        print("ERROR: No district data generated!")
        return

    filepath = os.path.join(output_dir, f"congressional_districts_{VARIANT}.csv")

    # Merge with any existing rows so partial reruns are non-destructive.
    if os.path.exists(filepath):
        try:
            existing = pd.read_csv(filepath)
            new_keys = {(r["district"], r["year"]) for r in new_rows}
            existing = existing[
                ~existing.apply(
                    lambda r: (r["district"], r["year"]) in new_keys,
                    axis=1,
                )
            ]
            df = pd.concat([existing, pd.DataFrame(new_rows)], ignore_index=True)
        except Exception:
            df = pd.DataFrame(new_rows)
    else:
        df = pd.DataFrame(new_rows)

    df = df.sort_values(["year", "state", "district"]).reset_index(drop=True)
    df.to_csv(filepath, index=False)
    print(f"\nSaved {len(df)} rows to: {filepath}")

    print("\nSummary by year:")
    for y, grp in df.groupby("year"):
        print(
            f"  {y}: avg=${grp['average_household_income_change'].mean():,.2f}  "
            f"(min ${grp['average_household_income_change'].min():,.2f}, "
            f"max ${grp['average_household_income_change'].max():,.2f})"
        )
