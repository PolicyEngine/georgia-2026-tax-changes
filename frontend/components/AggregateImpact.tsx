'use client';

import { useState } from 'react';
import {
  useAggregateImpact,
  SC_DASHBOARD_YEAR,
} from '@/hooks/useAggregateImpact';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import ChartWatermark from './ChartWatermark';
// App-v2 color tokens using CSS variables
const COLORS = {
  gainMore5: 'var(--chart-gain-more-5)',
  gainLess5: 'var(--chart-gain-less-5)',
  noChange: 'var(--chart-no-change)',
  loseLess5: 'var(--chart-lose-less-5)',
  loseMore5: 'var(--chart-lose-more-5)',
  positive: 'var(--chart-positive)',
  negative: 'var(--chart-negative)',
};

// Shared chart margins
const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 60 };

// Shared axis tick style
const TICK_STYLE = { fontFamily: 'var(--font-sans)', fontSize: 12 };

// Custom tooltip component
function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--chart-tooltip-bg)',
      border: '1px solid var(--chart-tooltip-border)',
      borderRadius: 4,
      padding: '8px 12px',
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
    }}>
      {label && <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--text-heading)' }}>{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: 0, color: entry.color || 'var(--text-body)' }}>
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
        </p>
      ))}
    </div>
  );
}

interface Props {
  triggered: boolean;
}

