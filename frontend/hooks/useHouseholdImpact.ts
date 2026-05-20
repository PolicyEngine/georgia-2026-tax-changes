import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { HouseholdRequest, HouseholdImpactResponse } from "@/lib/types";

export function useHouseholdImpact(
  request: HouseholdRequest | null,
  enabled: boolean
) {
  return useQuery<HouseholdImpactResponse>({
    queryKey: ["householdImpact", request],
    queryFn: () => api.calculateHouseholdImpact(request!),
    enabled: enabled && request !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
