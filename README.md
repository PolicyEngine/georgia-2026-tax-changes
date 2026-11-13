# Georgia 2026 Tax Changes dashboard

Models the impact of Georgia's HB463 (2025-2026 session, signed 2026) — flat
income-tax rate cut, higher standard deduction and dependent exemption, new
overtime / tip exclusions (TY 2026-2028), and a higher age-65+ retirement
income exclusion (TY 2027+) — on households, statewide revenue, and Georgia's
14 congressional districts.

- **Frontend**: `frontend/` (Next.js / Tailwind), dev port `3010`
- **Inverse reform**: `reform_revert.json` reverts HB463 to pre-2026 parameter
  values; the dashboard pipeline runs simulations under this reform so the
  precomputed deltas show how Georgian households are affected by HB463 vs.
  pre-HB463 law.
- **Modal pipelines**: `scripts/modal_pipeline.py` (statewide aggregate),
  `scripts/modal_district_pipeline.py` (per-district), `scripts/compute_provisions.py`
  (waterfall — single-provision reverts, mirrors the NC governor dashboard).
- **Pre-computed CSVs / JSON**: `frontend/public/data/*.csv` + `example_households.json`
- **Dependency**: this dashboard expects HB463 to be merged into
  policyengine-us (PR #8306). Modal precompute runs will fail until then.

Live: TBD (Vercel project + appZoneRoutes entry to follow).

Where the household tab can calculate: it calls www.policyengine.org's
dashboard API, which answers pages on www.policyengine.org (this dashboard's
route there, once its `appZoneRoutes.ts` entry is deployed), the Vercel
project's own `<project>-policy-engine.vercel.app` host and its previews (from
the first deploy), and `localhost`. The short `<project>.vercel.app` host is
refused until the `appZoneRoutes.ts` entry naming it is deployed; there the
browser reads no answer, so the tab shows the shared-limit message and pauses
for a minute after each try.
