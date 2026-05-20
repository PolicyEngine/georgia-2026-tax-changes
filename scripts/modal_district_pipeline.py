"""Modal-based congressional-district impact pipeline for the SC 2026 tax changes.

Calculates district-level impacts for South Carolina's seven
congressional districts (SC-01..SC-07; state_fips=45) using
district-specific datasets on HuggingFace.

Baseline sim applies the inverse reform (pre-2026 parameters); reform
sim is current law. Impact = current_law - pre_2026.

Usage:
    modal run scripts/modal_district_pipeline.py
"""

import os

import modal

# Single inverse-reform variant; CSV is suffixed with this key.
VARIANT = "revert"

# Modal app definition
app = modal.App("south-carolina-2026-tax-changes-district-pipeline")

# Image with policyengine-us and dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "policyengine-us>=1.150.0",
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "huggingface_hub",
    )
)

# South Carolina: 7 congressional districts, state FIPS 45.
SC_STATE = "SC"
SC_STATE_FIPS = 45
SC_DISTRICTS = [1, 2, 3, 4, 5, 6, 7]

# Inverse reform: revert South Carolina parameters to pre-2026 (2025)
# values (0%/3%/6% rate schedule with bracket thresholds at $3,560 and
# $17,830, no SCIAD, uncapped EITC).
REFORM_DICT = {
    "gov.states.sc.tax.income.rates[0].rate": {
        "2026-01-01.2100-12-31": 0,
    },
    "gov.states.sc.tax.income.rates[1].threshold": {
        "2026-01-01.2100-12-31": 3560,
    },
    "gov.states.sc.tax.income.rates[1].rate": {
        "2026-01-01.2100-12-31": 0.03,
    },
    "gov.states.sc.tax.income.rates[2].threshold": {
        "2026-01-01.2100-12-31": 17830,
    },
    "gov.states.sc.tax.income.rates[2].rate": {
        "2026-01-01.2100-12-31": 0.06,
    },
    "gov.states.sc.tax.income.deductions.sciad.in_effect": {
        "2026-01-01.2100-12-31": False,
    },
    "gov.states.sc.tax.income.credits.eitc.max": {
        "2026-01-01.2100-12-31": 999999999,
    },
}

YEAR = 2026


def get_sc_districts() -> list[str]:
    """Return the list of South Carolina congressional district IDs (SC-01..SC-07)."""
    return [f"{SC_STATE}-{d:02d}" for d in SC_DISTRICTS]


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=2,
)
def calculate_single_district_impact(district_id: str, year: int = YEAR) -> dict:
    """Calculate impact for a single South Carolina congressional district.

    Uses the district-specific dataset on HuggingFace. Returns winners/
    losers share, average and relative income change, and poverty
    percent changes. Impact = current_law - pre_2026.
    """
    import re

    import numpy as np
    from policyengine_us import Microsimulation
    from policyengine_core.reforms import Reform
    from policyengine_core.periods import instant

    print(f"Calculating impact for {district_id}...")

    dataset_url = f"hf://policyengine/policyengine-us-data/districts/{district_id}.h5"

    try:
        # Build a bracket-aware reform because ``Reform.from_dict`` does not
        # understand ``name[N]`` segments in parameter paths.
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

        class SCReform(Reform):
            def apply(self):
                self.modify_parameters(modify)

        reform = SCReform

        sim_baseline = Microsimulation(dataset=dataset_url, reform=reform)
        sim_reform = Microsimulation(dataset=dataset_url)

        household_weight = np.array(sim_baseline.calculate("household_weight", period=year))
        baseline_net_income = np.array(sim_baseline.calculate("household_net_income", period=year))
        reform_net_income = np.array(sim_reform.calculate("household_net_income", period=year))
        # current_law - pre_2026
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
                # baseline = pre_2026, reform = current_law
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

        print(f"  {district_id}: avg=${avg_change:.2f}, winners={winners_share:.1%}, poverty={poverty_pct_change:+.1f}%")
        return result

    except Exception as e:
        print(f"  ERROR for {district_id}: {e}")
        return None


@app.local_entrypoint()
def main(year: int = YEAR):
    """Run South Carolina district-level analysis on Modal and save to CSV."""
    import pandas as pd

    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    districts = get_sc_districts()

    print("Running South Carolina 2026 tax-changes district analysis on Modal...")
    print(f"Year: {year}")
    print(f"State: {SC_STATE} (FIPS {SC_STATE_FIPS})")
    print(f"Districts: {districts}")
    print(f"Output directory: {output_dir}")

    results = list(calculate_single_district_impact.map(districts, kwargs={"year": year}))
    new_districts = [r for r in results if r is not None]

    failed_count = len(results) - len(new_districts)
    if failed_count > 0:
        print(f"WARNING: {failed_count} districts failed to calculate")

    if not new_districts:
        print("ERROR: No district data generated!")
        return

    df = pd.DataFrame(new_districts)
    df = df.sort_values(["state", "district"]).reset_index(drop=True)

    filepath = os.path.join(output_dir, f"congressional_districts_{VARIANT}.csv")
    df.to_csv(filepath, index=False)
    print(f"\nSaved {len(df)} districts to: {filepath}")

    print("\nSummary:")
    print(f"  Total districts: {len(df)}")
    print(f"  Avg income change: ${df['average_household_income_change'].mean():,.2f}")
    print(f"  Min change: ${df['average_household_income_change'].min():,.2f}")
    print(f"  Max change: ${df['average_household_income_change'].max():,.2f}")
