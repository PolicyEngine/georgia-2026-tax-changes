import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '../app/(shell)/page';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';

// jsdom has no ResizeObserver, which ResponsiveContainer needs. The chart
// gets a fixed size instead, so that its axes are drawn.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 800, height: 400 } as Record<string, unknown>),
  };
});

// The page scrolls a chosen example's results into view; jsdom does not
// scroll.
Element.prototype.scrollIntoView = () => undefined;

// The tests run in jsdom, where import.meta.url is not a file URL.
const exampleHouseholdsJson = readFileSync(
  resolve(__dirname, '../public/data/example_households.json'),
  'utf8',
);

const REFUSAL_MESSAGE =
  'Everyone on your network, such as a workshop or an office, shares a ' +
  'limit on calculations a minute, and it has been reached.';

/** The Public API's calculated household, with values over the income axis. */
function calculatedHousehold(netIncomes: number[], georgiaIncomeTaxes: number[]) {
  return {
    people: { you: { employment_income: { '2026': [0, 50000, 100000] } } },
    tax_units: {
      'your tax unit': {
        income_tax: { '2026': [0, 3000, 9000] },
        ga_income_tax: { '2026': georgiaIncomeTaxes },
      },
    },
    households: {
      'your household': { household_net_income: { '2026': netIncomes } },
    },
  };
}

/**
 * Replaces the global fetch: the example households come from the page's
 * data file, and the dashboard API answers each calculation, or refuses it
 * for the firewall's limit while `refuses()` is true.
 */
function stubFetch(refuses: () => boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/data/example_households.json')) {
        return new Response(exampleHouseholdsJson, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!url.endsWith('/api/household/calculate')) {
        return new Response('Not Found', { status: 404 });
      }
      if (refuses()) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      const body = JSON.parse(String(init.body)) as { policy?: unknown };
      const result =
        body.policy === undefined
          ? // Current law, with HB463.
            calculatedHousehold([0, 40500, 70200], [0, 1500, 4600])
          : // The inverse reform: parameters before HB463.
            calculatedHousehold([0, 40000, 70000], [0, 2000, 5000]);
      return new Response(JSON.stringify({ status: 'ok', message: null, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

/** Renders the page and opens its household impact tab. */
function renderHouseholdImpactTab() {
  const rendered = render(
    <QueryClientProvider client={new QueryClient()}>
      <Home />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Household impact' }));
  return rendered;
}

/** The results area that ImpactAnalysis draws. */
function resultsArea() {
  const heading = screen.getByRole('heading', { name: 'Impact analysis' });
  return within(heading.parentElement as HTMLElement);
}

/** The labels of the chart's x-axis ticks, left to right. */
function xAxisTickLabels(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value'),
  ).map((tick) => tick.textContent ?? '');
}

afterEach(() => {
  vi.unstubAllGlobals();
  pauseHouseholdCalculations(0);
});

describe('HouseholdImpactTab after a rate-limit refusal', () => {
  it("keeps an example's results, with its own labels, when the next calculation is refused", async () => {
    let refusing = false;
    stubFetch(() => refusing);
    renderHouseholdImpactTab();
    fireEvent.click(
      await screen.findByRole('button', { name: /Married couple, \$80k, 1 kid/ }),
    );
    expect(resultsArea().getByText('$80,000')).toBeInTheDocument();

    // The reader edits the example's household and calculates it.
    refusing = true;
    fireEvent.change(screen.getByDisplayValue('80,000'), {
      target: { value: '90,000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    await waitFor(() =>
      expect(resultsArea().getByRole('status')).toHaveTextContent(REFUSAL_MESSAGE),
    );
    // The example's results, labelled with its income, and its breakdown
    // by provision.
    expect(resultsArea().getByText('$80,000')).toBeInTheDocument();
    expect(resultsArea().getByText('Higher standard deduction')).toBeInTheDocument();
    expect(
      screen.queryByText('Household calculator temporarily unavailable'),
    ).not.toBeInTheDocument();
  });

  it('explains the pause beside the Calculate button', async () => {
    stubFetch(() => true);
    renderHouseholdImpactTab();

    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    const pauseExplanation = await screen.findByText(
      /^Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute\. This page can calculate again in \d+ s\.$/,
    );
    expect(pauseExplanation).toHaveAttribute('role', 'status');
  });

  it("highlights the shown answer's range after a refused x-axis change", async () => {
    let refusing = false;
    stubFetch(() => refusing);
    const { container } = renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await waitFor(() => expect(resultsArea().getByText('$50,000')).toBeInTheDocument());

    refusing = true;
    fireEvent.click(screen.getByRole('button', { name: '$1M' }));
    await waitFor(() => expect(resultsArea().getByRole('status')).toBeInTheDocument());

    // The answer calculated up to $100k, drawn up to $100k.
    expect(screen.getByRole('button', { name: '$100k' })).toHaveClass('bg-primary-500');
    expect(screen.getByRole('button', { name: '$1M' })).not.toHaveClass('bg-primary-500');
    expect(xAxisTickLabels(container).at(-1)).toBe('$100k');
  });

  it("lets the reader rescale an example's chart during a pause", async () => {
    stubFetch(() => true);
    pauseHouseholdCalculations();
    const { container } = renderHouseholdImpactTab();
    fireEvent.click(
      await screen.findByRole('button', { name: /Single parent server/ }),
    );

    // Rescaling an example sends no calculation, so the pause does not stop it.
    const widerRangeButton = screen.getByRole('button', { name: '$200k' });
    expect(widerRangeButton).toBeEnabled();
    fireEvent.click(widerRangeButton);

    expect(widerRangeButton).toHaveClass('bg-primary-500');
    expect(xAxisTickLabels(container).at(-1)).toBe('$200k');
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/household\/calculate$/),
      expect.anything(),
    );
  });
});
