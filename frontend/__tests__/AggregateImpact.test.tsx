import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AggregateImpact from '../components/AggregateImpact';

// Mock fetch for CSV loading
const mockMetricsCSV = `year,metric,value
2026,budgetary_impact,-5000000000
2026,winners,10000000
2026,winners_rate,25
2026,losers,100000
2026,losers_rate,0.25
2026,poverty_baseline_rate,11.5
2026,poverty_reform_rate,11.3
2026,child_poverty_baseline_rate,15.2
2026,child_poverty_reform_rate,14.8
2026,deep_poverty_baseline_rate,4.5
2026,deep_poverty_reform_rate,4.4
2026,deep_child_poverty_baseline_rate,5.2
2026,deep_child_poverty_reform_rate,5.0
2026,baseline_net_income,1000000000
2026,tax_revenue_impact,-5000000000
2026,benefit_spending_impact,0
2026,households,130000000`;

const mockDistributionalCSV = `year,decile,average_change,relative_change
2026,1,100,0.02
2026,2,80,0.015
2026,3,60,0.01
2026,4,40,0.008
2026,5,30,0.006
2026,6,20,0.004
2026,7,10,0.002
2026,8,5,0.001
2026,9,0,0
2026,10,-20,-0.001`;

const mockWinnersLosersCSV = `year,decile,gain_more_5pct,gain_less_5pct,no_change,lose_less_5pct,lose_more_5pct
2026,All,0.1,0.15,0.74,0.005,0.005
2026,1,0.2,0.3,0.5,0,0
2026,2,0.15,0.25,0.6,0,0
2026,3,0.1,0.2,0.7,0,0
2026,4,0.08,0.15,0.77,0,0
2026,5,0.05,0.1,0.85,0,0
2026,6,0.03,0.07,0.9,0,0
2026,7,0.02,0.05,0.93,0,0
2026,8,0.01,0.03,0.95,0.005,0.005
2026,9,0.005,0.02,0.96,0.01,0.005
2026,10,0,0.01,0.95,0.02,0.02`;

const mockIncomeBracketsCSV = `year,bracket,beneficiaries,total_cost,avg_benefit
2026,$0-$25k,5000000,1000000000,200
2026,$25k-$50k,4000000,1500000000,375
2026,$50k-$75k,3000000,1000000000,333
2026,$75k-$100k,2000000,500000000,250
2026,$100k+,1000000,0,0`;

beforeEach(() => {
  global.fetch = vi.fn((url: string) => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

    if (url.includes('metrics_revert.csv')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(mockMetricsCSV) });
    }
    if (url.includes('distributional_impact_revert.csv')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(mockDistributionalCSV) });
    }
    if (url.includes('winners_losers_revert.csv')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(mockWinnersLosersCSV) });
    }
    if (url.includes('income_brackets_revert.csv')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(mockIncomeBracketsCSV) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  }) as typeof fetch;
});

// Mock ResizeObserver for Recharts
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('AggregateImpact', () => {
  it('renders nothing when not triggered', () => {
    const queryClient = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AggregateImpact triggered={false} />
      </QueryClientProvider>
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows loading state when triggered', () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AggregateImpact triggered={true} />
      </QueryClientProvider>
    );
    expect(screen.getByText('Loading South Carolina impact data...')).toBeInTheDocument();
  });
});
