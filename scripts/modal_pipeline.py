"""Modal-based data generation pipeline for the Georgia 2026 tax changes (HB463).

Runs the inverse reform (pre-HB463 parameters) against the Georgia
state dataset on Modal to compute the aggregate impact for tax years
2026-2028.

The sign convention matches ``ga_tax_calc.microsimulation``: baseline
sim applies the inverse reform (pre-HB463 parameters) and reform sim
is current law (HB463), so ``impact = current_law - pre_hb463``.

NOTE: The PyPI release of ``policyengine-us`` must include PR #8306
(Apply Georgia HB463 (2025-2026 session) tax cuts and refactor GA
flat-tax rate structure). If you get
``Unrecognized policy parameter 'gov.states.ga.tax.income.main.flat_rate'``
you need to bump the pinned version below.
"""

import json
import os

import modal

# Single inverse-reform variant; CSVs are suffixed with this key.
VARIANT = "revert"

# Modal app definition
app = modal.App("georgia-2026-tax-changes-pipeline")

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

# Statewide aggregates ship TY 2026 + TY 2027 only. TY 2028 (last
# year of the overtime/tip exclusions) is computed at the district
# level but not surfaced in the statewide dashboard.
YEARS = [2026, 2027]

# Georgia state dataset on HuggingFace
GA_DATASET = "hf://policyengine/policyengine-us-data/states/GA.h5"

# Inverse reform: revert HB463 to pre-HB463 values. Mirrors the seven
# overrides in ``reform_revert.json`` and ``ga_tax_calc.reforms``.
# Period notes:
# - Flat rate / SD / dependent exemption revert from TY 2026 forward
#   (HB463 set these effective TY 2026).
# - Overtime / tip exclusions self-repeal end of TY 2028, so the
#   revert is only applied for TY 2026-2028.
# - The retirement-exclusion bump (older cap $65k -> $70k) takes
#   effect TY 2027, so the revert applies from TY 2027 forward.
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


