import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ImpactAnalysis from '../components/ImpactAnalysis';
import type { HouseholdImpactResponse, HouseholdRequest } from '../lib/types';

// What useHouseholdImpact returns; each test sets it.
const { useHouseholdImpactMock } = vi.hoisted(() => ({
  useHouseholdImpactMock: vi.fn(),
}));

vi.mock('@/hooks/useHouseholdImpact', () => ({
  useHouseholdImpact: useHouseholdImpactMock,
}));

// jsdom has no ResizeObserver, which ResponsiveContainer needs.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const householdRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 50000,
  year: 2026,
  max_earnings: 500000,
  state_code: 'GA',
};

// Another household, calculated before the one the page submitted now.
const earlierRequest: HouseholdRequest = { ...householdRequest, income: 40000 };

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

describe('ImpactAnalysis error panel', () => {
  it('ends the failure message with a single full stop', () => {
    // A failed calculation, as useHouseholdImpact reports it.
    useHouseholdImpactMock.mockReturnValue({
      data: undefined,
      shownRequest: householdRequest,
      isLoading: false,
      error: new Error(
        "PolicyEngine's calculation service could not be reached. Wait a minute and try again.",
      ),
      rateLimitNotice: null,
    });

    const { container } = render(
      <ImpactAnalysis request={householdRequest} triggered />,
    );

    expect(container.textContent).toContain(
      'Wait a minute and try again. You can still see precomputed results',
    );
    expect(container.textContent).not.toContain('..');
  });
});

describe('ImpactAnalysis after a rate-limit refusal', () => {
  it('shows the last answer, with the notice above it', () => {
    const rateLimitNotice =
      'Everyone on your network, such as a workshop or an office, shares a ' +
      'limit on calculations a minute, and it has been reached. This page ' +
      'can calculate again in a minute.';
    // The refused household's calculation, as useHouseholdImpact reports it:
    // the earlier household's answer, with the reason.
    useHouseholdImpactMock.mockReturnValue({
      data: impactAnswer(350),
      shownRequest: earlierRequest,
      isLoading: false,
      error: null,
      rateLimitNotice,
    });

    render(<ImpactAnalysis request={householdRequest} triggered />);

    // The notice keeps its own full stop.
    expect(screen.getByRole('status')).toHaveTextContent(rateLimitNotice);
    expect(screen.getByText(rateLimitNotice)).toBeInTheDocument();
    expect(
      screen.getByText('The results below are for the last household calculated.'),
    ).toBeInTheDocument();
    // The results are the earlier household's.
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(screen.getByText('+$350/year')).toBeInTheDocument();
    expect(
      screen.queryByText('Household calculator temporarily unavailable'),
    ).not.toBeInTheDocument();
  });
});
