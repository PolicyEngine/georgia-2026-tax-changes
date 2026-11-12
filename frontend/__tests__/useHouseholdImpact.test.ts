import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  householdImpactQueryOptions,
  householdImpactToShow,
  pauseHouseholdCalculations,
  rememberShownHouseholdRequest,
  resetFailedHouseholdImpact,
  submitHouseholdRequest,
  useHouseholdImpact,
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

// A new client for each test, which also forgets which answer the page
// showed.
let queryClient = new QueryClient();

// Another household, calculated before the one the page shows now.
const earlierRequest: HouseholdRequest = { ...householdRequest, income: 50000 };

// A precomputed example household, shown without a calculation.
const exampleRequest: HouseholdRequest = {
  ...householdRequest,
  age_spouse: 35,
  income: 80000,
  max_earnings: 160000,
};

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

/** Provides the test's query client to a rendered hook, as the page does. */
function withQueryClient({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

afterEach(() => {
  queryClient.clear();
  queryClient = new QueryClient();
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

    // An hour later, the window regains focus and the page shows the
    // household again.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
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
    rememberShownHouseholdRequest(queryClient, earlierRequest);
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

  it("shows the answer that was on screen, not the one calculated last", () => {
    // The reader calculated the earlier household, then another, then went
    // back to the earlier one, which the page showed from the cache.
    const otherRequest = { ...householdRequest, income: 60000 };
    queryClient.setQueryData(
      ["householdImpact", earlierRequest],
      impactAnswer(200),
      { updatedAt: 1_000 },
    );
    queryClient.setQueryData(
      ["householdImpact", otherRequest],
      impactAnswer(300),
      { updatedAt: 2_000 },
    );
    rememberShownHouseholdRequest(queryClient, { ...earlierRequest });

    expect(
      householdImpactToShow(queryClient, householdRequest, {
        data: undefined,
        error: rateLimitRefusal(),
        isLoading: false,
      }),
    ).toMatchObject({ data: impactAnswer(200), shownRequest: earlierRequest });
  });

  it("shows the precomputed example that was on screen", () => {
    // A live answer from before the reader chose the example.
    queryClient.setQueryData(
      ["householdImpact", earlierRequest],
      impactAnswer(200),
    );
    const exampleAnswer = { ...impactAnswer(120), x_axis_max: 160000 };
    rememberShownHouseholdRequest(queryClient, exampleRequest, exampleAnswer);
    const refusal = rateLimitRefusal();

    expect(
      householdImpactToShow(queryClient, householdRequest, {
        data: undefined,
        error: refusal,
        isLoading: false,
      }),
    ).toEqual({
      data: exampleAnswer,
      shownRequest: exampleRequest,
      isLoading: false,
      error: null,
      rateLimitNotice: refusal.message,
    });
  });

  it("shows other failures in place of the results", () => {
    queryClient.setQueryData(
      ["householdImpact", earlierRequest],
      impactAnswer(200),
    );
    rememberShownHouseholdRequest(queryClient, earlierRequest);
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

  it("shows the refusal itself when nothing was shown before", () => {
    // An answer in the cache that the page never showed does not count.
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
    ).toMatchObject({ data: undefined, error: refusal, rateLimitNotice: null });
  });
});

describe("useHouseholdImpact", () => {
  it("keeps the household on screen after a refusal, not the one calculated last", async () => {
    const otherRequest = { ...householdRequest, income: 60000 };
    const calculate = vi
      .spyOn(api, "calculateHouseholdImpact")
      .mockImplementation(async (request) => {
        if (request.income === householdRequest.income) {
          throw rateLimitRefusal();
        }
        return impactAnswer(request.income / 100);
      });
    const { result, rerender } = renderHook(
      ({ request }: { request: HouseholdRequest }) =>
        useHouseholdImpact(request, true),
      { initialProps: { request: earlierRequest }, wrapper: withQueryClient },
    );
    await waitFor(() => expect(result.current.data).toEqual(impactAnswer(500)));
    rerender({ request: otherRequest });
    await waitFor(() => expect(result.current.data).toEqual(impactAnswer(600)));
    // Back to the earlier household, which the page shows from the cache.
    rerender({ request: { ...earlierRequest } });
    await waitFor(() => expect(result.current.data).toEqual(impactAnswer(500)));

    rerender({ request: householdRequest });
    await waitFor(() => expect(result.current.rateLimitNotice).not.toBeNull());

    expect(result.current).toMatchObject({
      data: impactAnswer(500),
      shownRequest: earlierRequest,
      error: null,
    });
    expect(calculate).toHaveBeenCalledTimes(3);
  });

  it("keeps a precomputed example on screen after a refusal", async () => {
    const calculate = vi
      .spyOn(api, "calculateHouseholdImpact")
      .mockRejectedValue(rateLimitRefusal());
    const exampleAnswer = { ...impactAnswer(120), x_axis_max: 160000 };
    const { result, rerender } = renderHook(
      ({
        request,
        precomputed,
      }: {
        request: HouseholdRequest;
        precomputed: HouseholdImpactResponse | null;
      }) => useHouseholdImpact(request, true, precomputed),
      {
        initialProps: {
          request: exampleRequest,
          precomputed: exampleAnswer as HouseholdImpactResponse | null,
        },
        wrapper: withQueryClient,
      },
    );
    // The example is shown without a calculation.
    expect(result.current).toMatchObject({
      data: exampleAnswer,
      shownRequest: exampleRequest,
    });
    expect(calculate).not.toHaveBeenCalled();

    // The reader edits the household and calculates it; it is refused.
    rerender({ request: householdRequest, precomputed: null });
    await waitFor(() => expect(result.current.rateLimitNotice).not.toBeNull());

    expect(result.current).toMatchObject({
      data: exampleAnswer,
      shownRequest: exampleRequest,
      error: null,
    });
  });
});
