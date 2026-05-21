"""Data generation pipeline for the Georgia 2026 tax changes (HB463) dashboard.

Runs the ga_tax_calc microsimulation for tax years 2026-2028 against
the Georgia state dataset and saves output to frontend/public/data/
as CSVs.

Uses subprocess isolation per year to prevent memory accumulation
(kept from the upstream template even though only one year is run).

Usage:
    python scripts/pipeline.py
"""

import json
import os
import subprocess
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Default output directory — Next.js serves files from public/
DEFAULT_OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend",
    "public",
    "data",
)

# Statewide aggregates ship TY 2026 (rate cut + SD + dep exemption +
# overtime/tip exclusions) and TY 2027 (adds the retirement-exclusion
# bump). TY 2028 isn't surfaced statewide; districts run the full
# 2026-2028 window separately.
YEARS = [2026, 2027]


def _save_csv(df: pd.DataFrame, path: str) -> None:
    """Save DataFrame to CSV, creating parent directories if needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False)
    print(f"Saved: {path}")


def _extract_distributional(result: dict, year: int) -> list[dict]:
    """Extract distributional impact rows from aggregate result."""
    rows = []
    for decile, avg in result["decile"]["average"].items():
        rows.append({
            "year": year,
            "decile": decile,
            "average_change": round(avg, 2),
            "relative_change": round(result["decile"]["relative"][decile], 6),
        })
    return rows


def _extract_metrics(result: dict, year: int) -> list[dict]:
    """Extract flat metrics into rows."""
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
    return [{"year": year, "metric": k, "value": v} for k, v in metrics]


def _extract_winners_losers(result: dict, year: int) -> list[dict]:
    """Extract intra-decile winners/losers data."""
    intra = result["intra_decile"]
    rows = []

    # "All" row
    rows.append({
        "year": year,
        "decile": "All",
        "gain_more_5pct": intra["all"]["Gain more than 5%"],
        "gain_less_5pct": intra["all"]["Gain less than 5%"],
        "no_change": intra["all"]["No change"],
        "lose_less_5pct": intra["all"]["Lose less than 5%"],
        "lose_more_5pct": intra["all"]["Lose more than 5%"],
    })

    # Per-decile rows
    for i in range(10):
        rows.append({
            "year": year,
            "decile": str(i + 1),
            "gain_more_5pct": intra["deciles"]["Gain more than 5%"][i],
            "gain_less_5pct": intra["deciles"]["Gain less than 5%"][i],
            "no_change": intra["deciles"]["No change"][i],
            "lose_less_5pct": intra["deciles"]["Lose less than 5%"][i],
            "lose_more_5pct": intra["deciles"]["Lose more than 5%"][i],
        })

    return rows


def _extract_income_brackets(result: dict, year: int) -> list[dict]:
    """Extract income bracket breakdown."""
    return [
        {
            "year": year,
            "bracket": b["bracket"],
            "beneficiaries": b["beneficiaries"],
            "total_cost": b["total_cost"],
            "avg_benefit": b["avg_benefit"],
        }
        for b in result["by_income_bracket"]
    ]


def _run_year_subprocess(year: int) -> dict:
    """Run one year in a subprocess to isolate memory."""
    worker_script = os.path.join(os.path.dirname(__file__), "_pipeline_worker.py")
    proc = subprocess.run(
        [sys.executable, "-u", worker_script, str(year)],
        capture_output=False,
        stderr=None,  # inherit stderr so progress shows in real-time
        stdout=subprocess.PIPE,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Worker failed for year {year}")
    return json.loads(proc.stdout)


def _load_existing_csv(path: str) -> pd.DataFrame:
    """Load existing CSV or return empty DataFrame."""
    if os.path.exists(path):
        try:
            df = pd.read_csv(path)
            if len(df) > 0:
                return df
        except Exception:
            pass
    return pd.DataFrame()


def _append_and_save(new_rows: list[dict], path: str, year: int) -> None:
    """Append new rows to CSV, removing any existing data for this year."""
    df_existing = _load_existing_csv(path)

    # Remove existing data for this year (in case of re-run)
    if "year" in df_existing.columns and len(df_existing) > 0:
        df_existing = df_existing[df_existing["year"] != year]

    df_new = pd.DataFrame(new_rows)
    df_combined = pd.concat([df_existing, df_new], ignore_index=True)
    df_combined = df_combined.sort_values("year").reset_index(drop=True)
    _save_csv(df_combined, path)


def generate_all_data(output_dir: str = None) -> dict[str, pd.DataFrame]:
    """Generate all dashboard data as CSVs for all configured years.

    Saves incrementally after each year to prevent memory issues.
    """
    output_dir = output_dir or DEFAULT_OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)

    paths = {
        "distributional_impact": os.path.join(output_dir, "distributional_impact_revert.csv"),
        "metrics": os.path.join(output_dir, "metrics_revert.csv"),
        "winners_losers": os.path.join(output_dir, "winners_losers_revert.csv"),
        "income_brackets": os.path.join(output_dir, "income_brackets_revert.csv"),
    }

    # Check which years are already computed
    existing_metrics = _load_existing_csv(paths["metrics"])
    completed_years = set()
    if "year" in existing_metrics.columns:
        completed_years = set(existing_metrics["year"].unique())

    for i, year in enumerate(YEARS):
        if year in completed_years:
            print(f"\n[{i + 1}/{len(YEARS)}] Year {year} - already computed, skipping.")
            continue

        print(f"\n[{i + 1}/{len(YEARS)}] Year {year}...")

        result = _run_year_subprocess(year)

        # Save each dataset incrementally
        _append_and_save(_extract_distributional(result, year), paths["distributional_impact"], year)
        _append_and_save(_extract_metrics(result, year), paths["metrics"], year)
        _append_and_save(_extract_winners_losers(result, year), paths["winners_losers"], year)
        _append_and_save(_extract_income_brackets(result, year), paths["income_brackets"], year)

        print(f"  Year {year} saved.")

    print(f"\nAll data saved to {output_dir}/")

    # Return final DataFrames
    return {name: pd.read_csv(path) for name, path in paths.items()}


if __name__ == "__main__":
    generate_all_data()
