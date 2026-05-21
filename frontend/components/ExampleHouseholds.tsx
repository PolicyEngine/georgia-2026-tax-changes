'use client';

import { useEffect, useState } from 'react';
import type {
  HouseholdImpactResponse,
  ProvisionKey,
  ProvisionsAtIncome,
  ProvisionsChart,
} from '@/lib/types';

export interface ExampleHouseholdProfile {
  label: string;
  income: number;
  age_head: number;
  married: boolean;
  dependents: number[];
  real_estate_taxes?: number;
  home_mortgage_interest?: number;
  charitable_cash_donations?: number;
  tip_income?: number;
  fsla_overtime_premium?: number;
  tip_income_deduction_occupation_requirement_met?: boolean;
}

interface ChartArrays {
  income_range: number[];
  net_income_change: number[];
  state_tax_change: number[];
  federal_tax_change: number[];
}

interface ExampleHousehold extends ExampleHouseholdProfile {
  baseline: {
    household_net_income: number;
    ga_income_tax: number;
    income_tax: number;
  };
  reform: {
    household_net_income: number;
    ga_income_tax: number;
    income_tax: number;
  };
  net_income_change: number;
  ga_tax_change: number;
  federal_tax_change?: number;
  chart: ChartArrays;
  provisions?: ProvisionsAtIncome;
  provisions_chart?: ProvisionsChart;
}

interface Payload {
  year: number;
  households: ExampleHousehold[];
}

const fmtCurrency = (v: number) =>
  `$${Math.round(v).toLocaleString('en-US')}`;

const fmtSigned = (v: number) => {
  const base = fmtCurrency(Math.abs(v));
  if (v > 0) return `+${base}`;
  if (v < 0) return `-${base}`;
  return base;
};

/** PE-palette colors for the six HB463 provisions plus interaction
 *  residual. Used both on the card breakdown rows and on the
 *  "By provision" chart lines. */
export const PROVISION_COLORS: Record<ProvisionKey, string> = {
  flat_rate: 'var(--primary-500)',
  standard_deduction: 'var(--primary-800)',
  dependent_exemption: 'var(--secondary-500)',
  retirement_exclusion: 'var(--tertiary-500)',
  overtime_exclusion: 'var(--warning-500)',
  tip_exclusion: 'var(--gray-600)',
};

export const PROVISION_LABELS: Record<ProvisionKey, string> = {
  flat_rate: 'Flat rate cut (5.19% → 4.99%)',
  standard_deduction: 'Higher standard deduction',
  dependent_exemption: 'Higher dependent exemption',
  retirement_exclusion: 'Retirement exclusion bump (2027+)',
  overtime_exclusion: 'New overtime exclusion',
  tip_exclusion: 'New tip exclusion',
};

const PROVISION_ORDER: ProvisionKey[] = [
  'flat_rate',
  'standard_deduction',
  'dependent_exemption',
  'retirement_exclusion',
  'overtime_exclusion',
  'tip_exclusion',
];

/** Build a HouseholdImpactResponse-shaped payload from one of the
 *  precomputed example records, so the existing ImpactAnalysis chart
 *  can render it without firing a live API call. */
function toImpactResponse(h: ExampleHousehold): HouseholdImpactResponse {
  const xMax = h.chart.income_range[h.chart.income_range.length - 1];
  const federalTaxChange = h.baseline.income_tax - h.reform.income_tax;
  return {
    income_range: h.chart.income_range,
    net_income_change: h.chart.net_income_change,
    federalTaxChange: h.chart.federal_tax_change,
    stateTaxChange: h.chart.state_tax_change,
    netIncomeChange: h.chart.net_income_change,
    benefit_at_income: {
      baseline: h.baseline.household_net_income,
      reform: h.reform.household_net_income,
      difference: h.net_income_change,
      federal_tax_change: federalTaxChange,
      state_tax_change: h.ga_tax_change,
      net_income_change: h.net_income_change,
    },
    x_axis_max: xMax,
    provisions: h.provisions,
    provisions_chart: h.provisions_chart,
  };
}

interface Props {
  /** Fires when a card is clicked; parent populates the household form
   *  and passes the precomputed response into ImpactAnalysis. */
  onSelect: (
    profile: ExampleHouseholdProfile,
    response: HouseholdImpactResponse,
  ) => void;
  /** Label of the currently active example, so the matching card can
   *  highlight itself. */
  selectedLabel?: string | null;
}

