import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchHouseholdImpact,
  householdCalculationPauseRemaining,
  householdImpactQueryOptions,
  householdImpactToShow,
  pauseHouseholdCalculations,
  resetFailedHouseholdImpact,
  submitHouseholdRequest,
} from "@/hooks/useHouseholdImpact";
import { api, HouseholdCalculationError } from "@/lib/api";
import type { HouseholdImpactResponse, HouseholdRequest } from "@/lib/types";

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

// Another household, calculated before the one the page shows now.
const earlierRequest: HouseholdRequest = { ...householdRequest, income: 50000 };

function impactAnswer(difference: number): HouseholdImpactResponse {
  return {
    income_range: [0, 50000, 100000],
    net_income_change: [0, difference, 0],
    federalTaxChange: [0, 0, 0],
    stateTaxChange: [0, -difference, 0],
    netIncomeChange: [0, difference, 0],
    benefit_at_income: {
      baseline: 50000,
      reform: 50000 + difference,
      difference,
      federal_tax_change: 0,
      state_tax_change: -difference,
      net_income_change: difference,
    },
    x_axis_max: 500000,
  };
}

function rateLimitRefusal(): HouseholdCalculationError {
  return new HouseholdCalculationError(
    "Everyone on your network, such as a workshop or an office, shares a " +
      "limit on calculations a minute, and it has been reached.",
    429,
    false,
    true,
  );
}

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
  // Real time first, so that ending the pause ends it in real time.
  vi.useRealTimers();
  pauseHouseholdCalculations(0);
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

describe("submitHouseholdRequest during a pause", () => {
  it("submits nothing while calculations are paused after a rate-limit refusal", async () => {
    await queryClient
      .fetchQuery({
        queryKey,
        queryFn: () => Promise.reject(rateLimitRefusal()),
        retry: false,
      })
      .catch(() => undefined);
    pauseHouseholdCalculations();
    const submittedRequests: HouseholdRequest[] = [];

    const submitted = submitHouseholdRequest(
      queryClient,
      { ...householdRequest },
      (request) => submittedRequests.push(request),
    );

    expect(submitted).toBe(false);
    expect(submittedRequests).toEqual([]);
    expect(queryClient.getQueryState(queryKey)?.status).toBe("error");
  });

  it("submits again once the minute is over", () => {
    vi.useFakeTimers();
    pauseHouseholdCalculations();
    vi.advanceTimersByTime(60_000);
    const submittedRequests: HouseholdRequest[] = [];

    const submitted = submitHouseholdRequest(
      queryClient,
      { ...householdRequest },
      (request) => submittedRequests.push(request),
    );

    expect(submitted).toBe(true);
    expect(submittedRequests).toEqual([householdRequest]);
  });
});

