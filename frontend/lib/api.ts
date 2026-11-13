/**
 * Household impact via www.policyengine.org's dashboard API.
 *
 * The page never calls the PolicyEngine Public API itself: the dashboard
 * API's server adds PolicyEngine's credential and forwards each household
 * to the Public API's /us/calculate.
 *
 * The PolicyEngine baseline already includes HB463 (the 2026 Georgia
 * tax-changes act), so `current_law` is computed without a reform and
 * `pre_hb463` is computed with the inverse reform that reverts Georgia
 * parameters to their pre-HB463 values. The displayed impact equals:
 *
 *   impact = current_law - pre_hb463
 */

import {
  createPolicyEngineApiClient,
  DEFAULT_BASE_URL,
  PolicyEngineApiError,
  RATE_LIMIT_WAIT_MILLISECONDS,
} from "@policyengine/api-client";

import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildHouseholdSituation,
  buildReformPolicy,
  interpolate,
} from "./household";

const policyengine = createPolicyEngineApiClient();

/**
 * How long a household calculation may take before the page gives up on
 * it: 30 s more than the 750 s the dashboard API waits for the Public API's
 * answer (its route runs for at most 800 s), so the dashboard API's own
 * answer, a 504 included, reaches the page first (the
 * policyengine-api-access skill).
 */
const CALCULATION_TIMEOUT_MILLISECONDS = 780_000;

/**
 * Household calculation failures worth one more try. A 502 from the
 * dashboard API, or a 503 from the Public API ("Authentication is
 * unavailable"), may pass on that try. A 503 from the dashboard API itself,
 * whose settings are missing, fails the same way on the one retry and is
 * then shown. A 504 is not retried: the dashboard API has already waited
 * 750 s for the household (the policyengine-api-access skill's errors
 * table).
 */
const RETRYABLE_STATUSES = new Set([502, 503]);

/** The shortest wait before retrying a household calculation. */
const SHORTEST_RETRY_WAIT_MILLISECONDS = 2_000;

/**
 * The longest wait before a retry; a failure whose Retry-After asks for
 * more is shown instead of retried.
 */
const LONGEST_RETRY_WAIT_MILLISECONDS = 60_000;

/**
 * What the page says about the firewall's limit, which everyone behind one
 * address shares.
 */
export const SHARED_LIMIT_EXPLANATION =
  "Everyone on your network, such as a workshop or an office, shares a " +
  "limit on calculations a minute";

const RATE_LIMIT_REFUSAL_MESSAGE = `${SHARED_LIMIT_EXPLANATION}, and it has been reached.`;

/**
 * When the page may send household calculations again after a refusal for
 * the firewall's limit, in `Date.now()` milliseconds. Every household
 * calculation checks it when it is sent.
 */
let householdCalculationsPausedUntil = 0;
const pauseListeners = new Set<() => void>();

/**
 * Stops the page from sending household calculations for `milliseconds`
 * (the firewall's minute unless given); 0 ends a pause.
 */
export function pauseHouseholdCalculations(
  milliseconds: number = RATE_LIMIT_WAIT_MILLISECONDS,
): void {
  householdCalculationsPausedUntil = Date.now() + milliseconds;
  pauseListeners.forEach((listener) => listener());
}

/** Milliseconds until the page may send household calculations again; 0 when it may now. */
export function householdCalculationPauseRemaining(): number {
  return Math.max(0, householdCalculationsPausedUntil - Date.now());
}

/** Calls `listener` whenever a pause starts or is ended early; returns the unsubscribe. */
export function onHouseholdCalculationPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

/**
 * Whether the page is served from the dashboard API's own origin
 * (www.policyengine.org), where the firewall's 429 is readable.
 */
function pageSharesDashboardApiOrigin(): boolean {
  return globalThis.location?.origin === new URL(DEFAULT_BASE_URL).origin;
}

/** A household calculation failed; `message` is written for the user. */
export class HouseholdCalculationError extends Error {
  override name = "HouseholdCalculationError";

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
    /** Whether one more try, after a short wait, could succeed. */
    readonly retryable: boolean,
    /**
     * Whether the firewall's limit may have refused it: a 429, no readable
     * answer on another origin (which is how such a page sees a 429), or a
     * calculation held back during the pause after a refusal.
     */
    readonly rateLimited: boolean = false,
    /**
     * The seconds the dashboard API's answer asked the page to wait before
     * trying again (its Retry-After), or null when it named none.
     */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

/**
 * How long React Query waits before retrying a failed household
 * calculation: the larger of 2 seconds and the failure's Retry-After.
 */
export function householdRetryDelay(
  failureCount: number,
  error: unknown,
): number {
  const retryAfterMilliseconds =
    error instanceof HouseholdCalculationError &&
    error.retryAfterSeconds !== null
      ? error.retryAfterSeconds * 1000
      : 0;
  return Math.max(SHORTEST_RETRY_WAIT_MILLISECONDS, retryAfterMilliseconds);
}

/**
 * Whether React Query should retry a failed household calculation: once,
 * only after a brief gateway failure, and only when the wait before the
 * retry is a minute or less. Each attempt sends two calculations, and the
 * firewall allows 30 a minute.
 */
export function shouldRetryHouseholdCalculation(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 1 &&
    error instanceof HouseholdCalculationError &&
    error.retryable &&
    householdRetryDelay(failureCount, error) <= LONGEST_RETRY_WAIT_MILLISECONDS
  );
}

function dashboardApiMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return null;
}

/** Turns a failure of the dashboard API client into a message for the user. */
function calculationError(error: PolicyEngineApiError): HouseholdCalculationError {
  if (error.status === null) {
    if (pageSharesDashboardApiOrigin()) {
      // The firewall's 429 would be readable here, so this is a network
      // failure.
      return new HouseholdCalculationError(
        "PolicyEngine's calculation service could not be reached. Check " +
          "your connection and try again.",
        null,
        false,
      );
    }
    // On another origin, such as the dashboard's own host, the firewall's
    // 429 has no CORS headers, so the browser reports a network failure.
    // So does the dashboard API's 403 for an origin it does not allow.
    return new HouseholdCalculationError(
      "PolicyEngine's calculation service could not be reached. " +
        `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
      null,
      false,
      true,
    );
  }
  if (error.status === 429) {
    return new HouseholdCalculationError(
      RATE_LIMIT_REFUSAL_MESSAGE,
      429,
      false,
      true,
      error.retryAfterSeconds,
    );
  }
  if (error.status === 504) {
    // The dashboard API has already waited 750 s for the Public API. Its
    // message names that service and gives the reader nothing to do.
    return new HouseholdCalculationError(
      "PolicyEngine's calculation service did not answer in time (HTTP " +
        "504). Try again in a few minutes.",
      504,
      false,
      false,
      error.retryAfterSeconds,
    );
  }
  const detail =
    dashboardApiMessage(error.body) ?? "Try again in a few minutes.";
  return new HouseholdCalculationError(
    `PolicyEngine could not calculate this household (HTTP ${error.status}): ${detail}`,
    error.status,
    RETRYABLE_STATUSES.has(error.status),
    false,
    error.retryAfterSeconds,
  );
}

/** Values over the income axis, keyed by year. */
type ValuesByYear = Record<string, number[]>;

/** The parts of a calculated household this page reads. */
interface CalculatedHousehold {
  people: Record<string, Record<string, ValuesByYear>>;
  households: Record<string, Record<string, ValuesByYear>>;
  tax_units: Record<string, Record<string, ValuesByYear>>;
}

async function calculateHousehold(
  household: Record<string, unknown>,
  policy?: Record<string, unknown>
): Promise<CalculatedHousehold> {
  if (householdCalculationPauseRemaining() > 0) {
    // Held back during the pause after a refusal, so never sent. The pause
    // may have started from a request with no answer, which only may have
    // met the limit.
    throw new HouseholdCalculationError(
      `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
      null,
      false,
      true,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CALCULATION_TIMEOUT_MILLISECONDS
  );
  try {
    return await policyengine.calculateHousehold<CalculatedHousehold>(
      { country: "us", household, policy },
      { signal: controller.signal }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HouseholdCalculationError(
        `The calculation took longer than ${CALCULATION_TIMEOUT_MILLISECONDS / 60_000} minutes. Try again.`,
        null,
        false,
      );
    }
    if (error instanceof PolicyEngineApiError) {
      const failure = calculationError(error);
      if (failure.rateLimited) {
        // Pause at once, even if the household's other calculation has
        // already failed and the caller never sees this refusal.
        pauseHouseholdCalculations();
      }
      throw failure;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
      calculateHousehold(household),
      calculateHousehold(household, policy),
    ]);

    const currentLawNetIncome: number[] =
      currentLawResult.households["your household"][
        "household_net_income"
      ][yearStr];
    const preHb463NetIncome: number[] =
      preHb463Result.households["your household"][
        "household_net_income"
      ][yearStr];
    const incomeRange: number[] =
      currentLawResult.people["you"][
        "employment_income"
      ][yearStr];

    const currentLawStateTax: number[] =
      currentLawResult.tax_units["your tax unit"]["ga_income_tax"][
        yearStr
      ];
    const preHb463StateTax: number[] =
      preHb463Result.tax_units["your tax unit"]["ga_income_tax"][
        yearStr
      ];

    const currentLawFederalTax: number[] =
      currentLawResult.tax_units["your tax unit"]["income_tax"][yearStr];
    const preHb463FederalTax: number[] =
      preHb463Result.tax_units["your tax unit"]["income_tax"][yearStr];

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
