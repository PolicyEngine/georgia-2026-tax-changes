/**
 * Build a PolicyEngine household situation for the PE API.
 *
 * For the Georgia 2026 Tax Changes (HB463) dashboard:
 * - The PolicyEngine baseline represents 2026 Georgia law (HB463 already applied).
 * - The "reform" reverts Georgia parameters to their pre-HB463 values so the
 *   dashboard can measure the impact of HB463 as
 *   (current law baseline) minus (pre-HB463 reform).
 */

import type { HouseholdRequest } from "./types";

const GROUP_UNITS = ["families", "spm_units", "tax_units", "households"] as const;

/**
 * Revert Georgia's HB463 tax parameters to pre-HB463 values.
 * Inline copy of /reform_revert.json so the policy ships with the bundle.
 *
 * Period notes:
 * - Flat rate, standard deduction, dependent exemption revert from 2026
 *   forward (HB463 set permanent levels effective TY 2026).
 * - Overtime / tip exclusions self-repeal end of TY 2028, so the revert
 *   is only applied for TY 2026-2028.
 * - The retirement-exclusion bump (older cap $65,000 -> $70,000) takes
 *   effect TY 2027, so the revert applies from TY 2027 forward.
 */
const REFORM_POLICY: Record<string, Record<string, number | boolean>> = {
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
  const effectiveStateCode = state_code || "GA";
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
        ga_income_tax: { [yearStr]: null },
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
 * Build the Georgia HB463 inverse reform policy dict for the PE API.
 * Reverts Georgia to pre-HB463 values so the dashboard can compute:
 *   impact = current-law baseline - pre-HB463 reform
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
