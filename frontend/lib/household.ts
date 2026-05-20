/**
 * Build a PolicyEngine household situation for the PE API.
 *
 * For the South Carolina 2026 Tax Changes dashboard:
 * - The PolicyEngine baseline represents 2026 SC law (H.4216 / Act 110 already applied).
 * - The "reform" reverts SC parameters to their 2025 (pre-2026) values so the
 *   dashboard can measure the impact of the 2026 changes as
 *   (current law baseline) minus (pre-2026 reform).
 */

import type { HouseholdRequest } from "./types";

const GROUP_UNITS = ["families", "spm_units", "tax_units", "households"] as const;

/**
 * Revert South Carolina's 2026 tax parameters to 2025 values.
 * Inline copy of /reform_revert.json so the policy ships with the bundle.
 */
const REFORM_POLICY: Record<string, Record<string, number | boolean>> = {
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
    "2026-01-01.2100-12-31": false,
  },
  "gov.states.sc.tax.income.credits.eitc.max": {
    "2026-01-01.2100-12-31": 999999999,
  },
};

function addMemberToUnits(
  situation: Record<string, unknown>,
  memberId: string
): void {
  for (const unit of GROUP_UNITS) {
    const unitObj = situation[unit] as Record<string, { members: string[] }>;
    const key = Object.keys(unitObj)[0];
    unitObj[key].members.push(memberId);
  }
}

export function buildHouseholdSituation(
  params: HouseholdRequest
): Record<string, unknown> {
  const {
    age_head,
    age_spouse,
    dependent_ages,
    income,
    year,
    max_earnings,
    state_code,
  } = params;
  const effectiveStateCode = state_code || "SC";
  const yearStr = String(year);
  const axisMax = Math.max(max_earnings, income);

  const situation: Record<string, unknown> = {
    people: {
      you: {
        age: { [yearStr]: age_head },
        employment_income: { [yearStr]: null },
      },
    },
    families: { "your family": { members: ["you"] } },
    marital_units: { "your marital unit": { members: ["you"] } },
    spm_units: { "your household": { members: ["you"] } },
    tax_units: {
      "your tax unit": {
        members: ["you"],
        adjusted_gross_income: { [yearStr]: null },
        income_tax: { [yearStr]: null },
        sc_income_tax: { [yearStr]: null },
      },
    },
    households: {
      "your household": {
        members: ["you"],
        state_code: { [yearStr]: effectiveStateCode },
        household_net_income: { [yearStr]: null },
      },
    },
    axes: [
      [
        {
          name: "employment_income",
          min: 0,
          max: axisMax,
          count: Math.min(4001, Math.max(501, Math.floor(axisMax / 500))),
          period: yearStr,
          target: "person",
        },
      ],
    ],
  };

  if (age_spouse != null) {
    const people = situation.people as Record<string, Record<string, unknown>>;
    people["your partner"] = { age: { [yearStr]: age_spouse } };
    addMemberToUnits(situation, "your partner");
    const maritalUnits = situation.marital_units as Record<string, { members: string[] }>;
    maritalUnits["your marital unit"].members.push("your partner");
  }

  for (let i = 0; i < dependent_ages.length; i++) {
    const childId =
      i === 0
        ? "your first dependent"
        : i === 1
          ? "your second dependent"
          : `dependent_${i + 1}`;

    const people = situation.people as Record<string, Record<string, unknown>>;
    people[childId] = { age: { [yearStr]: dependent_ages[i] } };
    addMemberToUnits(situation, childId);
    const maritalUnits = situation.marital_units as Record<string, { members: string[] }>;
    maritalUnits[`${childId}'s marital unit`] = {
      members: [childId],
    };
  }

  return situation;
}

/**
 * Build the South Carolina 2026 reform policy dict for the PE API.
 * Reverts SC to 2025 values so the dashboard can compute:
 *   impact = current-law baseline - pre-2026 reform
 */
export function buildReformPolicy(): Record<string, Record<string, number | boolean>> {
  return REFORM_POLICY;
}

/**
 * Linear interpolation helper - find the value at `x` in sorted arrays.
 */
export function interpolate(
  xs: number[],
  ys: number[],
  x: number
): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] >= x) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}
