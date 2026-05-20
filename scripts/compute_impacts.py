"""
Compute South Carolina-wide impacts for the 2026 SC tax changes.
Outputs CSV files for the dashboard.

Uses the ga_tax_calc module which loads the pre-2026-values inverse reform
and runs Microsimulation against the South Carolina state dataset.
"""

import sys
import os

# Add parent directory to path so we can import ga_tax_calc
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from ga_tax_calc.microsimulation import calculate_aggregate_impact

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "public", "data"
)

# Only 2026 is meaningful for the South Carolina 2026 tax changes.
YEARS = [2026]


def results_to_csvs(results: dict, year: int):
    """Convert the results dict into per-CSV row lists."""

    metrics = [
        {"year": year, "metric": "budgetary_impact", "value": round(results["budget"]["budgetary_impact"], 0)},
        {"year": year, "metric": "federal_tax_revenue_impact", "value": round(results["budget"]["federal_tax_revenue_impact"], 0)},
        {"year": year, "metric": "state_tax_revenue_impact", "value": round(results["budget"]["state_tax_revenue_impact"], 0)},
        {"year": year, "metric": "tax_revenue_impact", "value": round(results["budget"]["tax_revenue_impact"], 0)},
        {"year": year, "metric": "households", "value": int(results["budget"]["households"])},
        {"year": year, "metric": "total_cost", "value": round(results["total_cost"], 0)},
        {"year": year, "metric": "beneficiaries", "value": int(results["beneficiaries"])},
        {"year": year, "metric": "avg_benefit", "value": round(results["avg_benefit"], 2)},
        {"year": year, "metric": "winners", "value": int(results["winners"])},
        {"year": year, "metric": "losers", "value": int(results["losers"])},
        {"year": year, "metric": "winners_rate", "value": round(results["winners_rate"], 4)},
        {"year": year, "metric": "losers_rate", "value": round(results["losers_rate"], 6)},
        {"year": year, "metric": "poverty_baseline_rate", "value": round(results["poverty_baseline_rate"], 4)},
        {"year": year, "metric": "poverty_reform_rate", "value": round(results["poverty_reform_rate"], 4)},
        {"year": year, "metric": "poverty_rate_change", "value": round(results["poverty_rate_change"], 4)},
        {"year": year, "metric": "poverty_percent_change", "value": round(results["poverty_percent_change"], 2)},
        {"year": year, "metric": "child_poverty_baseline_rate", "value": round(results["child_poverty_baseline_rate"], 4)},
        {"year": year, "metric": "child_poverty_reform_rate", "value": round(results["child_poverty_reform_rate"], 4)},
        {"year": year, "metric": "child_poverty_rate_change", "value": round(results["child_poverty_rate_change"], 4)},
        {"year": year, "metric": "child_poverty_percent_change", "value": round(results["child_poverty_percent_change"], 2)},
        {"year": year, "metric": "deep_poverty_baseline_rate", "value": round(results["deep_poverty_baseline_rate"], 4)},
        {"year": year, "metric": "deep_poverty_reform_rate", "value": round(results["deep_poverty_reform_rate"], 4)},
        {"year": year, "metric": "deep_poverty_rate_change", "value": round(results["deep_poverty_rate_change"], 4)},
        {"year": year, "metric": "deep_poverty_percent_change", "value": round(results["deep_poverty_percent_change"], 2)},
        {"year": year, "metric": "deep_child_poverty_baseline_rate", "value": round(results["deep_child_poverty_baseline_rate"], 4)},
        {"year": year, "metric": "deep_child_poverty_reform_rate", "value": round(results["deep_child_poverty_reform_rate"], 4)},
        {"year": year, "metric": "deep_child_poverty_rate_change", "value": round(results["deep_child_poverty_rate_change"], 4)},
        {"year": year, "metric": "deep_child_poverty_percent_change", "value": round(results["deep_child_poverty_percent_change"], 2)},
    ]

    # Distributional (by decile)
    distributional = []
    for decile_str, avg_change in results["decile"]["average"].items():
        rel_change = results["decile"]["relative"].get(decile_str, 0)
        distributional.append({
            "year": year,
            "decile": int(decile_str),
            "average_change": round(avg_change, 2),
            "relative_change": round(rel_change, 6),
        })

    # Winners / losers
    winners_losers = []
    intra = results["intra_decile"]
    winners_losers.append({
        "year": year,
        "decile": "All",
        "gain_more_5pct": round(intra["all"]["Gain more than 5%"], 4),
        "gain_less_5pct": round(intra["all"]["Gain less than 5%"], 4),
        "no_change": round(intra["all"]["No change"], 4),
        "lose_less_5pct": round(intra["all"]["Lose less than 5%"], 4),
        "lose_more_5pct": round(intra["all"]["Lose more than 5%"], 4),
    })

    for i in range(10):
        winners_losers.append({
            "year": year,
            "decile": i + 1,
            "gain_more_5pct": round(intra["deciles"]["Gain more than 5%"][i], 4),
            "gain_less_5pct": round(intra["deciles"]["Gain less than 5%"][i], 4),
            "no_change": round(intra["deciles"]["No change"][i], 4),
            "lose_less_5pct": round(intra["deciles"]["Lose less than 5%"][i], 4),
            "lose_more_5pct": round(intra["deciles"]["Lose more than 5%"][i], 4),
        })

    # Income brackets
    income_brackets = []
    for bracket in results["by_income_bracket"]:
        income_brackets.append({
            "year": year,
            "bracket": bracket["bracket"],
            "beneficiaries": int(bracket["beneficiaries"]),
            "total_cost": round(bracket["total_cost"], 0),
            "avg_benefit": round(bracket["avg_benefit"], 2),
        })

    return metrics, distributional, winners_losers, income_brackets


def main():
    all_metrics = []
    all_distributional = []
    all_winners_losers = []
    all_income_brackets = []

    for year in YEARS:
        try:
            results = calculate_aggregate_impact(year=year)
            metrics, distributional, winners_losers, income_brackets = results_to_csvs(results, year)
            all_metrics.extend(metrics)
            all_distributional.extend(distributional)
            all_winners_losers.extend(winners_losers)
            all_income_brackets.extend(income_brackets)
            print(f"  Year {year} complete")
        except Exception as e:
            print(f"  Error for year {year}: {e}")
            import traceback
            traceback.print_exc()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    pd.DataFrame(all_metrics).to_csv(f"{OUTPUT_DIR}/metrics_revert.csv", index=False)
    pd.DataFrame(all_distributional).to_csv(f"{OUTPUT_DIR}/distributional_impact_revert.csv", index=False)
    pd.DataFrame(all_winners_losers).to_csv(f"{OUTPUT_DIR}/winners_losers_revert.csv", index=False)
    pd.DataFrame(all_income_brackets).to_csv(f"{OUTPUT_DIR}/income_brackets_revert.csv", index=False)

    print(f"\nCSV files written to {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
