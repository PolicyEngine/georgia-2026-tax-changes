/**
 * Household impact via the PolicyEngine API.
 *
 * Calls https://api.policyengine.org/us/calculate directly - no backend
 * server required.
 *
 * The PolicyEngine baseline already includes H.4216 (Act 110), so
 * `current_law` is computed without a reform and `pre_2026` is computed
 * with the inverse reform that reverts SC parameters to their 2025
 * values. The displayed impact equals:
 *
 *   impact = current_law - pre_2026
 */

import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildHouseholdSituation,
  buildReformPolicy,
  interpolate,
} from "./household";

const PE_API_URL = "https://api.policyengine.org";

class ApiError extends Error {
  status: number;
  response: unknown;
  constructor(message: string, status: number, response?: unknown) {
    super(message);
    this.status = status;
    this.response = response;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 120000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

interface PEApiResponse {
  result: {
    households: Record<string, Record<string, Record<string, number[]>>>;
    people: Record<string, Record<string, Record<string, number[]>>>;
    tax_units: Record<string, Record<string, Record<string, number[]>>>;
  };
}

async function peCalculate(body: Record<string, unknown>): Promise<PEApiResponse> {
  const response = await fetchWithTimeout(
    `${PE_API_URL}/us/calculate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    const errorMessage = typeof errorBody === 'object' && errorBody?.message
      ? errorBody.message
      : typeof errorBody === 'string'
        ? errorBody
        : JSON.stringify(errorBody);
    throw new ApiError(
      `PolicyEngine API error: ${response.status} - ${errorMessage}`,
      response.status,
      errorBody
    );
  }
  return response.json();
}

export const api = {
  async calculateHouseholdImpact(
    request: HouseholdRequest
  ): Promise<HouseholdImpactResponse> {
    const household = buildHouseholdSituation(request);
    const policy = buildReformPolicy();
    const yearStr = String(request.year);

    // currentLaw is the unmodified PE-US baseline (already includes
    // H.4216). pre2026 applies the inverse reform.
    const [currentLawResult, pre2026Result] = await Promise.all([
      peCalculate({ household }),
      peCalculate({ household, policy }),
    ]);

    const currentLawNetIncome: number[] =
      currentLawResult.result.households["your household"][
        "household_net_income"
      ][yearStr];
    const pre2026NetIncome: number[] =
      pre2026Result.result.households["your household"][
        "household_net_income"
      ][yearStr];
    const incomeRange: number[] =
      currentLawResult.result.people["you"][
        "employment_income"
      ][yearStr];

    const currentLawStateTax: number[] =
      currentLawResult.result.tax_units["your tax unit"]["sc_income_tax"][
        yearStr
      ];
    const pre2026StateTax: number[] =
      pre2026Result.result.tax_units["your tax unit"]["sc_income_tax"][
        yearStr
      ];

    const currentLawFederalTax: number[] =
      currentLawResult.result.tax_units["your tax unit"]["income_tax"][yearStr];
    const pre2026FederalTax: number[] =
      pre2026Result.result.tax_units["your tax unit"]["income_tax"][yearStr];

    // Impact = current_law - pre_2026.
    const netIncomeChange = currentLawNetIncome.map(
      (val, i) => val - pre2026NetIncome[i]
    );
    const federalTaxChange = currentLawFederalTax.map(
      (val, i) => val - pre2026FederalTax[i]
    );
    const stateTaxChange = currentLawStateTax.map(
      (val, i) => val - pre2026StateTax[i]
    );

    const currentLawAtIncome = interpolate(
      incomeRange,
      currentLawNetIncome,
      request.income
    );
    const pre2026AtIncome = interpolate(
      incomeRange,
      pre2026NetIncome,
      request.income
    );
    const currentLawFederalTaxAtIncome = interpolate(
      incomeRange,
      currentLawFederalTax,
      request.income
    );
    const pre2026FederalTaxAtIncome = interpolate(
      incomeRange,
      pre2026FederalTax,
      request.income
    );
    const currentLawStateTaxAtIncome = interpolate(
      incomeRange,
      currentLawStateTax,
      request.income
    );
    const pre2026StateTaxAtIncome = interpolate(
      incomeRange,
      pre2026StateTax,
      request.income
    );

    const federalTaxChangeAtIncome =
      currentLawFederalTaxAtIncome - pre2026FederalTaxAtIncome;
    const stateTaxChangeAtIncome =
      currentLawStateTaxAtIncome - pre2026StateTaxAtIncome;
    const netIncomeChangeAtIncome = currentLawAtIncome - pre2026AtIncome;

    return {
      income_range: incomeRange,
      net_income_change: netIncomeChange,
      federalTaxChange,
      stateTaxChange,
      netIncomeChange,
      benefit_at_income: {
        baseline: pre2026AtIncome,
        reform: currentLawAtIncome,
        difference: netIncomeChangeAtIncome,
        federal_tax_change: federalTaxChangeAtIncome,
        state_tax_change: stateTaxChangeAtIncome,
        net_income_change: netIncomeChangeAtIncome,
      },
      x_axis_max: request.max_earnings,
    };
  },
};
