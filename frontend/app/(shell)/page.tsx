'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import ImpactAnalysis from '@/components/ImpactAnalysis';
import AggregateImpact from '@/components/AggregateImpact';
import ExampleHouseholds, { type ExampleHouseholdProfile } from '@/components/ExampleHouseholds';
import PolicyOverview from '@/components/PolicyOverview';
import CongressionalDistrictImpact from '@/components/CongressionalDistrictImpact';
import type { HouseholdImpactResponse, HouseholdRequest } from '@/lib/types';
import { parseHashParams } from '@/lib/embedding';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'policy' | 'impact' | 'aggregate' | 'districts'>('policy');

  const TAB_CONFIG = [
    { id: 'policy' as const, label: 'Policy overview' },
    { id: 'impact' as const, label: 'Household impact' },
    { id: 'aggregate' as const, label: 'Statewide impact' },
    { id: 'districts' as const, label: 'Congressional districts' },
  ];

  // Simple tab change handler
  const handleTabChange = useCallback((tab: 'policy' | 'impact' | 'aggregate' | 'districts') => {
    setActiveTab(tab);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 text-white py-8 px-4 shadow-md">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">
            Georgia 2026 Tax Changes Calculator
          </h1>
          <p className="text-lg opacity-90">
            See the impact of HB463 on Georgia households
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 mb-4" role="tablist">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`px-6 py-3 rounded-t-lg font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 border-t-4 border-primary-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          className="bg-white rounded-lg shadow-md p-6"
        >
          {activeTab === 'policy' ? (
            <PolicyOverview />
          ) : activeTab === 'impact' ? (
            <HouseholdImpactTab />
          ) : activeTab === 'aggregate' ? (
            <NationalImpactTab />
          ) : (
            <CongressionalDistrictImpact />
          )}
        </div>
      </div>
    </main>
  );
}

