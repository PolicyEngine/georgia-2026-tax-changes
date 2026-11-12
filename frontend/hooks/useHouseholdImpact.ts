import {
  QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  api,
  HouseholdCalculationError,
  householdCalculationPauseRemaining,
  onHouseholdCalculationPause,
  pauseHouseholdCalculations,
  shouldRetryHouseholdCalculation,
} from "@/lib/api";
import { HouseholdRequest, HouseholdImpactResponse } from "@/lib/types";

export { householdCalculationPauseRemaining, pauseHouseholdCalculations };

const HOUSEHOLD_IMPACT_KEY = "householdImpact";

function householdImpactQueryKey(request: HouseholdRequest | null) {
  return [HOUSEHOLD_IMPACT_KEY, request];
}

/**
 * Whole seconds until the page may calculate again after a refusal for the
 * firewall's limit, 0 when it may now. Counts down once a second during a
 * pause.
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
    const unsubscribe = onHouseholdCalculationPause(update);
    return () => {
      unsubscribe();
      if (countdown !== undefined) {
        clearInterval(countdown);
      }
    };
  }, []);
  return secondsRemaining;
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
  return queryOptions<HouseholdImpactResponse, Error>({
    queryKey: householdImpactQueryKey(request),
    queryFn: () => api.calculateHouseholdImpact(request!),
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
  });
}

/** The household whose answer a page showed last. */
interface ShownHousehold {
  request: HouseholdRequest;
  /**
   * The precomputed answer, when the page showed an example household,
   * which is not in the query cache; null for a calculated answer.
   */
  precomputed: HouseholdImpactResponse | null;
}

/**
 * The household whose answer each query client's page showed last. After a
 * refusal for the firewall's limit, that answer is shown again.
 */
const shownHouseholds = new WeakMap<QueryClient, ShownHousehold>();

/**
 * Records that the page shows `request`'s answer: the calculated one in
 * the query cache, or `precomputed` for an example household. Null
 * forgets it.
 */
export function rememberShownHouseholdRequest(
  queryClient: QueryClient,
  request: HouseholdRequest | null,
  precomputed: HouseholdImpactResponse | null = null
): void {
  if (request === null) {
    shownHouseholds.delete(queryClient);
  } else {
    shownHouseholds.set(queryClient, { request, precomputed });
  }
}

/** What the results area shows. */
export interface HouseholdImpactToShow {
  data: HouseholdImpactResponse | undefined;
  /** The household whose answer `data` is. */
  shownRequest: HouseholdRequest | null;
  /**
   * `data` when it is an example household's precomputed answer, chosen
   * now or kept after a refusal; null for a calculated answer or none.
   */
  shownPrecomputed: HouseholdImpactResponse | null;
  isLoading: boolean;
  /** A failure to show in place of the results. */
  error: Error | null;
  /**
   * Set when the submitted household was refused for the firewall's limit
   * and `data` is the answer the page showed before: why, to show above it.
   */
  rateLimitNotice: string | null;
}

/**
 * After a refusal for the firewall's limit, the answer the page showed
 * before, calculated or precomputed, stays on screen with the reason; any
 * other failure, or a refusal with nothing shown before, is shown in place
 * of the results.
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
    const shownHousehold = shownHouseholds.get(queryClient);
    const shownAnswer =
      shownHousehold === undefined
        ? undefined
        : shownHousehold.precomputed ??
          queryClient.getQueryData<HouseholdImpactResponse>(
            householdImpactQueryKey(shownHousehold.request)
          );
    if (shownHousehold !== undefined && shownAnswer !== undefined) {
      return {
        data: shownAnswer,
        shownRequest: shownHousehold.request,
        shownPrecomputed: shownHousehold.precomputed,
        isLoading: false,
        error: null,
        rateLimitNotice: current.error.message,
      };
    }
  }
  return {
    data: current.data,
    shownRequest: request,
    shownPrecomputed: null,
    isLoading: current.isLoading,
    error: current.error,
    rateLimitNotice: null,
  };
}

/** How a render of the results area changes the record of the shown household. */
export type ShownHouseholdRecordChange =
  | { action: "remember"; request: HouseholdRequest }
  | { action: "forget" }
  | { action: "keep" };

/**
 * A household whose own answer is shown, calculated now, kept, or
 * precomputed for an example, is recorded. A failure other than a refusal
 * forgets the record, so a later refusal does not bring back an older
 * answer that was no longer on screen. Loading, and a refusal (which shows
 * the recorded answer), leave the record as it is.
 */
export function shownHouseholdRecordAfter(
  request: HouseholdRequest | null,
  current: { data: HouseholdImpactResponse | undefined; error: Error | null }
): ShownHouseholdRecordChange {
  if (current.data !== undefined && request !== null) {
    return { action: "remember", request };
  }
  if (
    current.error !== null &&
    !(current.error instanceof HouseholdCalculationError && current.error.rateLimited)
  ) {
    return { action: "forget" };
  }
  return { action: "keep" };
}

/**
 * What the results area shows for `request`: its calculated answer, or
 * `precomputed` when the page shows an example household, which is never
 * calculated.
 */
export function useHouseholdImpact(
  request: HouseholdRequest | null,
  enabled: boolean,
  precomputed: HouseholdImpactResponse | null = null
): HouseholdImpactToShow {
  const queryClient = useQueryClient();
  const query = useQuery(
    householdImpactQueryOptions(request, enabled && precomputed === null)
  );
  const shownData = precomputed ?? query.data;
  // An example's precomputed answer replaces any failure of its query.
  const shownError = precomputed === null ? query.error : null;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const change = shownHouseholdRecordAfter(request, {
      data: shownData,
      error: shownError,
    });
    if (change.action === "remember") {
      rememberShownHouseholdRequest(queryClient, change.request, precomputed);
    } else if (change.action === "forget") {
      rememberShownHouseholdRequest(queryClient, null);
    }
  }, [queryClient, enabled, request, shownData, shownError, precomputed]);
  useEffect(
    () => () => {
      // The results area has left the page, as when the reader opens
      // another tab, so nothing it showed is on screen any more.
      rememberShownHouseholdRequest(queryClient, null);
    },
    [queryClient]
  );
  if (precomputed !== null) {
    return {
      data: precomputed,
      shownRequest: request,
      shownPrecomputed: precomputed,
      isLoading: false,
      error: null,
      rateLimitNotice: null,
    };
  }
  return householdImpactToShow(queryClient, request, query);
}
