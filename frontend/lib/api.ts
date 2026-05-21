/**
 * Household impact via the PolicyEngine API.
 *
 * Calls https://api.policyengine.org/us/calculate directly - no backend
 * server required.
 *
 * The PolicyEngine baseline already includes HB463 (the 2026 Georgia
 * tax-changes act), so `current_law` is computed without a reform and
 * `pre_hb463` is computed with the inverse reform that reverts Georgia
 * parameters to their pre-HB463 values. The displayed impact equals:
 *
 *   impact = current_law - pre_hb463
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
    // HB463). preHb463 applies the inverse reform.
    const [currentLawResult, preHb463Result] = await Promise.all([
      peCalculate({ household }),
      peCalculate({ household, policy }),
    ]);

    const currentLawNetIncome: number[] =
      currentLawResult.result.households["your household"][
        "household_net_income"
      ][yearStr];
    const preHb463NetIncome: number[] =
      preHb463Result.result.households["your household"][
        "household_net_income"
      ][yearStr];
    const incomeRange: number[] =
      currentLawResult.result.people["you"][
        "employment_income"
      ][yearStr];

    const currentLawStateTax: number[] =
      currentLawResult.result.tax_units["your tax unit"]["ga_income_tax"][
        yearStr
      ];
    const preHb463StateTax: number[] =
      preHb463Result.result.tax_units["your tax unit"]["ga_income_tax"][
        yearStr
      ];

    const currentLawFederalTax: number[] =
      currentLawResult.result.tax_units["your tax unit"]["income_tax"][yearStr];
    const preHb463FederalTax: number[] =
      preHb463Result.result.tax_units["your tax unit"]["income_tax"][yearStr];

    // Impact = current_law - pre_hb463.
    const netIncomeChange = currentLawNetIncome.map(
      (val, i) => val - preHb463NetIncome[i]
    );
    const federalTaxChange = currentLawFederalTax.map(
      (val, i) => val - preHb463FederalTax[i]
    );
    const stateTaxChange = currentLawStateTax.map(
      (val, i) => val - preHb463StateTax[i]
    );

    const currentLawAtIncome = interpolate(
      incomeRange,
      currentLawNetIncome,
      request.income
    );
    const preHb463AtIncome = interpolate(
      incomeRange,
      preHb463NetIncome,
      request.income
    );
    const currentLawFederalTaxAtIncome = interpolate(
      incomeRange,
      currentLawFederalTax,
      request.income
    );
    const preHb463FederalTaxAtIncome = interpolate(
      incomeRange,
      preHb463FederalTax,
      request.income
    );
    const currentLawStateTaxAtIncome = interpolate(
      incomeRange,
      currentLawStateTax,
      request.income
    );
    const preHb463StateTaxAtIncome = interpolate(
      incomeRange,
      preHb463StateTax,
      request.income
    );

    const federalTaxChangeAtIncome =
      currentLawFederalTaxAtIncome - preHb463FederalTaxAtIncome;
    const stateTaxChangeAtIncome =
      currentLawStateTaxAtIncome - preHb463StateTaxAtIncome;
    const netIncomeChangeAtIncome = currentLawAtIncome - preHb463AtIncome;

    return {
      income_range: incomeRange,
      net_income_change: netIncomeChange,
      federalTaxChange,
      stateTaxChange,
      netIncomeChange,
      benefit_at_income: {
        baseline: preHb463AtIncome,
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
