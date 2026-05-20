import { useQuery } from "@tanstack/react-query";
import parseCSV from "@/lib/parseCSV";
import { AggregateImpactResponse, IntraDecileAll, IntraDecileDeciles } from "@/lib/types";

// South Carolina 2026 tax changes dashboard — year is locked to 2026 throughout.
export const SC_DASHBOARD_YEAR = 2026;

async function fetchCSV(filename: string): Promise<Record<string, string | number>[]> {
  // Use same default as next.config.js
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/south-carolina-2026-tax-changes";
  const res = await fetch(`${basePath}/data/${filename}`);
  if (!res.ok) throw new Error(`Failed to load ${filename}`);
  const text = await res.text();
  return parseCSV(text);
}

// Fetch the national congressional_districts.csv and filter to South Carolina (state="SC").
// Shared by components that need district-level numbers for the South Carolina 2026
// tax changes dashboard.
export function useSCDistrictImpact(enabled: boolean, year: number = SC_DASHBOARD_YEAR) {
  return useQuery<Record<string, string | number>[]>({
    queryKey: ["scDistrictImpact", year],
    queryFn: async () => {
      const rows = await fetchCSV("congressional_districts_revert.csv");
      return rows.filter(
        (r) => r.state === "SC" && Number(r.year) === year,
      );
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

function buildAggregateResponse(year: number): Promise<AggregateImpactResponse> {
  return Promise.all([
    fetchCSV("distributional_impact_revert.csv"),
    fetchCSV("metrics_revert.csv"),
    fetchCSV("winners_losers_revert.csv"),
    fetchCSV("income_brackets_revert.csv"),
  ]).then(([distributional, metrics, winnersLosers, incomeBrackets]) => {
    // Filter by year
    const dist = distributional.filter((r) => r.year === year);
    const met = metrics.filter((r) => r.year === year);
    const wl = winnersLosers.filter((r) => r.year === year);
    const ib = incomeBrackets.filter((r) => r.year === year);

    // Build metrics lookup
    const m = Object.fromEntries(met.map((r) => [r.metric, r.value as number]));

    // Build decile objects
    const decileAverage: Record<string, number> = {};
    const decileRelative: Record<string, number> = {};
    for (const row of dist) {
      decileAverage[row.decile as string] = row.average_change as number;
      decileRelative[row.decile as string] = row.relative_change as number;
    }

    // Build intra-decile
    const allRow = wl.find((r) => r.decile === "All")!;
    const intraAll: IntraDecileAll = {
      gain_more_than_5pct: allRow.gain_more_5pct as number,
      gain_less_than_5pct: allRow.gain_less_5pct as number,
      no_change: allRow.no_change as number,
      lose_less_than_5pct: allRow.lose_less_5pct as number,
      lose_more_than_5pct: allRow.lose_more_5pct as number,
    };

    const decileRows = wl.filter((r) => r.decile !== "All").sort(
      (a, b) => Number(a.decile) - Number(b.decile)
    );
    const intraDeciles: IntraDecileDeciles = {
      gain_more_than_5pct: decileRows.map((r) => r.gain_more_5pct as number),
      gain_less_than_5pct: decileRows.map((r) => r.gain_less_5pct as number),
      no_change: decileRows.map((r) => r.no_change as number),
      lose_less_than_5pct: decileRows.map((r) => r.lose_less_5pct as number),
      lose_more_than_5pct: decileRows.map((r) => r.lose_more_5pct as number),
    };

    return {
      budget: {
        baseline_net_income: m.baseline_net_income,
        budgetary_impact: m.budgetary_impact,
        federal_tax_revenue_impact: m.federal_tax_revenue_impact,
        state_tax_revenue_impact: m.state_tax_revenue_impact,
        tax_revenue_impact: m.tax_revenue_impact,
        benefit_spending_impact: m.benefit_spending_impact,
        households: m.households,
      },
      decile: { average: decileAverage, relative: decileRelative },
      intra_decile: { all: intraAll, deciles: intraDeciles },
      poverty: {
        poverty: {
          all: { baseline: m.poverty_baseline_rate, reform: m.poverty_reform_rate },
          child: { baseline: m.child_poverty_baseline_rate, reform: m.child_poverty_reform_rate },
        },
        deep_poverty: {
          all: { baseline: m.deep_poverty_baseline_rate, reform: m.deep_poverty_reform_rate },
          child: { baseline: m.deep_child_poverty_baseline_rate, reform: m.deep_child_poverty_reform_rate },
        },
      },
      total_cost: m.total_cost,
      beneficiaries: m.beneficiaries,
      avg_benefit: m.avg_benefit,
      winners: m.winners,
      losers: m.losers,
      winners_rate: m.winners_rate,
      losers_rate: m.losers_rate,
      poverty_baseline_rate: m.poverty_baseline_rate,
      poverty_reform_rate: m.poverty_reform_rate,
      poverty_rate_change: m.poverty_rate_change,
      poverty_percent_change: m.poverty_percent_change,
      child_poverty_baseline_rate: m.child_poverty_baseline_rate,
      child_poverty_reform_rate: m.child_poverty_reform_rate,
      child_poverty_rate_change: m.child_poverty_rate_change,
      child_poverty_percent_change: m.child_poverty_percent_change,
      deep_poverty_baseline_rate: m.deep_poverty_baseline_rate,
      deep_poverty_reform_rate: m.deep_poverty_reform_rate,
      deep_poverty_rate_change: m.deep_poverty_rate_change,
      deep_poverty_percent_change: m.deep_poverty_percent_change,
      deep_child_poverty_baseline_rate: m.deep_child_poverty_baseline_rate,
      deep_child_poverty_reform_rate: m.deep_child_poverty_reform_rate,
      deep_child_poverty_rate_change: m.deep_child_poverty_rate_change,
      deep_child_poverty_percent_change: m.deep_child_poverty_percent_change,
      by_income_bracket: ib.map((r) => ({
        bracket: r.bracket as string,
        beneficiaries: r.beneficiaries as number,
        total_cost: r.total_cost as number,
        avg_benefit: r.avg_benefit as number,
      })),
    };
  });
}

export function useAggregateImpact(
  enabled: boolean,
  year: number = 2026,
) {
  return useQuery<AggregateImpactResponse>({
    queryKey: ["aggregateImpact", year],
    queryFn: () => buildAggregateResponse(year),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useTenYearTotal(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["tenYearTotal"],
    queryFn: async () => {
      const rows = await fetchCSV("metrics_revert.csv");
      const years = Array.from({ length: 10 }, (_, i) => 2026 + i);
      return years.reduce((sum, year) => {
        const row = rows.find(
          (r) => r.year === year && r.metric === "budgetary_impact"
        );
        return sum + (row ? (row.value as number) : 0);
      }, 0);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useTenYearFederalTotal(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["tenYearFederalTotal"],
    queryFn: async () => {
      const rows = await fetchCSV("metrics_revert.csv");
      const years = Array.from({ length: 10 }, (_, i) => 2026 + i);
      return years.reduce((sum, year) => {
        const row = rows.find(
          (r) => r.year === year && r.metric === "federal_tax_revenue_impact"
        );
        return sum + (row ? (row.value as number) : 0);
      }, 0);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useTenYearStateTotal(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["tenYearStateTotal"],
    queryFn: async () => {
      const rows = await fetchCSV("metrics_revert.csv");
      const years = Array.from({ length: 10 }, (_, i) => 2026 + i);
      return years.reduce((sum, year) => {
        const row = rows.find(
          (r) => r.year === year && r.metric === "state_tax_revenue_impact"
        );
        return sum + (row ? (row.value as number) : 0);
      }, 0);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