@app.function(
    image=image,
    memory=16384,  # 16GB is plenty for a single-state dataset
    timeout=1800,
    retries=1,
)
def calculate_year(year: int) -> dict:
    """Calculate Georgia-wide HB463 impact for a single year on Modal."""
    import re

    import numpy as np
    from policyengine_us import Microsimulation
    from policyengine_core.reforms import Reform
    from policyengine_core.periods import instant

    print(f"Starting calculation for year {year}...")

    intra_bounds = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
    intra_labels = [
        "Lose more than 5%",
        "Lose less than 5%",
        "No change",
        "Gain less than 5%",
        "Gain more than 5%",
    ]

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

    print("  Creating baseline (pre-HB463 parameters) simulation on GA dataset...")
    sim_baseline = Microsimulation(dataset=GA_DATASET, reform=reform)
    print("  Creating reform (current-law) simulation on GA dataset...")
    sim_reform = Microsimulation(dataset=GA_DATASET)

    # ===== FISCAL IMPACT =====
    print("  Calculating fiscal impact...")
    fed_baseline = sim_baseline.calculate("income_tax", period=year, map_to="household")
    fed_reform = sim_reform.calculate("income_tax", period=year, map_to="household")
    federal_tax_revenue_impact = float((fed_reform - fed_baseline).sum())

    ga_baseline = sim_baseline.calculate("ga_income_tax", period=year, map_to="household")
    ga_reform = sim_reform.calculate("ga_income_tax", period=year, map_to="household")
    state_tax_revenue_impact = float((ga_reform - ga_baseline).sum())

    tax_revenue_impact = federal_tax_revenue_impact + state_tax_revenue_impact
    budgetary_impact = tax_revenue_impact

    baseline_net_income = sim_baseline.calculate("household_net_income", period=year, map_to="household")
    reform_net_income = sim_reform.calculate("household_net_income", period=year, map_to="household")
    income_change = reform_net_income - baseline_net_income  # current_law - pre_hb463
    change_arr = np.array(income_change)
    baseline_net_income_arr = np.array(baseline_net_income)
    household_weight = sim_reform.calculate("household_weight", period=year)
    weight_arr = np.array(household_weight)

    total_households = float(weight_arr.sum())

    # ===== WINNERS / LOSERS =====
    print("  Calculating winners/losers...")
    winners = float(weight_arr[change_arr > 1].sum())
    losers = float(weight_arr[change_arr < -1].sum())
    beneficiary_mask = change_arr > 0
    beneficiaries = float(weight_arr[beneficiary_mask].sum())
    avg_benefit = (
        float(
            (change_arr[beneficiary_mask] * weight_arr[beneficiary_mask]).sum()
            / beneficiaries
        )
        if beneficiaries > 0
        else 0.0
    )

    winners_rate = winners / total_households * 100 if total_households else 0.0
    losers_rate = losers / total_households * 100 if total_households else 0.0

    # ===== INCOME DECILE ANALYSIS =====
    print("  Calculating decile analysis...")
    decile = sim_baseline.calculate("household_income_decile", period=year, map_to="household")

    decile_average = {}
    decile_relative = {}
    for d in range(1, 11):
        dmask = decile == d
        d_weight = weight_arr[dmask]
        d_count = float(d_weight.sum())
        if d_count > 0:
            d_baseline_sum = float(
                (baseline_net_income_arr[dmask] * d_weight).sum()
            )
            d_change_sum = float((change_arr[dmask] * d_weight).sum())
            decile_average[str(d)] = d_change_sum / d_count
            decile_relative[str(d)] = d_change_sum / d_baseline_sum if d_baseline_sum != 0 else 0.0
        else:
            decile_average[str(d)] = 0.0
            decile_relative[str(d)] = 0.0

    # Intra-decile
    people_per_hh = sim_baseline.calculate("household_count_people", period=year, map_to="household")
    capped_baseline = np.maximum(baseline_net_income_arr, 1)
    rel_change_arr = change_arr / capped_baseline

    decile_arr = np.array(decile)
    people_weighted = np.array(people_per_hh) * weight_arr

    intra_decile_deciles = {label: [] for label in intra_labels}
    for d in range(1, 11):
        dmask = decile_arr == d
        d_people = people_weighted[dmask]
        d_total_people = d_people.sum()
        d_rel = rel_change_arr[dmask]

        for lower, upper, label in zip(intra_bounds[:-1], intra_bounds[1:], intra_labels):
            in_group = (d_rel > lower) & (d_rel <= upper)
            proportion = float(d_people[in_group].sum() / d_total_people) if d_total_people > 0 else 0.0
            intra_decile_deciles[label].append(proportion)

    intra_decile_all = {label: sum(intra_decile_deciles[label]) / 10 for label in intra_labels}

    # ===== POVERTY IMPACT =====
    print("  Calculating poverty impact...")
    pov_bl = sim_baseline.calculate("in_poverty", period=year, map_to="person")
    pov_rf = sim_reform.calculate("in_poverty", period=year, map_to="person")
    poverty_baseline_rate = float(pov_bl.mean() * 100)
    poverty_reform_rate = float(pov_rf.mean() * 100)
    poverty_rate_change = poverty_baseline_rate - poverty_reform_rate
    poverty_percent_change = poverty_rate_change / poverty_reform_rate * 100 if poverty_reform_rate > 0 else 0.0

    age_arr = np.array(sim_baseline.calculate("age", period=year))
    is_child = age_arr < 18
    pw_arr = np.array(sim_baseline.calculate("person_weight", period=year))
    child_w = pw_arr[is_child]
    total_child_w = child_w.sum()

    pov_bl_arr = np.array(pov_bl).astype(bool)
    pov_rf_arr = np.array(pov_rf).astype(bool)

    def _child_rate(arr):
        return float((arr[is_child] * child_w).sum() / total_child_w * 100) if total_child_w > 0 else 0.0

    child_poverty_baseline_rate = _child_rate(pov_bl_arr)
    child_poverty_reform_rate = _child_rate(pov_rf_arr)
    child_poverty_rate_change = child_poverty_baseline_rate - child_poverty_reform_rate
    child_poverty_percent_change = (
        child_poverty_rate_change / child_poverty_reform_rate * 100
        if child_poverty_reform_rate > 0
        else 0.0
    )

    deep_bl = sim_baseline.calculate("in_deep_poverty", period=year, map_to="person")
    deep_rf = sim_reform.calculate("in_deep_poverty", period=year, map_to="person")
    deep_poverty_baseline_rate = float(deep_bl.mean() * 100)
    deep_poverty_reform_rate = float(deep_rf.mean() * 100)
    deep_poverty_rate_change = deep_poverty_baseline_rate - deep_poverty_reform_rate
    deep_poverty_percent_change = (
        deep_poverty_rate_change / deep_poverty_reform_rate * 100
        if deep_poverty_reform_rate > 0
        else 0.0
    )

    deep_bl_arr = np.array(deep_bl).astype(bool)
    deep_rf_arr = np.array(deep_rf).astype(bool)
    deep_child_poverty_baseline_rate = _child_rate(deep_bl_arr)
    deep_child_poverty_reform_rate = _child_rate(deep_rf_arr)
    deep_child_poverty_rate_change = deep_child_poverty_baseline_rate - deep_child_poverty_reform_rate
    deep_child_poverty_percent_change = (
        deep_child_poverty_rate_change / deep_child_poverty_reform_rate * 100
        if deep_child_poverty_reform_rate > 0
        else 0.0
    )

    # ===== INCOME BRACKET BREAKDOWN =====
    print("  Calculating income brackets...")
    agi = sim_baseline.calculate("adjusted_gross_income", period=year, map_to="household")
    agi_arr = np.array(agi)
    beneficiary_mask = change_arr > 0

    income_brackets = [
        (0, 25_000, "$0 - $25k"),
        (25_000, 50_000, "$25k - $50k"),
        (50_000, 75_000, "$50k - $75k"),
        (75_000, 100_000, "$75k - $100k"),
        (100_000, 150_000, "$100k - $150k"),
        (150_000, 200_000, "$150k - $200k"),
        (200_000, float("inf"), "$200k+"),
    ]

    by_income_bracket = []
    for min_inc, max_inc, label in income_brackets:
        mask = (agi_arr >= min_inc) & (agi_arr < max_inc) & beneficiary_mask
        bracket_beneficiaries = float(weight_arr[mask].sum())
        if bracket_beneficiaries > 0:
            bracket_cost = float((change_arr[mask] * weight_arr[mask]).sum())
            bracket_avg = float(np.average(change_arr[mask], weights=weight_arr[mask]))
        else:
            bracket_cost = 0.0
            bracket_avg = 0.0
        by_income_bracket.append({
            "bracket": label,
            "beneficiaries": bracket_beneficiaries,
            "total_cost": bracket_cost,
            "avg_benefit": bracket_avg,
        })

    print(f"  Year {year} complete!")

    return {
        "year": year,
        "budget": {
            "budgetary_impact": budgetary_impact,
            "federal_tax_revenue_impact": federal_tax_revenue_impact,
            "state_tax_revenue_impact": state_tax_revenue_impact,
            "tax_revenue_impact": tax_revenue_impact,
            "households": total_households,
        },
        "decile": {"average": decile_average, "relative": decile_relative},
        "intra_decile": {"all": intra_decile_all, "deciles": intra_decile_deciles},
        "total_cost": -budgetary_impact,
        "beneficiaries": beneficiaries,
        "avg_benefit": avg_benefit,
        "winners": winners,
        "losers": losers,
        "winners_rate": winners_rate,
        "losers_rate": losers_rate,
        "poverty_baseline_rate": poverty_baseline_rate,
        "poverty_reform_rate": poverty_reform_rate,
        "poverty_rate_change": poverty_rate_change,
        "poverty_percent_change": poverty_percent_change,
        "child_poverty_baseline_rate": child_poverty_baseline_rate,
        "child_poverty_reform_rate": child_poverty_reform_rate,
        "child_poverty_rate_change": child_poverty_rate_change,
        "child_poverty_percent_change": child_poverty_percent_change,
        "deep_poverty_baseline_rate": deep_poverty_baseline_rate,
        "deep_poverty_reform_rate": deep_poverty_reform_rate,
        "deep_poverty_rate_change": deep_poverty_rate_change,
        "deep_poverty_percent_change": deep_poverty_percent_change,
        "deep_child_poverty_baseline_rate": deep_child_poverty_baseline_rate,
        "deep_child_poverty_reform_rate": deep_child_poverty_reform_rate,
        "deep_child_poverty_rate_change": deep_child_poverty_rate_change,
        "deep_child_poverty_percent_change": deep_child_poverty_percent_change,
        "by_income_bracket": by_income_bracket,
    }


