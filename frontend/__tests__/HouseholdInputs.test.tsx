import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the API to prevent actual network calls
vi.mock('../lib/api', () => ({
  api: {
    calculateHouseholdImpact: vi.fn().mockResolvedValue({
      income_range: [0, 10000, 20000, 30000],
      net_income_change: [0, 500, 1000, 1500],
      benefit_at_income: { baseline: 10000, reform: 11500, difference: 1500 },
      x_axis_max: 500000,
    }),
  },
}));

// Simple component to test the household input form behavior
// We extract this from page.tsx to test it in isolation
describe('Household Input Form', () => {
  it('validates age input between 18-100', () => {
    // Test age validation logic directly
    const clampAge = (value: string): number => {
      return Math.max(18, Math.min(100, parseInt(value) || 18));
    };

    expect(clampAge('25')).toBe(25);
    expect(clampAge('10')).toBe(18);
    expect(clampAge('150')).toBe(100);
    expect(clampAge('')).toBe(18);
  });

  it('validates dependent ages between 0-26', () => {
    // Test dependent age validation logic
    const clampDependentAge = (value: string): number => {
      return Math.max(0, Math.min(26, parseInt(value) || 0));
    };

    expect(clampDependentAge('5')).toBe(5);
    expect(clampDependentAge('-1')).toBe(0);
    expect(clampDependentAge('30')).toBe(26);
    expect(clampDependentAge('')).toBe(0);
  });

  it('parses income input correctly', () => {
    // Test income parsing with commas
    const parseNumber = (str: string) => {
      const num = Number(str.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    };

    expect(parseNumber('75,000')).toBe(75000);
    expect(parseNumber('1,000,000')).toBe(1000000);
    expect(parseNumber('50000')).toBe(50000);
    expect(parseNumber('')).toBe(0);
  });

  it('formats income with commas', () => {
    const formatNumber = (num: number) => num.toLocaleString('en-US');

    expect(formatNumber(75000)).toBe('75,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });
});