export default function ExampleHouseholds({
  onSelect,
  selectedLabel,
}: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const basePath =
      process.env.NEXT_PUBLIC_BASE_PATH !== undefined
        ? process.env.NEXT_PUBLIC_BASE_PATH
        : '/us/georgia-2026-tax-changes';
    fetch(`${basePath}/data/example_households.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json();
      })
      .then((j: Payload) => setData(j))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return null;
  if (!data) return null;

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        Example households
      </h3>
      <p className="text-sm text-gray-600 mb-3">
        Click an example to load its profile into the calculator and render its
        net-income chart instantly. The breakdown attributes the impact to each
        of HB463&apos;s six provisions.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.households.map((h, i) => {
          const isGain = h.net_income_change > 0;
          const isSelected = selectedLabel === h.label;
          return (
            <button
              key={i}
              type="button"
              onClick={() =>
                onSelect(
                  {
                    label: h.label,
                    income: h.income,
                    age_head: h.age_head,
                    married: h.married,
                    dependents: h.dependents,
                    real_estate_taxes: h.real_estate_taxes,
                    home_mortgage_interest: h.home_mortgage_interest,
                    charitable_cash_donations: h.charitable_cash_donations,
                    tip_income: h.tip_income,
                    fsla_overtime_premium: h.fsla_overtime_premium,
                    tip_income_deduction_occupation_requirement_met:
                      h.tip_income_deduction_occupation_requirement_met,
                  },
                  toImpactResponse(h),
                )
              }
              className={`text-left rounded-lg border p-4 transition-all hover:shadow-md ${
                isSelected
                  ? 'ring-2 ring-primary-500 ring-offset-1 bg-white border-primary-500'
                  : isGain
                    ? 'bg-primary-50 border-primary-300 hover:border-primary-500'
                    : h.net_income_change < 0
                      ? 'bg-gray-50 border-gray-300 hover:border-gray-500'
                      : 'bg-gray-50 border-gray-300 hover:border-gray-400'
              }`}
            >
              <p className="text-sm font-semibold text-gray-800">{h.label}</p>
              <p
                className="text-2xl font-bold mt-1"
                style={{
                  color: isGain
                    ? 'var(--chart-positive)'
                    : h.net_income_change < 0
                      ? 'var(--chart-negative)'
                      : 'var(--text-secondary)',
                }}
              >
                {fmtSigned(h.net_income_change)}/year
              </p>

              {h.provisions && (
                <ProvisionBreakdown provisions={h.provisions} />
              )}

              <TaxChannelBreakdown
                gaTaxChange={h.ga_tax_change}
                federalTaxChange={h.federal_tax_change ?? 0}
              />

              <p className="text-xs text-gray-500 mt-2 leading-5">
                GA tax: {fmtCurrency(h.reform.ga_income_tax)} →{' '}
                {fmtCurrency(h.baseline.ga_income_tax)}
              </p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500 italic mt-2">
        Income change is current law (HB463, 2026) minus pre-HB463 baseline.
        Single parent files head of household. Married couples file jointly
        with the spouse aged 35. The itemizer profile carries $12k property
        tax, $20k mortgage interest, and $5k charitable to trigger federal
        SALT and itemized deductions.
      </p>
    </div>
  );
}

function ProvisionBreakdown({ provisions }: { provisions: ProvisionsAtIncome }) {
  const rows = PROVISION_ORDER.map((key) => ({
    key,
    value: provisions[key]?.net_income_change ?? 0,
  })).filter(({ value }) => Math.abs(value) >= 1);

  const residual = provisions.interaction_residual?.net_income_change ?? 0;
  const showResidual = Math.abs(residual) >= 1;

  // If no provision had any measurable individual impact, skip the
  // whole block — the card's headline number tells the story.
  if (rows.length === 0 && !showResidual) {
    return null;
  }

  return (
    <div className="mt-3 pt-2 border-t border-gray-200 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
        By HB463 provision
      </p>
      {rows.map(({ key, value }) => (
        <div
          key={key}
          className="flex items-center justify-between text-xs"
        >
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: PROVISION_COLORS[key] }}
            />
            <span className="text-gray-700">{PROVISION_LABELS[key]}</span>
          </span>
          <span
            className="font-medium tabular-nums"
            style={{
              color:
                value > 0
                  ? 'var(--chart-positive)'
                  : value < 0
                    ? 'var(--chart-negative)'
                    : 'var(--text-muted)',
            }}
          >
            {fmtSigned(value)}
          </span>
        </div>
      ))}
      {showResidual && (
        <div
          className="flex items-center justify-between text-[10px] text-gray-500 pt-0.5 italic"
          title="Reflects interactions among HB463's six provisions. Standard deduction, retirement exclusion, and overtime/tip exclusions reduce taxable income before the flat rate applies, so reverting multiple provisions together produces a combined effect that differs from the sum of the individual provision effects."
        >
          <span>HB463 provision interaction</span>
          <span className="tabular-nums">{fmtSigned(residual)}</span>
        </div>
      )}
    </div>
  );
}

/** Splits the total impact into its two channels:
 *  - GA income tax change (sum of the six provisions plus residual)
 *  - Federal income tax change (driven by SALT flow-through and other
 *    federal interactions with state tax)
 *
 *  Tax-change values use the "current law minus pre-HB463" sign
 *  convention: a positive value indicates an increase in tax liability
 *  under HB463. The raw delta is displayed so a positive number
 *  corresponds to a tax increase, but the color coding is inverted so
 *  an increase reads as a cost (red) and a decrease reads as savings
 *  (green). */
function TaxChannelBreakdown({
  gaTaxChange,
  federalTaxChange,
}: {
  gaTaxChange: number;
  federalTaxChange: number;
}) {
  if (Math.abs(gaTaxChange) < 1 && Math.abs(federalTaxChange) < 1) {
    return null;
  }
  const rows = [
    {
      label: 'GA income tax',
      value: gaTaxChange,
      title:
        'Change in Georgia individual income tax liability under HB463 compared with pre-HB463 law. A positive value indicates an increase in tax.',
    },
    {
      label: 'Federal income tax',
      value: federalTaxChange,
      title:
        'Change in federal individual income tax under HB463 compared with pre-HB463 law. Georgia income tax counts toward the federal itemized deduction for state and local taxes (subject to the $40,000 SALT cap), so a change in Georgia tax can shift federal taxable income and therefore federal tax. A positive value indicates an increase in tax.',
    },
  ];

  return (
    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
        By tax channel
      </p>
      {rows.map(({ label, value, title }) => (
        <div
          key={label}
          className="flex items-center justify-between text-xs"
          title={title}
        >
          <span className="text-gray-700">{label}</span>
          <span
            className="font-medium tabular-nums"
            style={{
              // Tax increase => HH loses => red. Tax decrease => HH gains => green.
              color:
                value > 0
                  ? 'var(--chart-negative)'
                  : value < 0
                    ? 'var(--chart-positive)'
                    : 'var(--text-muted)',
            }}
          >
            {fmtSigned(value)}
          </span>
        </div>
      ))}
    </div>
  );
}
