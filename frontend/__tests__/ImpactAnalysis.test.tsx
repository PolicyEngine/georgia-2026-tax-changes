import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ImpactAnalysis from '../components/ImpactAnalysis';
import type { HouseholdRequest } from '../lib/types';

// A failed calculation, as useHouseholdImpact reports it.
vi.mock('@/hooks/useHouseholdImpact', () => ({
  useHouseholdImpact: () => ({
    data: undefined,
    isLoading: false,
    error: new Error(
      "PolicyEngine's calculation service could not be reached. Wait a minute and try again.",
    ),
  }),
}));

const householdRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 50000,
  year: 2026,
  max_earnings: 500000,
  state_code: 'GA',
};

describe('ImpactAnalysis error panel', () => {
  it('ends the failure message with a single full stop', () => {
    const { container } = render(
      <ImpactAnalysis request={householdRequest} triggered />,
    );

    expect(container.textContent).toContain(
      'Wait a minute and try again. You can still see precomputed results',
    );
    expect(container.textContent).not.toContain('..');
  });
});
