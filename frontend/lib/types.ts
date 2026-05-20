export interface HouseholdRequest {
  age_head: number;
  age_spouse: number | null;
  dependent_ages: number[];
  income: number;
  year: number;
  max_earnings: number;
  state_code: string;
}

export interface BenefitAtIncome {
  baseline: number;
  reform: number;
  difference: number;
  federal_tax_change: number;
  state_tax_change: number;
  net_income_change: number;
}

export type ProvisionKey = 'rates' | 'sciad' | 'eitc';

export interface ProvisionPointImpact {
  net_income_change: number;
  state_tax_change?: number;
  federal_tax_change?: number;
}

export interface ProvisionChartImpact {
  net_income_change: number[];
  state_tax_change?: number[];
  federal_tax_change?: number[];
}

export interface ProvisionsAtIncome {
  rates: ProvisionPointImpact;
  sciad: ProvisionPointImpact;
  eitc: ProvisionPointImpact;
  interaction_residual?: ProvisionPointImpact;
}

export interface ProvisionsChart {
  rates: ProvisionChartImpact;
  sciad: ProvisionChartImpact;
  eitc: ProvisionChartImpact;
  interaction_residual?: ProvisionChartImpact;
}

export interface HouseholdImpactResponse {
  income_range: number[];
  net_income_change: number[];
  federalTaxChange: number[];
  stateTaxChange: number[];
  netIncomeChange: number[];
  benefit_at_income: BenefitAtIncome;
  x_axis_max: number;
  /** Per-provision attribution (only present for precomputed examples). */
  provisions?: ProvisionsAtIncome;
  provisions_chart?: ProvisionsChart;
}

export interface IncomeBracket {
  bracket: string;
  beneficiaries: number;
  total_cost: number;
  avg_benefit: number;
}

export interface BudgetImpact {
  baseline_net_income: number;
  budgetary_impact: number;
  federal_tax_revenue_impact: number;
  state_tax_revenue_impact: number;
  tax_revenue_impact: number;
  benefit_spending_impact: number;
  households: number;
}

export interface DecileImpact {
  average: Record<string, number>;
  relative: Record<string, number>;
}

export interface IntraDecileAll {
  gain_more_than_5pct: number;
  gain_less_than_5pct: number;
  no_change: number;
  lose_less_than_5pct: number;
  lose_more_than_5pct: number;
}

export interface IntraDecileDeciles {
  gain_more_than_5pct: number[];
  gain_less_than_5pct: number[];
  no_change: number[];
  lose_less_than_5pct: number[];
  lose_more_than_5pct: number[];
}

export interface IntraDecile {
  all: IntraDecileAll;
  deciles: IntraDecileDeciles;
}

export interface PovertyGroup {
  baseline: number;
  reform: number;
}

export interface PovertyCategory {
  all: PovertyGroup;
  child: PovertyGroup;
}

export interface PovertyImpact {
  poverty: PovertyCategory;
  deep_poverty: PovertyCategory;
}

export interface AggregateImpactResponse {
  budget: BudgetImpact;
  decile: DecileImpact;
  intra_decile: IntraDecile;
  poverty: PovertyImpact;
  total_cost: number;
  beneficiaries: number;
  avg_benefit: number;
  winners: number;
  losers: number;
  winners_rate: number;
  losers_rate: number;
  poverty_baseline_rate: number;
  poverty_reform_rate: number;
  poverty_rate_change: number;
  poverty_percent_change: number;
  child_poverty_baseline_rate: number;
  child_poverty_reform_rate: number;
  child_poverty_rate_change: number;
  child_poverty_percent_change: number;
  deep_poverty_baseline_rate: number;
  deep_poverty_reform_rate: number;
  deep_poverty_rate_change: number;
  deep_poverty_percent_change: number;
  deep_child_poverty_baseline_rate: number;
  deep_child_poverty_reform_rate: number;
  deep_child_poverty_rate_change: number;
  deep_child_poverty_percent_change: number;
  by_income_bracket: IncomeBracket[];
}

export interface HealthResponse {
  status: string;
  version: string;
}