export default function AggregateImpact({ triggered }: Props) {
  // Year is locked to 2026 for the South Carolina 2026 tax changes dashboard.
  const selectedYear = SC_DASHBOARD_YEAR;
  const { data, isLoading, error } = useAggregateImpact(triggered, selectedYear);
  const [activeSection, setActiveSection] = useState<
    'fiscal' | 'distributional' | 'winners' | 'poverty'
  >('fiscal');
  const [distMode, setDistMode] = useState<'relative' | 'absolute'>('relative');

  if (!triggered) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading South Carolina impact data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-gray-800 font-semibold mb-2">South Carolina impact data not yet available</h3>
        <p className="text-gray-600 font-medium mb-2">{errorMessage}</p>
        <p className="text-sm text-gray-500 mt-4">
          Precomputed data has not been generated yet. Run: <code>python scripts/pipeline.py</code>
        </p>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: number) =>
    `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatCurrencyWithSign = (value: number) => {
    const formatted = formatCurrency(value);
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };
  const formatBillions = (value: number) => {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    return formatCurrencyWithSign(value);
  };

  // Section tabs
  const sections = [
    { key: 'fiscal' as const, label: 'Budgetary impact' },
    { key: 'distributional' as const, label: 'Distributional impact' },
    { key: 'winners' as const, label: 'Winners & losers' },
    { key: 'poverty' as const, label: 'Poverty impact' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">South Carolina impact analysis</h2>
      <p className="text-sm text-gray-600">
        Comparing current law ({SC_DASHBOARD_YEAR}) to pre-{SC_DASHBOARD_YEAR} law
      </p>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === s.key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ===== FISCAL IMPACT ===== */}
      {activeSection === 'fiscal' && (
        <div className="space-y-6">
          {/* Selected year impact - 3 cards */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              South Carolina state revenue change ({selectedYear})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`rounded-lg p-5 border ${
                data.budget.state_tax_revenue_impact >= 0 ? 'bg-green-50 border-success' : 'bg-red-50 border-red-300'
              }`}>
                <p className="text-sm text-gray-700 mb-2">South Carolina state revenue change</p>
                <p className={`text-2xl font-bold ${
                  data.budget.state_tax_revenue_impact >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatBillions(data.budget.state_tax_revenue_impact)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Change in South Carolina state tax collections
                </p>
              </div>
              <div className={`rounded-lg p-5 border ${
                data.budget.federal_tax_revenue_impact >= 0 ? 'bg-green-50 border-success' : 'bg-red-50 border-red-300'
              }`}>
                <p className="text-sm text-gray-700 mb-2">Federal revenue change</p>
                <p className={`text-2xl font-bold ${
                  data.budget.federal_tax_revenue_impact >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatBillions(data.budget.federal_tax_revenue_impact)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Spillover effect on federal collections
                </p>
              </div>
              <div className={`rounded-lg p-5 border ${
                data.total_cost >= 0 ? 'bg-green-50 border-success' : 'bg-red-50 border-red-300'
              }`}>
                <p className="text-sm text-gray-700 mb-2">Total household impact</p>
                <p className={`text-2xl font-bold ${
                  data.total_cost >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatBillions(data.total_cost)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Net gain to South Carolina households
                </p>
              </div>
            </div>
          </div>

          {/* Income bracket table */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Impact by income bracket</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left px-4 py-3 font-medium text-gray-900">Income bracket</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Affected tax units</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Total impact</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Average impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.by_income_bracket.map((bracket, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900">{bracket.bracket}</td>
                      <td className="px-4 py-3 text-gray-700 text-right">{Math.round(bracket.beneficiaries).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-right"
                        style={{ color: bracket.total_cost >= 0 ? COLORS.positive : COLORS.negative }}>
                        {formatBillions(bracket.total_cost)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-right"
                        style={{ color: bracket.avg_benefit >= 0 ? COLORS.positive : COLORS.negative }}>
                        {formatCurrencyWithSign(bracket.avg_benefit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3 italic">
              Income brackets use an expanded income measure at the tax unit level, following JCT methodology. Expanded income includes AGI plus tax-exempt interest, employer payroll taxes, workers&apos; compensation, nontaxable Social Security benefits, and foreign earned income exclusion. A tax unit is the unit that files a tax return (single filer or married couple filing jointly).
            </p>
          </div>
        </div>
      )}

      {/* ===== DISTRIBUTIONAL IMPACT ===== */}
      {activeSection === 'distributional' && (() => {
        const isRelative = distMode === 'relative';
        const rawValues = isRelative
          ? Object.values(data.decile.relative).map(v => v * 100)
          : Object.values(data.decile.average);
        const maxAbs = Math.max(...rawValues.map(Math.abs));
        const niceStep = (() => {
          const rough = maxAbs / 3;
          const mag = Math.pow(10, Math.floor(Math.log10(rough)));
          const residual = rough / mag;
          if (residual <= 1) return mag;
          if (residual <= 2) return 2 * mag;
          if (residual <= 5) return 5 * mag;
          return 10 * mag;
        })();
        const niceMax = Math.ceil(maxAbs / niceStep) * niceStep;
        const symmetricDomain = [-niceMax, niceMax];
        const niceTicks = Array.from(
          { length: Math.round(2 * niceMax / niceStep) + 1 },
          (_, i) => -niceMax + i * niceStep,
        );
        const chartData = isRelative
          ? Object.entries(data.decile.relative).map(([k, v]) => ({ decile: k, value: v * 100 }))
          : Object.entries(data.decile.average).map(([k, v]) => ({ decile: k, value: v }));

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Impact by income decile</h3>
              <div className="flex gap-1">
                {(['relative', 'absolute'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDistMode(mode)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      distMode === mode
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {mode === 'relative' ? 'Relative' : 'Absolute'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-gray-700">
              {isRelative
                ? 'Change in household net income as a percentage of baseline income, by decile.'
                : 'Average change in household net income in dollars, by decile.'}
            </p>
            <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="decile" tick={TICK_STYLE} stroke="var(--chart-axis)" label={{ value: 'Income decile', position: 'insideBottom', offset: -15, style: { ...TICK_STYLE, fill: 'var(--chart-axis-label)' } }} />
                  <YAxis
                    domain={symmetricDomain}
                    ticks={niceTicks}
                    tickFormatter={isRelative
                      ? (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
                      : formatCurrencyWithSign}
                    tick={TICK_STYLE}
                    stroke="var(--chart-axis)"
                    width={isRelative ? 60 : 80}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip formatter={isRelative
                    ? (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                    : (v) => formatCurrencyWithSign(v)} />}
                  />
                  <ReferenceLine y={0} stroke="var(--chart-axis)" strokeWidth={1} />
                  <Bar dataKey="value" name={isRelative ? 'Relative impact (% of income)' : 'Average impact'} radius={[2, 2, 0, 0]}>
                    {rawValues.map((v, i) => (
                      <Cell key={i} fill={v >= 0 ? COLORS.positive : COLORS.negative} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            <ChartWatermark />
            <p className="text-xs text-gray-500 mt-3 italic">
              Distributional impacts are calculated at the household level. A household may contain multiple tax units (e.g., an adult child living with parents who files separately).
            </p>
          </div>
        );
      })()}

      {/* ===== WINNERS & LOSERS ===== */}
      {activeSection === 'winners' && (() => {
        const intra = data.intra_decile;
        const categories = [
          { key: 'gain_more_than_5pct', label: 'Gain more than 5%', color: COLORS.gainMore5 },
          { key: 'gain_less_than_5pct', label: 'Gain less than 5%', color: COLORS.gainLess5 },
          { key: 'no_change', label: 'No change', color: COLORS.noChange },
          { key: 'lose_less_than_5pct', label: 'Lose less than 5%', color: COLORS.loseLess5 },
          { key: 'lose_more_than_5pct', label: 'Lose more than 5%', color: COLORS.loseMore5 },
        ] as const;

        const stackedData = [
          {
            label: 'All',
            ...Object.fromEntries(categories.map(c => [c.key, (intra.all[c.key] * 100)])),
          },
          ...Array.from({ length: 10 }, (_, i) => {
            const d = 10 - i;
            return {
              label: `${d}`,
              ...Object.fromEntries(categories.map(c => [c.key, (intra.deciles[c.key][d - 1] * 100)])),
            };
          }),
        ];

        return (
          <div className="space-y-6">
            {/* Headline */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg p-6 border" style={{ backgroundColor: 'var(--chart-winners-bg)', borderColor: COLORS.positive }}>
                <p className="text-sm text-gray-700 mb-2">Winners</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.gainMore5 }}>{data.winners_rate.toFixed(1)}%</p>
                <p className="text-xs text-gray-600 mt-1">{Math.round(data.winners).toLocaleString()} households gain</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-300">
                <p className="text-sm text-gray-700 mb-2">No change</p>
                <p className="text-3xl font-bold text-gray-600">
                  {(100 - data.winners_rate - data.losers_rate).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg p-6 border" style={{ backgroundColor: 'var(--chart-losers-bg)', borderColor: COLORS.loseMore5 }}>
                <p className="text-sm text-gray-700 mb-2">Losers</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.loseMore5 }}>{data.losers_rate.toFixed(1)}%</p>
                <p className="text-xs text-gray-600 mt-1">{Math.round(data.losers).toLocaleString()} households lose</p>
              </div>
            </div>

            {/* Stacked bar chart by decile */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Winners & losers by income decile</h3>
              <div className="bg-white border rounded-lg p-6">
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stackedData} layout="vertical" stackOffset="expand" barSize={24} margin={CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                      <XAxis type="number" tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tick={TICK_STYLE} stroke="var(--chart-axis)" />
                      <YAxis type="category" dataKey="label" tick={TICK_STYLE} stroke="var(--chart-axis)" width={40} />
                      <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
                      {categories.map((c) => (
                        <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                <ChartWatermark />
                {/* Custom legend */}
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {categories.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-body)' }}>{c.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-3 italic">
                  Winners and losers are calculated at the household level. Some households in higher income deciles may see changes whose direction depends on the mix of tax units within the household.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== POVERTY IMPACT ===== */}
      {activeSection === 'poverty' && (() => {
        const pov = data.poverty;
        const pctChange = (baseline: number, reform: number) => {
          if (!baseline || baseline === 0) return 0;
          return ((reform - baseline) / baseline) * 100;
        };
        const povertyData = [
          {
            label: 'Overall',
            value: pctChange(pov.poverty.all.baseline, pov.poverty.all.reform),
          },
          {
            label: 'Child',
            value: pctChange(pov.poverty.child.baseline, pov.poverty.child.reform),
          },
          {
            label: 'Deep',
            value: pctChange(pov.deep_poverty.all.baseline, pov.deep_poverty.all.reform),
          },
          {
            label: 'Deep child',
            value: pctChange(pov.deep_poverty.child.baseline, pov.deep_poverty.child.reform),
          },
        ];
        const povMaxAbs = Math.max(...povertyData.map(d => Math.abs(d.value)), 0.01);
        const povNiceStep = (() => {
          const rough = povMaxAbs / 3;
          const mag = Math.pow(10, Math.floor(Math.log10(rough || 0.01)));
          const residual = rough / mag;
          if (residual <= 1) return mag;
          if (residual <= 2) return 2 * mag;
          if (residual <= 5) return 5 * mag;
          return 10 * mag;
        })();
        const povNiceMax = Math.ceil(povMaxAbs / povNiceStep) * povNiceStep;
        const povDomain: [number, number] = [-povNiceMax, povNiceMax];
        const povTicks = Array.from(
          { length: Math.round((2 * povNiceMax) / povNiceStep) + 1 },
          (_, i) => -povNiceMax + i * povNiceStep,
        );

        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                Change in poverty rates (%)
              </h3>
              <p className="text-gray-700 mb-3">
                Percent change from pre-{SC_DASHBOARD_YEAR} law in Supplemental Poverty Measure rates.
              </p>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={povertyData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="label"
                    tick={TICK_STYLE}
                    stroke="var(--chart-axis)"
                    label={{
                      value: 'Poverty measure',
                      position: 'insideBottom',
                      offset: -15,
                      style: { ...TICK_STYLE, fill: 'var(--chart-axis-label)' },
                    }}
                  />
                  <YAxis
                    domain={povDomain}
                    ticks={povTicks}
                    tickFormatter={(v: number) =>
                      `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                    }
                    tick={TICK_STYLE}
                    stroke="var(--chart-axis)"
                    width={70}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip
                        formatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                      />
                    }
                  />
                  <ReferenceLine y={0} stroke="var(--chart-axis)" strokeWidth={1} />
                  <Bar
                    dataKey="value"
                    name="Change in poverty rate"
                    radius={[2, 2, 0, 0]}
                  >
                    {povertyData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.value < 0 ? COLORS.positive : COLORS.negative}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartWatermark />
            </div>
          </div>
        );
      })()}

      <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
        These estimates are static: they do not capture behavioral responses such as changes in labor supply, tax avoidance, or migration.
      </p>
    </div>
  );
}
