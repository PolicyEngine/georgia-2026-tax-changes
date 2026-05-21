'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useHouseholdImpact } from '@/hooks/useHouseholdImpact';
import type {
  HouseholdImpactResponse,
  HouseholdRequest,
  ProvisionKey,
} from '@/lib/types';
import ChartWatermark from './ChartWatermark';
import {
  PROVISION_COLORS,
  PROVISION_LABELS,
} from './ExampleHouseholds';

interface Props {
  request: HouseholdRequest | null;
  triggered: boolean;
  maxEarnings?: number;
  /** When supplied, the chart renders this precomputed payload instead
   * of firing a live /us/calculate request. */
  precomputed?: HouseholdImpactResponse | null;
}

const PROVISION_ORDER: ProvisionKey[] = [
  'flat_rate',
  'standard_deduction',
  'dependent_exemption',
  'retirement_exclusion',
  'overtime_exclusion',
  'tip_exclusion',
];

type ProvisionValues = Record<ProvisionKey, number | null>;

interface ChartRow extends ProvisionValues {
  income: number;
  benefit: number;
  federalTaxChange: number;
  stateTaxChange: number;
  netIncomeChange: number;
  interaction: number | null;
}

export default function ImpactAnalysis({
  request,
  triggered,
  maxEarnings,
  precomputed,
}: Props) {
  const liveQuery = useHouseholdImpact(request, triggered && !precomputed);
  const data = precomputed ?? liveQuery.data;
  const isLoading = !precomputed && liveQuery.isLoading;
  const error = precomputed ? null : liveQuery.error;

  if (!triggered) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Calculating impact...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = (error as Error).message;
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-yellow-800 font-semibold mb-2">
          Household calculator temporarily unavailable
        </h2>
        <p className="text-yellow-700">
          The PolicyEngine API returned an error: <code>{errorMessage}</code>. You
          can still see precomputed results in the example-household cards above
          or on the <strong>Georgia impact</strong> tab.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('en-US')}`;
  const formatCurrencyWithSign = (value: number) => {
    const formatted = formatCurrency(Math.abs(value));
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  };
  const formatIncome = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${(value / 1000).toFixed(0)}k`;
  };

  const benefitData = data.benefit_at_income;

  const federalTaxChangePoint = benefitData.federal_tax_change;
  const stateTaxChangePoint = benefitData.state_tax_change;
  const netIncomeChangePoint = benefitData.net_income_change;

  const xMax = maxEarnings ?? data.x_axis_max;

  const federalTaxChangeSeries = data.federalTaxChange;
  const stateTaxChangeSeries = data.stateTaxChange;
  const netIncomeChangeSeries = data.netIncomeChange;

  const provChart = data.provisions_chart;
  const hasProvisions = !!provChart;

  const chartData: ChartRow[] = data.income_range
    .map((inc, i) => {
      const provisionValues = {} as ProvisionValues;
      let sumProvisions = 0;
      let allNonNull = true;
      for (const key of PROVISION_ORDER) {
        const v = provChart ? provChart[key]?.net_income_change[i] ?? null : null;
        provisionValues[key] = v;
        if (v === null) allNonNull = false;
        else sumProvisions += v;
      }
      const interaction = allNonNull
        ? netIncomeChangeSeries[i] - sumProvisions
        : null;
      return {
        income: inc,
        benefit: netIncomeChangeSeries[i],
        federalTaxChange: federalTaxChangeSeries[i],
        stateTaxChange: stateTaxChangeSeries[i],
        netIncomeChange: netIncomeChangeSeries[i],
        ...provisionValues,
        interaction,
      };
    })
    .filter((d) => d.income <= xMax);

  const metricCard = (
    label: string,
    value: number,
    inverseSign: boolean = false,
  ) => {
    const householdSign = inverseSign ? -value : value;
    const positive = householdSign > 0;
    const negative = householdSign < 0;
    return (
      <div
        className={`rounded-lg p-6 border ${
          positive
            ? 'bg-green-50 border-success'
            : negative
            ? 'bg-red-50 border-red-300'
            : 'bg-gray-50 border-gray-300'
        }`}
      >
        <p className="text-sm text-gray-700 mb-2">{label}</p>
        <p
          className={`text-3xl font-bold ${
            positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-gray-600'
          }`}
        >
          {value !== 0 ? `${formatCurrencyWithSign(value)}/year` : '$0/year'}
        </p>
      </div>
    );
  };

  const HoverTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ChartRow }>;
    label?: number;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    const incomeLabel = typeof label === 'number' ? label : p.income;
    return (
      <div
        style={{
          background: 'var(--chart-tooltip-bg, #fff)',
          border: '1px solid var(--chart-tooltip-border, #e5e7eb)',
          borderRadius: 4,
          padding: '8px 12px',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          minWidth: 240,
        }}
      >
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
          Income: {formatCurrency(Math.round(incomeLabel / 100) * 100)}
        </p>
        <p
          style={{
            margin: '4px 0 2px',
            fontSize: 11,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          By tax channel
        </p>
        <p
          style={{ margin: 0 }}
          title="Change in Georgia individual income tax liability under HB463 compared with pre-HB463 law. A positive value indicates an increase in tax."
        >
          GA tax change: {formatCurrencyWithSign(p.stateTaxChange)}
        </p>
        <p
          style={{ margin: 0 }}
          title="Change in federal individual income tax under HB463 compared with pre-HB463 law. Georgia income tax counts toward the federal itemized deduction for state and local taxes (subject to the $40,000 SALT cap), so a change in Georgia tax can shift federal taxable income and therefore federal tax. A positive value indicates an increase in tax."
        >
          Federal tax change: {formatCurrencyWithSign(p.federalTaxChange)}
        </p>
        <p style={{ margin: '4px 0 0', fontWeight: 600 }}>
          Net income change: {formatCurrencyWithSign(p.netIncomeChange)}
        </p>
        {hasProvisions && (
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid var(--border-light)',
            }}
          >
            <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-muted)' }}>
              By HB463 provision
            </p>
            {PROVISION_ORDER.filter(
              (key) => p[key] !== null && Math.abs(p[key] as number) >= 1,
            ).map((key) => (
              <p
                key={key}
                style={{
                  margin: '1px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: PROVISION_COLORS[key],
                  }}
                />
                <span style={{ flex: 1 }}>{PROVISION_LABELS[key]}:</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrencyWithSign(p[key] as number)}
                </span>
              </p>
            ))}
            {p.interaction !== null && Math.abs(p.interaction) >= 1 && (
              <p
                title="Reflects interactions among HB463's six provisions. Standard deduction, retirement exclusion, and overtime/tip exclusions reduce taxable income before the flat rate applies, so reverting multiple provisions together produces a combined effect that differs from the sum of the individual provision effects."
                style={{
                  margin: '2px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontStyle: 'italic',
                  color: 'var(--text-muted)',
                }}
              >
                <span style={{ display: 'inline-block', width: 8 }} />
                <span style={{ flex: 1 }}>HB463 provision interaction:</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrencyWithSign(p.interaction)}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-primary">Impact analysis</h2>

      {/* Personal impact */}
      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Your personal impact from Georgia 2026 tax changes (HB463, {request?.year ?? 2026})
        </h3>
        <p className="text-gray-600 mb-4">
          Based on your employment income of <strong>{formatCurrency(request?.income ?? 0)}</strong>,
          comparing current law (HB463) to pre-HB463 baseline.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metricCard('Federal tax change', federalTaxChangePoint, true)}
          {metricCard(
            'Georgia state tax change',
            stateTaxChangePoint,
            true,
          )}
          {metricCard('Net income change', netIncomeChangePoint)}
        </div>

        {hasProvisions && data.provisions && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROVISION_ORDER.filter(
              (key) =>
                Math.abs(data.provisions![key]?.net_income_change ?? 0) >= 1,
            ).map((key) => {
              const value = data.provisions![key].net_income_change;
              const positive = value > 0;
              const negative = value < 0;
              return (
                <div
                  key={key}
                  className="rounded-lg p-4 border bg-white border-gray-200"
                  style={{ borderLeft: `4px solid ${PROVISION_COLORS[key]}` }}
                >
                  <p className="text-xs text-gray-500 mb-1">
                    {PROVISION_LABELS[key]}
                  </p>
                  <p
                    className="text-xl font-bold"
                    style={{
                      color: positive
                        ? 'var(--chart-positive)'
                        : negative
                          ? 'var(--chart-negative)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {value !== 0 ? `${formatCurrencyWithSign(value)}/year` : '$0/year'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* Chart */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-1 text-gray-800">
          Change in net income from Georgia 2026 tax changes (HB463)
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Current law (HB463) vs. pre-HB463 baseline, by employment income
        </p>
        <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="income"
                type="number"
                tickFormatter={formatIncome}
                stroke="var(--chart-reference)"
                domain={[0, xMax]}
                allowDataOverflow={false}
              />
              <YAxis tickFormatter={formatCurrency} stroke="var(--chart-reference)" width={80} />
              <Tooltip content={<HoverTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--chart-reference)" strokeWidth={2} />
              <Line
                type="monotone"
                dataKey="benefit"
                stroke="var(--chart-positive)"
                strokeWidth={3}
                name="Net income change"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        <ChartWatermark />
        {hasProvisions && (
          <p className="text-[11px] text-gray-500 italic mt-2">
            Hover the chart to see each HB463 provision&apos;s contribution. The
            interaction line in the tooltip is the residual the six
            provisions don&apos;t directly explain — it captures tax-math
            non-additivity (e.g.&nbsp;the flat rate applied to an
            already-deduction-reduced base, or how the overtime/tip exclusions
            interact with federal AGI). The provisions plus the interaction
            always sum to the net total.
          </p>
        )}
      </div>
    </div>
  );
}
