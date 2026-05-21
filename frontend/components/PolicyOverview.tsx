'use client';

export default function PolicyOverview() {
  return (
    <div className="space-y-10">
      {/* Summary */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Georgia 2026 Tax Changes
        </h2>
        <p className="text-gray-700 mb-4">
          Georgia&apos;s HB463 (2025&ndash;2026 session, signed 2026) cuts the
          flat state income-tax rate, raises the standard deduction and
          dependent exemption, and adds new exclusions for overtime
          compensation and tip income beginning tax year 2026. The age-65+
          retirement income exclusion also rises starting tax year 2027.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">
              Lower flat rate
            </h3>
            <p className="text-sm text-gray-600">
              Drops Georgia&apos;s flat individual income-tax rate from
              5.19% to 4.99% starting tax year 2026. Codified at
              O.C.G.A. &sect; 48-7-20(a.1).
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">
              Higher deductions
            </h3>
            <p className="text-sm text-gray-600">
              Standard deduction rises from $12,000/$24,000 to
              $15,000/$30,000 (single &middot; joint), and the dependent
              exemption rises from $4,000 to $5,000 per dependent.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">
              New exclusions
            </h3>
            <p className="text-sm text-gray-600">
              Up to $1,750 of qualified overtime pay and $1,750 of cash
              tips can be excluded from Georgia AGI (TY 2026&ndash;2028,
              self-repealing). The age-65+ retirement income exclusion
              rises from $65,000 to $70,000 starting TY 2027.
            </p>
          </div>
        </div>
      </div>

      {/* Parameter changes table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Parameter changes
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Parameter</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Pre-HB463 law</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Current law (HB463)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Flat tax rate (TY 2026+)</td>
                <td className="py-3 px-4 text-right text-gray-700">5.19%</td>
                <td className="py-3 px-4 text-right text-gray-700">4.99%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Standard deduction (Single / HoH / MFS)</td>
                <td className="py-3 px-4 text-right text-gray-700">$12,000</td>
                <td className="py-3 px-4 text-right text-gray-700">$15,000</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Standard deduction (Joint / Surviving spouse)</td>
                <td className="py-3 px-4 text-right text-gray-700">$24,000</td>
                <td className="py-3 px-4 text-right text-gray-700">$30,000</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Dependent exemption</td>
                <td className="py-3 px-4 text-right text-gray-700">$4,000</td>
                <td className="py-3 px-4 text-right text-gray-700">$5,000</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Age-65+ retirement income exclusion (TY 2027+)</td>
                <td className="py-3 px-4 text-right text-gray-700">$65,000</td>
                <td className="py-3 px-4 text-right text-gray-700">$70,000</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Qualified overtime exclusion (TY 2026&ndash;2028)</td>
                <td className="py-3 px-4 text-right text-gray-700">None</td>
                <td className="py-3 px-4 text-right text-gray-700">$1,750</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Cash tip exclusion (TY 2026&ndash;2028)</td>
                <td className="py-3 px-4 text-right text-gray-700">None</td>
                <td className="py-3 px-4 text-right text-gray-700">$1,750</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Scope / methodology */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Scope &amp; methodology
        </h3>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
          <p>
            HB463 also authorizes further rate cuts (toward 3.99%),
            standard-deduction increases (toward $18k / $36k), and
            dependent-exemption increases (toward $6k) that fire only
            if revenue triggers are met. The dashboard models only the
            statutory changes above and assumes the triggers are
            <strong> not met</strong> in 2027.
          </p>
        </div>
      </div>

      {/* References and further reading */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          References
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">GA HB463</h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                <a
                  href="https://www.legis.ga.gov/api/legislation/document/20252026/249080"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Bill text
                </a>
              </li>
            </ul>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">Calculations</h4>
            <p className="text-sm text-gray-700">
              Powered by{' '}
              <a
                href="https://github.com/PolicyEngine/policyengine.py"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                policyengine
              </a>{' '}
              v4.4.4.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
