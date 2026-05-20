"""Generate South Carolina congressional-district CSV from state-level results.

South Carolina has seven congressional districts (SC-01..SC-07, state
FIPS 45). This script seeds the district CSV by spreading the
state-level average impact across districts with modest variation —
used as a placeholder before the full Modal district pipeline has been
run.
"""

import os
import random

# South Carolina state-level result (placeholder magnitudes — replace
# with real pipeline output). Positive avg_change because H.4216 (Act
# 110) is on net a tax cut for most filers.
SC_STATE_RESULT = {"avg_change": 95.00, "rel_change": 0.0015}

# South Carolina congressional districts (119th Congress): 7 districts.
SC_STATE = "SC"
SC_DISTRICTS = [1, 2, 3, 4, 5, 6, 7]

YEAR = 2026


def main():
    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    random.seed(42)

    districts = []
    base_change = SC_STATE_RESULT["avg_change"]
    base_rel = SC_STATE_RESULT["rel_change"]

    for d in SC_DISTRICTS:
        # +/- 20% variation around the state average
        variation = 1.0 + random.uniform(-0.2, 0.2)
        district_change = base_change * variation
        district_rel = base_rel * variation
        winners_share = 0.65 + random.uniform(-0.05, 0.05)
        losers_share = 0.02 + random.uniform(-0.01, 0.02)

        district_id = f"{SC_STATE}-{d:02d}"

        districts.append({
            "district": district_id,
            "average_household_income_change": round(district_change, 2),
            "relative_household_income_change": round(district_rel, 6),
            "winners_share": round(winners_share, 4),
            "losers_share": round(max(0.0, losers_share), 4),
            "poverty_pct_change": 0.0,
            "child_poverty_pct_change": 0.0,
            "state": SC_STATE,
            "year": YEAR,
        })

    districts.sort(key=lambda x: x["district"])

    filepath = os.path.join(output_dir, "congressional_districts_revert.csv")
    with open(filepath, "w") as f:
        headers = [
            "district",
            "average_household_income_change",
            "relative_household_income_change",
            "winners_share",
            "losers_share",
            "poverty_pct_change",
            "child_poverty_pct_change",
            "state",
            "year",
        ]
        f.write(",".join(headers) + "\n")
        for d in districts:
            row = [str(d[h]) for h in headers]
            f.write(",".join(row) + "\n")

    print(f"Saved {len(districts)} South Carolina districts to: {filepath}")

    avg_change = sum(d["average_household_income_change"] for d in districts) / len(districts)
    min_change = min(d["average_household_income_change"] for d in districts)
    max_change = max(d["average_household_income_change"] for d in districts)

    print("\nSummary:")
    print(f"  Total districts: {len(districts)}")
    print(f"  Avg income change: ${avg_change:,.2f}")
    print(f"  Min change: ${min_change:,.2f}")
    print(f"  Max change: ${max_change:,.2f}")


if __name__ == "__main__":
    main()
