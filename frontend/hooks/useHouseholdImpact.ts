import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  api,
  HouseholdCalculationError,
  RATE_LIMIT_PAUSE_MILLISECONDS,
  shouldRetryHouseholdCalculation,
} from "@/lib/api";
import { HouseholdRequest, HouseholdImpactResponse } from "@/lib/types";

const HOUSEHOLD_IMPACT_KEY = "householdImpact";

function householdImpactQueryKey(request: HouseholdRequest | null) {
  return [HOUSEHOLD_IMPACT_KEY, request];
}

/**
 * When the page may calculate again after a refusal for the firewall's
 * limit, in `Date.now()` milliseconds. Every calculation on the page waits
 * for it, since they share the limit.
 */
let calculationsPausedUntil = 0;
const pauseListeners = new Set<() => void>();

/**
 * Stops the page from sending household calculations for `milliseconds`
 * (a minute unless given); 0 ends a pause.
 */
export function pauseHouseholdCalculations(
  milliseconds: number = RATE_LIMIT_PAUSE_MILLISECONDS
): void {
  calculationsPausedUntil = Date.now() + milliseconds;
  pauseListeners.forEach((listener) => listener());
}

/** Milliseconds until the page may calculate again; 0 when it may now. */
export function householdCalculationPauseRemaining(): number {
  return Math.max(0, calculationsPausedUntil - Date.now());
}

/**
 * Whole seconds until the page may calculate again, 0 when it may now.
 * Counts down once a second during a pause.
 */
export function useHouseholdCalculationPause(): number {
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    Math.ceil(householdCalculationPauseRemaining() / 1000)
  );
  useEffect(() => {
    let countdown: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      const seconds = Math.ceil(householdCalculationPauseRemaining() / 1000);
      setSecondsRemaining(seconds);
      if (seconds > 0 && countdown === undefined) {
        countdown = setInterval(update, 1000);
      } else if (seconds === 0 && countdown !== undefined) {
        clearInterval(countdown);
        countdown = undefined;
      }
    };
    update();
    pauseListeners.add(update);
    return () => {
      pauseListeners.delete(update);
      if (countdown !== undefined) {
        clearInterval(countdown);
      }
    };
  }, []);
  return secondsRemaining;
}

/**
 * Calculates a household's impact, and pauses the page's calculations for
 * a minute when the firewall's limit refuses it.
 */
export async function fetchHouseholdImpact(
  request: HouseholdRequest
): Promise<HouseholdImpactResponse> {
  try {
    return await api.calculateHouseholdImpact(request);
  } catch (error) {
    if (error instanceof HouseholdCalculationError && error.rateLimited) {
      pauseHouseholdCalculations();
    }
    throw error;
  }
}

/**
 * Clears a failed calculation of this household, so that submitting the
 * same household again runs it again instead of showing the stored failure.
 * A calculation that succeeded stays cached.
 */
export function resetFailedHouseholdImpact(
  queryClient: QueryClient,
  request: HouseholdRequest
): Promise<void> {
  const filters = { queryKey: householdImpactQueryKey(request), exact: true };
  // Check the status first: resetQueries applies its filters again when it
  // refetches, and by then the reset query no longer counts as failed.
  if (queryClient.getQueryCache().find(filters)?.state.status !== "error") {
    return Promise.resolve();
  }
  // Resets the query and, while the page shows it, fetches it again.
  return queryClient.resetQueries(filters);
}

/**
 * Submits a household for calculation. Every control that submits one goes
 * through this, so a failed calculation of the same household runs again,
 * while one that succeeded is shown from the cache. Submits nothing, and
 * returns false, while calculations are paused after a refusal for the
 * firewall's limit.
 */
export function submitHouseholdRequest(
  queryClient: QueryClient,
  request: HouseholdRequest,
  setSubmittedRequest: (request: HouseholdRequest) => void
): boolean {
  if (householdCalculationPauseRemaining() > 0) {
    return false;
  }
  void resetFailedHouseholdImpact(queryClient, request);
  setSubmittedRequest(request);
  return true;
}

export function householdImpactQueryOptions(
  request: HouseholdRequest | null,
  enabled: boolean
) {
  return {
    queryKey: householdImpactQueryKey(request),
    queryFn: () => fetchHouseholdImpact(request!),
    enabled: enabled && request !== null,
    // Retry only brief gateway failures: a rate-limited calculation would be
    // refused again until the firewall's one-minute window ends.
    retry: shouldRetryHouseholdCalculation,
    // A household's answer does not change, so the page keeps every answer
    // and calculates a household only when it is submitted: never when an
    // answer gets old, the window regains focus, the network reconnects, or
    // the page shows a failed household again.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retryOnMount: false,
  };
}

/** What the results area shows. */
export interface HouseholdImpactToShow {
  data: HouseholdImpactResponse | undefined;
  /** The household whose answer `data` is. */
  shownRequest: HouseholdRequest | null;
  isLoading: boolean;
  /** A failure to show in place of the results. */
  error: Error | null;
  /**
   * Set when the submitted household was refused for the firewall's limit
   * and `data` is the last household's answer: why, to show above it.
   */
  rateLimitNotice: string | null;
}

/** The household answered most recently, with its answer. */
function lastHouseholdAnswer(
  queryClient: QueryClient
): { request: HouseholdRequest; data: HouseholdImpactResponse } | null {
  const answered = queryClient
    .getQueryCache()
    .findAll({ queryKey: [HOUSEHOLD_IMPACT_KEY] })
    .filter((query) => query.state.status === "success")
    .sort((first, second) => second.state.dataUpdatedAt - first.state.dataUpdatedAt);
  if (answered.length === 0) {
    return null;
  }
  return {
    request: answered[0].queryKey[1] as HouseholdRequest,
    data: answered[0].state.data as HouseholdImpactResponse,
  };
}

/**
 * After a refusal for the firewall's limit, the last answer stays on
 * screen with the reason; any other failure, or a refusal with no earlier
 * answer, is shown in place of the results.
 */
export function householdImpactToShow(
  queryClient: QueryClient,
  request: HouseholdRequest | null,
  current: {
    data: HouseholdImpactResponse | undefined;
    error: Error | null;
    isLoading: boolean;
  }
): HouseholdImpactToShow {
  if (
    current.error instanceof HouseholdCalculationError &&
    current.error.rateLimited
  ) {
    const lastAnswer = lastHouseholdAnswer(queryClient);
    if (lastAnswer !== null) {
      return {
        data: lastAnswer.data,
        shownRequest: lastAnswer.request,
        isLoading: false,
        error: null,
        rateLimitNotice: current.error.message,
      };
    }
  }
  return {
    data: current.data,
    shownRequest: request,
    isLoading: current.isLoading,
    error: current.error,
    rateLimitNotice: null,
  };
}

export function useHouseholdImpact(
  request: HouseholdRequest | null,
  enabled: boolean
): HouseholdImpactToShow {
  const queryClient = useQueryClient();
  const query = useQuery<HouseholdImpactResponse>(
    householdImpactQueryOptions(request, enabled)
  );
  return householdImpactToShow(queryClient, request, query);
}