/** Household impact tab */
function HouseholdImpactTab() {
  // Initialize state from hash parameters if present
  const getInitialValues = () => {
    if (typeof window === 'undefined') {
      return { income: 50000, age: 35, state: 'GA', married: false, dependents: [5] };
    }
    const params = parseHashParams(window.location.hash);
    return {
      income: params.income ?? 50000,
      age: params.age ?? 35,
      state: params.state ?? 'GA',
      married: params.married ?? false,
      dependents: params.dependents ?? [5],
    };
  };

  const initialValues = getInitialValues();
  const [ageHead, setAgeHead] = useState(initialValues.age);
  const [ageHeadRaw, setAgeHeadRaw] = useState(String(initialValues.age));
  const [ageSpouse, setAgeSpouse] = useState<number | null>(initialValues.married ? 35 : null);
  const [ageSpouseRaw, setAgeSpouseRaw] = useState('35');
  const [married, setMarried] = useState(initialValues.married);
  const [dependentAges, setDependentAges] = useState<number[]>(initialValues.dependents);
  const [income, setIncome] = useState(initialValues.income);
  const [stateCode, setStateCode] = useState(initialValues.state);
  const [maxEarnings, setMaxEarnings] = useState(100000);
  const [triggered, setTriggered] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<HouseholdRequest | null>(null);
  const [precomputedImpact, setPrecomputedImpact] =
    useState<HouseholdImpactResponse | null>(null);
  const [selectedExampleLabel, setSelectedExampleLabel] = useState<string | null>(null);
  const impactRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedExampleLabel && impactRef.current) {
      impactRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedExampleLabel]);

  // Listen for hash changes to update form values
  useEffect(() => {
    const handleHashChange = () => {
      const params = parseHashParams(window.location.hash);
      if (params.income !== undefined) setIncome(params.income);
      if (params.age !== undefined) {
        setAgeHead(params.age);
        setAgeHeadRaw(String(params.age));
      }
      if (params.state) setStateCode(params.state);
      if (params.married !== undefined) {
        setMarried(params.married);
        if (params.married) {
          setAgeSpouse(35);
          setAgeSpouseRaw('35');
        } else {
          setAgeSpouse(null);
        }
      }
      if (params.dependents) setDependentAges(params.dependents);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleMarriedChange = (value: boolean) => {
    setMarried(value);
    if (!value) {
      setAgeSpouse(null);
    } else {
      setAgeSpouse(35);
      setAgeSpouseRaw('35');
    }
  };

  const handleDependentCountChange = (count: number) => {
    const ages = [...dependentAges];
    while (ages.length < count) ages.push(5);
    ages.splice(count);
    setDependentAges(ages);
  };

  const formatNumber = (num: number) => num.toLocaleString('en-US');
  const parseNumber = (str: string) => {
    const num = Number(str.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const buildRequest = (): HouseholdRequest => ({
    age_head: ageHead,
    age_spouse: married ? ageSpouse : null,
    dependent_ages: dependentAges,
    income,
    year: 2026,
    max_earnings: maxEarnings,
    state_code: stateCode,
  });

  const handleCalculate = () => {
    setSubmittedRequest(buildRequest());
    setTriggered(true);
    setPrecomputedImpact(null);
    setSelectedExampleLabel(null);
  };

  /** Click handler from ExampleHouseholds. Mirrors the profile into
   * the form fields and stashes the precomputed impact payload so
   * ImpactAnalysis renders without firing a live request. */
  const handleSelectExample = (
    profile: ExampleHouseholdProfile,
    response: HouseholdImpactResponse,
  ) => {
    setSelectedExampleLabel(profile.label);
    setIncome(profile.income);
    setAgeHead(profile.age_head);
    setAgeHeadRaw(String(profile.age_head));
    setMarried(profile.married);
    setAgeSpouse(profile.married ? 35 : null);
    setAgeSpouseRaw('35');
    setDependentAges(profile.dependents);
    setStateCode('GA');
    const exampleMaxEarnings = response.x_axis_max ?? maxEarnings;
    setMaxEarnings(exampleMaxEarnings);
    setSubmittedRequest({
      age_head: profile.age_head,
      age_spouse: profile.married ? 35 : null,
      dependent_ages: profile.dependents,
      income: profile.income,
      year: 2026,
      max_earnings: exampleMaxEarnings,
      state_code: 'GA',
    });
    setPrecomputedImpact(response);
    setTriggered(true);
  };

  return (
    <div className="space-y-6">
      {/* Pre-computed example households — clicking one populates the
          form below and the existing impact chart with precomputed
          values (no live API call). */}
      <ExampleHouseholds
        onSelect={handleSelectExample}
        selectedLabel={selectedExampleLabel}
      />

      {/* Inline household config */}
      <section className="bg-gray-50 rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Your household</h2>

        {/* Row 1: Income, Ages (head + spouse), Marital status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
          {/* Employment income */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              Employment income
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input
                type="text"
                value={formatNumber(income)}
                onChange={(e) => setIncome(parseNumber(e.target.value))}
                className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>

          {/* Ages (head + spouse when married) */}
          <div>
            <div className={married ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Your age</label>
                <input
                  type="number"
                  value={ageHeadRaw}
                  onChange={(e) => setAgeHeadRaw(e.target.value)}
                  onBlur={() => {
                    const clamped = Math.max(18, Math.min(100, parseInt(ageHeadRaw) || 18));
                    setAgeHead(clamped);
                    setAgeHeadRaw(String(clamped));
                  }}
                  min={18}
                  max={100}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              {married && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Spouse age</label>
                  <input
                    type="number"
                    value={ageSpouseRaw}
                    onChange={(e) => setAgeSpouseRaw(e.target.value)}
                    onBlur={() => {
                      const clamped = Math.max(18, Math.min(100, parseInt(ageSpouseRaw) || 18));
                      setAgeSpouse(clamped);
                      setAgeSpouseRaw(String(clamped));
                    }}
                    min={18}
                    max={100}
                    aria-label="Spouse age"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Marital status */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Marital status</label>
            <label
              htmlFor="married"
              className="flex items-center gap-3 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                id="married"
                checked={married}
                onChange={(e) => handleMarriedChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Married</span>
            </label>
          </div>
        </div>

        {/* Row 2: Dependents */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5 mt-5">
          {/* Dependents */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Dependents</label>
            <input
              type="number"
              value={dependentAges.length}
              onChange={(e) => handleDependentCountChange(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
              min={0}
              max={10}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
            {dependentAges.length > 0 && (
              <div className="mt-2">
                <span className="block text-xs font-medium text-gray-500 mb-1">Age(s)</span>
                <div className="grid grid-cols-3 gap-1.5">
                {dependentAges.map((age, i) => (
                  <input
                    key={i}
                    type="number"
                    value={age}
                    onChange={(e) => {
                      const newAges = [...dependentAges];
                      newAges[i] = Math.max(0, Math.min(26, parseInt(e.target.value) || 0));
                      setDependentAges(newAges);
                    }}
                    min={0}
                    max={26}
                    className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    placeholder={`Age ${i + 1}`}
                    aria-label={`Dependent ${i + 1} age`}
                  />
                ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Calculate button */}
        <div className="mt-8">
          <button
            onClick={handleCalculate}
            className="py-3 px-10 rounded-lg font-semibold text-white bg-primary-500 hover:bg-primary-600 active:bg-primary-700 transition-all shadow-sm hover:shadow-md sm:w-auto w-full"
          >
            Calculate impact
          </button>
        </div>
      </section>

      {/* Chart x-axis options */}
      {triggered && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Chart x-axis max:</span>
          {[100000, 200000, 500000, 1000000].map((v) => (
            <button
              key={v}
              onClick={() => {
                setMaxEarnings(v);
                setSubmittedRequest(prev => prev ? { ...prev, max_earnings: v } : null);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                maxEarnings === v
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ${v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}k`}
            </button>
          ))}
        </div>
      )}

      {/* Impact results */}
      {submittedRequest && (
        <div ref={impactRef} className="scroll-mt-4">
          <ImpactAnalysis
            request={submittedRequest}
            triggered={triggered}
            maxEarnings={maxEarnings}
            precomputed={precomputedImpact}
          />
        </div>
      )}
    </div>
  );
}

/** Statewide impact tab */
function NationalImpactTab() {
  return (
    <div className="space-y-6">
      <AggregateImpact triggered={true} />
    </div>
  );
}