describe("fetchHouseholdImpact", () => {
  it("pauses calculations for a minute after a rate-limit refusal", async () => {
    vi.useFakeTimers();
    vi.spyOn(api, "calculateHouseholdImpact").mockRejectedValue(
      rateLimitRefusal(),
    );

    await expect(fetchHouseholdImpact(householdRequest)).rejects.toMatchObject(
      { rateLimited: true },
    );

    expect(householdCalculationPauseRemaining()).toBe(60_000);
    vi.advanceTimersByTime(60_000);
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("does not pause after other failures", async () => {
    vi.spyOn(api, "calculateHouseholdImpact").mockRejectedValue(
      new HouseholdCalculationError("HTTP 503", 503, true, false),
    );

    await expect(fetchHouseholdImpact(householdRequest)).rejects.toMatchObject(
      { status: 503 },
    );

    expect(householdCalculationPauseRemaining()).toBe(0);
  });
});

describe("householdImpactQueryOptions", () => {
  it("never calculates a refused household again on its own", async () => {
    // A mounted client follows focus and network events, as the page's does.
    queryClient.mount();
    const calculate = vi
      .spyOn(api, "calculateHouseholdImpact")
      .mockRejectedValue(rateLimitRefusal());
    const observer = new QueryObserver(
      queryClient,
      householdImpactQueryOptions(householdRequest, true),
    );
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() =>
      expect(queryClient.getQueryState(queryKey)?.status).toBe("error"),
    );

    // The window regains focus, the network comes back, and the page shows
    // the household again.
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    const secondObserver = new QueryObserver(
      queryClient,
      householdImpactQueryOptions(householdRequest, true),
    );
    const unsubscribeSecond = secondObserver.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calculate).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribeSecond();
    focusManager.setFocused(undefined);
    queryClient.unmount();
  });

  it("never calculates an answered household again on its own", async () => {
    queryClient.mount();
    const calculate = vi
      .spyOn(api, "calculateHouseholdImpact")
      .mockResolvedValue(impactAnswer(350));
    const observer = new QueryObserver(
      queryClient,
      householdImpactQueryOptions(householdRequest, true),
    );
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() =>
      expect(queryClient.getQueryState(queryKey)?.status).toBe("success"),
    );

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    const secondObserver = new QueryObserver(
      queryClient,
      householdImpactQueryOptions(householdRequest, true),
    );
    const unsubscribeSecond = secondObserver.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calculate).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribeSecond();
    focusManager.setFocused(undefined);
    queryClient.unmount();
  });

  it("keeps answers for the page's lifetime", async () => {
    vi.useFakeTimers();
    vi.spyOn(api, "calculateHouseholdImpact").mockResolvedValue(
      impactAnswer(350),
    );
    const observer = new QueryObserver(
      queryClient,
      householdImpactQueryOptions(householdRequest, true),
    );
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(queryClient.getQueryData(queryKey)).toEqual(impactAnswer(350));
  });
});

describe("householdImpactToShow", () => {
  it("shows the last answer, with the reason, when a calculation is refused for the rate limit", () => {
    queryClient.setQueryData(
      ["householdImpact", earlierRequest],
      impactAnswer(200),
    );
    const refusal = rateLimitRefusal();

    expect(
      householdImpactToShow(queryClient, householdRequest, {
        data: undefined,
        error: refusal,
        isLoading: false,
      }),
    ).toEqual({
      data: impactAnswer(200),
      shownRequest: earlierRequest,
      isLoading: false,
      error: null,
      rateLimitNotice: refusal.message,
    });
  });

  it("shows the most recent of several earlier answers", () => {
    const latestRequest = { ...householdRequest, income: 60000 };
    queryClient.setQueryData(
      ["householdImpact", earlierRequest],
      impactAnswer(200),
      { updatedAt: 1_000 },
    );
    queryClient.setQueryData(
      ["householdImpact", latestRequest],
      impactAnswer(300),
      { updatedAt: 2_000 },
    );

    expect(
      householdImpactToShow(queryClient, householdRequest, {
        data: undefined,
        error: rateLimitRefusal(),
        isLoading: false,
      }),
    ).toMatchObject({ data: impactAnswer(300), shownRequest: latestRequest });
  });

  it("shows other failures in place of the results", () => {
    queryClient.setQueryData(
      ["householdImpact", earlierRequest],
      impactAnswer(200),
    );
    const failure = new HouseholdCalculationError("HTTP 500", 500, false, false);

    expect(
      householdImpactToShow(queryClient, householdRequest, {
        data: undefined,
        error: failure,
        isLoading: false,
      }),
    ).toEqual({
      data: undefined,
      shownRequest: householdRequest,
      isLoading: false,
      error: failure,
      rateLimitNotice: null,
    });
  });

  it("shows the refusal itself when nothing was calculated before", () => {
    const refusal = rateLimitRefusal();

    expect(
      householdImpactToShow(queryClient, householdRequest, {
        data: undefined,
        error: refusal,
        isLoading: false,
      }),
    ).toMatchObject({ data: undefined, error: refusal, rateLimitNotice: null });
  });
});
