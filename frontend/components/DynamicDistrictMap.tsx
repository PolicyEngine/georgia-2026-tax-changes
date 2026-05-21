'use client';

// The Georgia district visualization renders into a Mercator-projected
// choropleth — no browser-only deps that need lazy loading — so we can
// re-export the component directly. The GADistrictData type is
// re-exported so consumers that import the type from this module
// continue to compile.
export { default } from './USDistrictChoroplethMap';
export type { GADistrictData } from './USDistrictChoroplethMap';
