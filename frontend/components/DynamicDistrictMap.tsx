'use client';

// The South Carolina district visualization is a simple card grid — no
// browser-only deps — so we can re-export the component directly instead of
// loading it dynamically. The SCDistrictData type is re-exported so consumers
// that previously imported from this module continue to compile.
export { default } from './USDistrictChoroplethMap';
export type { SCDistrictData } from './USDistrictChoroplethMap';
