import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/** How the dashboard API responds to a household calculation. */
type CalculationOutcome = 'answer' | 'server error' | 'refusal';

/**
 * Replaces the global fetch: the example households come from the page's
 * data file, and the dashboard API answers each calculation, or refuses it
 * for the firewall's limit while `refuses()` is true.
 */
function stubFetch(refuses: () => boolean): void {
  stubCalculations(() => (refuses() ? 'refusal' : 'answer'));
}

/**
 * Replaces the global fetch, as `stubFetch` does, with each calculation's
 * response given by `outcome()`.
 */
function stubCalculations(outcome: () => CalculationOutcome): void {
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
      if (outcome() === 'refusal') {
        return new Response('Too Many Requests', {
          status: 429,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      if (outcome() === 'server error') {
        return new Response(
          JSON.stringify({ status: 'error', message: 'Internal error', result: null }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
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

/** How many household calculations the page has sent to the dashboard API. */
function calculationRequestCount(): number {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([input]) => String(input).endsWith('/api/household/calculate'))
    .length;
}

/** Waits for a refusal shown as plain text, with no earlier answer kept. */
async function expectRefusalShownAsPlainText(): Promise<void> {
  await screen.findByText(REFUSAL_MESSAGE);
  expect(screen.getByText('Household calculator temporarily unavailable')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Impact analysis' })).not.toBeInTheDocument();
  expect(
    screen.queryByText('The results below are for the household shown before.'),
  ).not.toBeInTheDocument();
}

/**
 * Chooses the "Married couple, $80k, 1 kid" example, then edits its income
 * and calculates; the firewall refuses that calculation, so the example
 * stays on screen during the pause. Returns the example's card and the
 * rendered page.
 */
async function keepExampleAfterRefusal(): Promise<{
  exampleCard: HTMLElement;
  container: HTMLElement;
}> {
  let refusing = false;
  stubFetch(() => refusing);
  const { container } = renderHouseholdImpactTab();
  const exampleCard = await screen.findByRole('button', {
    name: /Married couple, \$80k, 1 kid/,
  });
  fireEvent.click(exampleCard);

  refusing = true;
  fireEvent.change(screen.getByDisplayValue('80,000'), {
    target: { value: '90,000' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
  await waitFor(() =>
    expect(resultsArea().getByText(REFUSAL_MESSAGE)).toBeInTheDocument(),
  );
  return { exampleCard, container };
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Real time first, so that ending the pause ends it in real time.
  vi.useRealTimers();
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
      expect(resultsArea().getByText(REFUSAL_MESSAGE)).toBeInTheDocument(),
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
    let refusing = true;
    stubFetch(() => refusing);
    renderHouseholdImpactTab();

    const calculateButton = screen.getByRole('button', { name: 'Calculate impact' });
    fireEvent.click(calculateButton);

    const liveRegion = await within(
      calculateButton.parentElement as HTMLElement,
    ).findByRole('status');
    // Only the explanation is a live region: the countdown changes every
    // second, and a screen reader would read the whole region again each
    // time.
    expect(liveRegion).toHaveTextContent(
      /^Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute\.$/,
    );
    expect(liveRegion.parentElement).toHaveTextContent(
      /^Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute\. This page can calculate again in \d+ s\.$/,
    );

    // After the minute, a household is calculated; the next one is refused,
    // and the earlier answer stays on screen with the notice above it.
    act(() => pauseHouseholdCalculations(0));
    refusing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await waitFor(() => expect(resultsArea().getByText('$50,000')).toBeInTheDocument());
    refusing = true;
    fireEvent.change(screen.getByDisplayValue('50,000'), { target: { value: '60,000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await waitFor(() =>
      expect(resultsArea().getByText(REFUSAL_MESSAGE)).toBeInTheDocument(),
    );

    // The explanation is announced once, by the region beside the button.
    const regionsWithExplanation = screen
      .getAllByRole('status')
      .filter((region) => region.textContent?.startsWith('Everyone on your network'));
    expect(regionsWithExplanation).toEqual([
      within(calculateButton.parentElement as HTMLElement).getByRole('status'),
    ]);
  });

  it('disables the Calculate button, labelled with its countdown, during a pause', async () => {
    stubFetch(() => true);
    renderHouseholdImpactTab();

    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    const calculateButton = await screen.findByRole('button', {
      name: /^Calculate again in \d+ s$/,
    });
    expect(calculateButton).toBeDisabled();
    // The x-axis buttons would calculate the household again.
    expect(screen.getByRole('button', { name: '$200k' })).toBeDisabled();
  });

  it('re-enables the buttons when the countdown ends', async () => {
    stubFetch(() => true);
    renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await screen.findByRole('button', { name: /^Calculate again in \d+ s$/ });

    // The minute passes; the countdown reads the clock once a second.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000);

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Calculate impact' })).toBeEnabled(),
      { timeout: 3000 },
    );
    expect(screen.getByRole('button', { name: '$200k' })).toBeEnabled();
    expect(screen.queryByText(/This page can calculate again in/)).not.toBeInTheDocument();
  });

  it('shows a refusal after an error panel, not an older answer', async () => {
    let outcome: CalculationOutcome = 'answer';
    stubCalculations(() => outcome);
    renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await waitFor(() => expect(resultsArea().getByText('$50,000')).toBeInTheDocument());

    // Another household fails for another reason: the error panel replaces
    // the first household's results.
    outcome = 'server error';
    fireEvent.change(screen.getByDisplayValue('50,000'), { target: { value: '60,000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await screen.findByText(/HTTP 500/);

    outcome = 'refusal';
    fireEvent.change(screen.getByDisplayValue('60,000'), { target: { value: '70,000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    await expectRefusalShownAsPlainText();
  });

  it('shows a refusal after the household tab is opened again, not an older answer', async () => {
    let refusing = false;
    stubFetch(() => refusing);
    renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await waitFor(() => expect(resultsArea().getByText('$50,000')).toBeInTheDocument());

    // The reader opens another tab and comes back: the form starts again,
    // with no results.
    fireEvent.click(screen.getByRole('tab', { name: 'Policy overview' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Household impact' }));
    expect(screen.queryByRole('heading', { name: 'Impact analysis' })).not.toBeInTheDocument();

    refusing = true;
    fireEvent.change(screen.getByDisplayValue('50,000'), { target: { value: '70,000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    await expectRefusalShownAsPlainText();
  });

  it("highlights the shown answer's range after a refused x-axis change", async () => {
    let refusing = false;
    stubFetch(() => refusing);
    const { container } = renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    await waitFor(() => expect(resultsArea().getByText('$50,000')).toBeInTheDocument());

    refusing = true;
    fireEvent.click(screen.getByRole('button', { name: '$1M' }));
    await waitFor(() => expect(resultsArea().getByText(REFUSAL_MESSAGE)).toBeInTheDocument());

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

describe('HouseholdImpactTab with an example kept after a refusal', () => {
  it("keeps the example's card marked as selected", async () => {
    const { exampleCard } = await keepExampleAfterRefusal();

    expect(exampleCard).toHaveClass('ring-2');
  });

  it('rescales the example during the pause', async () => {
    const { container } = await keepExampleAfterRefusal();
    const requestsBefore = calculationRequestCount();

    // Rescaling the example sends no calculation, so the pause does not
    // stop it.
    const widerRangeButton = screen.getByRole('button', { name: '$200k' });
    expect(widerRangeButton).toBeEnabled();
    fireEvent.click(widerRangeButton);

    expect(widerRangeButton).toHaveClass('bg-primary-500');
    expect(xAxisTickLabels(container).at(-1)).toBe('$200k');
    expect(resultsArea().getByText('$80,000')).toBeInTheDocument();
    expect(calculationRequestCount()).toBe(requestsBefore);
  });

  it('rescales the example after the pause instead of calculating the refused household', async () => {
    const { container } = await keepExampleAfterRefusal();
    act(() => pauseHouseholdCalculations(0));
    const requestsBefore = calculationRequestCount();

    fireEvent.click(screen.getByRole('button', { name: '$200k' }));

    expect(screen.queryByText('Calculating impact...')).not.toBeInTheDocument();
    expect(xAxisTickLabels(container).at(-1)).toBe('$200k');
    expect(resultsArea().getByText('$80,000')).toBeInTheDocument();
    expect(calculationRequestCount()).toBe(requestsBefore);
  });
});
