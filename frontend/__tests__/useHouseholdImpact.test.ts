import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetFailedHouseholdImpact,
  submitHouseholdRequest,
} from "@/hooks/useHouseholdImpact";
import type { HouseholdRequest } from "@/lib/types";

const householdRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 75000,
  year: 2026,
  max_earnings: 500000,
  state_code: "GA",
};
// The key useHouseholdImpact gives the request's calculation.
const queryKey = ["householdImpact", householdRequest];

const queryClient = new QueryClient();

afterEach(() => {
  queryClient.clear();
});

describe("resetFailedHouseholdImpact", () => {
  it("clears a failed calculation, so that submitting it again runs it again", async () => {
    await queryClient
      .fetchQuery({
        queryKey,
        queryFn: () => Promise.reject(new Error("The calculation failed.")),
        retry: false,
      })
      .catch(() => undefined);
    expect(queryClient.getQueryState(queryKey)?.status).toBe("error");

    // The page builds a new request object with the same values.
    await resetFailedHouseholdImpact(queryClient, { ...householdRequest });

    expect(queryClient.getQueryState(queryKey)?.status).toBe("pending");
  });

  it("runs a failed calculation again while the page shows it", async () => {
    let attempts = 0;
    // The page's query, kept active as ImpactAnalysis keeps it.
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("The calculation failed.");
        }
        return { income_range: [] };
      },
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() =>
      expect(queryClient.getQueryState(queryKey)?.status).toBe("error"),
    );

    await resetFailedHouseholdImpact(queryClient, { ...householdRequest });

    expect(attempts).toBe(2);
    expect(queryClient.getQueryState(queryKey)?.status).toBe("success");
    unsubscribe();
  });

  it("keeps a calculation that succeeded", async () => {
    queryClient.setQueryData(queryKey, { income_range: [] });

    await resetFailedHouseholdImpact(queryClient, { ...householdRequest });

    expect(queryClient.getQueryState(queryKey)?.status).toBe("success");
  });
});

describe("submitHouseholdRequest", () => {
  // "Calculate impact" and the chart's x-axis buttons both submit through
  // this, so either one runs a failed calculation of the same household
  // again.
  it("clears the household's failed calculation and submits the household", async () => {
    await queryClient
      .fetchQuery({
        queryKey,
        queryFn: () => Promise.reject(new Error("The calculation failed.")),
        retry: false,
      })
      .catch(() => undefined);
    const submittedRequests: HouseholdRequest[] = [];

    submitHouseholdRequest(queryClient, { ...householdRequest }, (request) =>
      submittedRequests.push(request),
    );

    expect(queryClient.getQueryState(queryKey)?.status).toBe("pending");
    expect(submittedRequests).toEqual([householdRequest]);
  });
});