@app.local_entrypoint()
def main(years: str = ""):
    """Run the pipeline on Modal and save CSVs locally.

    Args:
        years: Comma-separated list of years to run. If empty, runs
               the default set (2026, 2027, 2028).
    """
    import pandas as pd

    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    if years:
        target_years = [int(y.strip()) for y in years.split(",")]
    else:
        target_years = YEARS

    print(f"Running Georgia HB463 microsimulation for years {target_years} on Modal...")
    print(f"Dataset: {GA_DATASET}")
    print(f"Output directory: {output_dir}")

    results = list(calculate_year.map(target_years))
    results.sort(key=lambda r: r["year"])

    distributional_rows = []
    metrics_rows = []
    winners_losers_rows = []
    income_bracket_rows = []

    for result in results:
        year = result["year"]

        for decile, avg in result["decile"]["average"].items():
            distributional_rows.append({
                "year": year,
                "decile": decile,
                "average_change": round(avg, 2),
                "relative_change": round(result["decile"]["relative"][decile], 6),
            })

        metrics = [
            ("budgetary_impact", result["budget"]["budgetary_impact"]),
            ("federal_tax_revenue_impact", result["budget"]["federal_tax_revenue_impact"]),
            ("state_tax_revenue_impact", result["budget"]["state_tax_revenue_impact"]),
            ("tax_revenue_impact", result["budget"]["tax_revenue_impact"]),
            ("households", result["budget"]["households"]),
            ("total_cost", result["total_cost"]),
            ("beneficiaries", result["beneficiaries"]),
            ("avg_benefit", result["avg_benefit"]),
            ("winners", result["winners"]),
            ("losers", result["losers"]),
            ("winners_rate", result["winners_rate"]),
            ("losers_rate", result["losers_rate"]),
            ("poverty_baseline_rate", result["poverty_baseline_rate"]),
            ("poverty_reform_rate", result["poverty_reform_rate"]),
            ("poverty_rate_change", result["poverty_rate_change"]),
            ("poverty_percent_change", result["poverty_percent_change"]),
            ("child_poverty_baseline_rate", result["child_poverty_baseline_rate"]),
            ("child_poverty_reform_rate", result["child_poverty_reform_rate"]),
            ("child_poverty_rate_change", result["child_poverty_rate_change"]),
            ("child_poverty_percent_change", result["child_poverty_percent_change"]),
            ("deep_poverty_baseline_rate", result["deep_poverty_baseline_rate"]),
            ("deep_poverty_reform_rate", result["deep_poverty_reform_rate"]),
            ("deep_poverty_rate_change", result["deep_poverty_rate_change"]),
            ("deep_poverty_percent_change", result["deep_poverty_percent_change"]),
            ("deep_child_poverty_baseline_rate", result["deep_child_poverty_baseline_rate"]),
            ("deep_child_poverty_reform_rate", result["deep_child_poverty_reform_rate"]),
            ("deep_child_poverty_rate_change", result["deep_child_poverty_rate_change"]),
            ("deep_child_poverty_percent_change", result["deep_child_poverty_percent_change"]),
        ]
        for metric, value in metrics:
            metrics_rows.append({"year": year, "metric": metric, "value": value})

        intra = result["intra_decile"]
        winners_losers_rows.append({
            "year": year,
            "decile": "All",
            "gain_more_5pct": intra["all"]["Gain more than 5%"],
            "gain_less_5pct": intra["all"]["Gain less than 5%"],
            "no_change": intra["all"]["No change"],
            "lose_less_5pct": intra["all"]["Lose less than 5%"],
            "lose_more_5pct": intra["all"]["Lose more than 5%"],
        })
        for i in range(10):
            winners_losers_rows.append({
                "year": year,
                "decile": str(i + 1),
                "gain_more_5pct": intra["deciles"]["Gain more than 5%"][i],
                "gain_less_5pct": intra["deciles"]["Gain less than 5%"][i],
                "no_change": intra["deciles"]["No change"][i],
                "lose_less_5pct": intra["deciles"]["Lose less than 5%"][i],
                "lose_more_5pct": intra["deciles"]["Lose more than 5%"][i],
            })

        for b in result["by_income_bracket"]:
            income_bracket_rows.append({
                "year": year,
                "bracket": b["bracket"],
                "beneficiaries": b["beneficiaries"],
                "total_cost": b["total_cost"],
                "avg_benefit": b["avg_benefit"],
            })

    BRACKET_ORDER = ["$0 - $25k", "$25k - $50k", "$50k - $75k", "$75k - $100k",
                     "$100k - $150k", "$150k - $200k", "$200k+"]
    DECILE_ORDER = ["All"] + [str(i) for i in range(1, 11)]

    def merge_and_save(new_rows: list, filename: str, years_to_replace: list):
        filepath = os.path.join(output_dir, filename)
        new_df = pd.DataFrame(new_rows)

        if os.path.exists(filepath) and len(years_to_replace) < len(YEARS):
            existing_df = pd.read_csv(filepath)
            existing_df = existing_df[~existing_df["year"].isin(years_to_replace)]
            combined_df = pd.concat([existing_df, new_df], ignore_index=True)
        else:
            combined_df = new_df

        if "bracket" in combined_df.columns:
            combined_df["_sort"] = combined_df["bracket"].map(
                {b: i for i, b in enumerate(BRACKET_ORDER)}
            )
            combined_df = combined_df.sort_values(["year", "_sort"]).drop(columns=["_sort"])
        elif "decile" in combined_df.columns:
            combined_df["_sort"] = combined_df["decile"].astype(str).map(
                {d: i for i, d in enumerate(DECILE_ORDER)}
            )
            combined_df = combined_df.sort_values(["year", "_sort"]).drop(columns=["_sort"])
        else:
            combined_df = combined_df.sort_values("year")

        combined_df = combined_df.reset_index(drop=True)
        combined_df.to_csv(filepath, index=False)
        print(f"Saved: {filepath}")

    merge_and_save(distributional_rows, f"distributional_impact_{VARIANT}.csv", target_years)
    merge_and_save(metrics_rows, f"metrics_{VARIANT}.csv", target_years)
    merge_and_save(winners_losers_rows, f"winners_losers_{VARIANT}.csv", target_years)
    merge_and_save(income_bracket_rows, f"income_brackets_{VARIANT}.csv", target_years)

    print(f"\nDone! All data saved to {output_dir}/")
