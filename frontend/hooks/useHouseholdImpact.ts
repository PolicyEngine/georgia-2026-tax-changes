import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, shouldRetryHouseholdCalculation } from "@/lib/api";
import { HouseholdRequest, HouseholdImpactResponse } from "@/lib/types";

function householdImpactQueryKey(request: HouseholdRequest | null) {
  return ["householdImpact", request];
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
 * while one that succeeded is shown from the cache.
 */
export function submitHouseholdRequest(
  queryClient: QueryClient,
  request: HouseholdRequest,
  setSubmittedRequest: (request: HouseholdRequest) => void
): void {
  void resetFailedHouseholdImpact(queryClient, request);
  setSubmittedRequest(request);
}

export function useHouseholdImpact(
  request: HouseholdRequest | null,
  enabled: boolean
) {
  return useQuery<HouseholdImpactResponse>({
    queryKey: householdImpactQueryKey(request),
    queryFn: () => api.calculateHouseholdImpact(request!),
    enabled: enabled && request !== null,
    // Retry only brief gateway failures: a rate-limited calculation would be
    // refused again until the firewall's one-minute window ends.
    retry: shouldRetryHouseholdCalculation,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
