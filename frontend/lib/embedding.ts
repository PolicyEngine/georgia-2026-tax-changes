/**
 * Embedding utilities for iframe integration with policyengine.org
 *
 * This module provides:
 * 1. Hash-based parameter parsing (e.g., #country=us&income=50000)
 * 2. hashchange event listener to respond to URL changes
 * 3. postMessage communication to sync state with parent frame
 */

export interface HashParams {
  country?: string;
  income?: number;
  state?: string;
  age?: number;
  married?: boolean;
  dependents?: number[];
  tab?: 'policy' | 'impact' | 'aggregate';
}

/**
 * Parse hash parameters from URL hash string
 * @param hash - The URL hash string (with or without leading #)
 * @returns Parsed parameters object
 */
export function parseHashParams(hash: string = ''): HashParams {
  const hashString = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!hashString) return {};

  const params: HashParams = {};
  const searchParams = new URLSearchParams(hashString);

  const country = searchParams.get('country');
  if (country) params.country = country;

  const income = searchParams.get('income');
  if (income) {
    const parsed = parseInt(income, 10);
    if (!isNaN(parsed)) params.income = parsed;
  }

  const state = searchParams.get('state');
  if (state) params.state = state.toUpperCase();

  const age = searchParams.get('age');
  if (age) {
    const parsed = parseInt(age, 10);
    if (!isNaN(parsed)) params.age = parsed;
  }

  const married = searchParams.get('married');
  if (married) params.married = married === 'true' || married === '1';

  const dependents = searchParams.get('dependents');
  if (dependents) {
    const ages = dependents.split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n));
    if (ages.length > 0) params.dependents = ages;
  }

  const tab = searchParams.get('tab');
  if (tab === 'policy' || tab === 'impact' || tab === 'aggregate') {
    params.tab = tab;
  }

  return params;
}

/**
 * Get the country from the URL hash
 * @returns The country code (defaults to 'us')
 */
export function getCountryFromHash(): string {
  if (typeof window === 'undefined') return 'us';
  const params = parseHashParams(window.location.hash);
  return params.country || 'us';
}

/**
 * Build a hash string from parameters
 * @param params - Parameters to encode
 * @returns Hash string (without leading #)
 */
export function buildHashString(params: HashParams): string {
  const searchParams = new URLSearchParams();

  if (params.country) searchParams.set('country', params.country);
  if (params.income !== undefined) searchParams.set('income', String(params.income));
  if (params.state) searchParams.set('state', params.state);
  if (params.age !== undefined) searchParams.set('age', String(params.age));
  if (params.married !== undefined) searchParams.set('married', String(params.married));
  if (params.dependents && params.dependents.length > 0) {
    searchParams.set('dependents', params.dependents.join(','));
  }
  if (params.tab) searchParams.set('tab', params.tab);

  return searchParams.toString();
}

/**
 * Update the URL hash without triggering a page reload
 * @param params - Parameters to set in the hash
 */
export function updateHash(params: HashParams): void {
  if (typeof window === 'undefined') return;
  const hashString = buildHashString(params);
  const newHash = hashString ? `#${hashString}` : '';
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash || window.location.pathname);
    notifyParent(newHash);
  }
}

/**
 * Notify the parent frame of a hash change via postMessage
 * @param hash - The new hash string
 */
export function notifyParent(hash: string): void {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return; // Not in an iframe

  const hashWithoutPrefix = hash.startsWith('#') ? hash.slice(1) : hash;

  // Send hashchange message for compatibility with IframeContent component
  window.parent.postMessage(
    { type: 'hashchange', hash: hashWithoutPrefix },
    '*'
  );

  // Also send pathchange for alternative routing patterns
  window.parent.postMessage(
    { type: 'pathchange', path: hashWithoutPrefix ? `/${hashWithoutPrefix}` : '/' },
    '*'
  );
}

/**
 * Check if the app is running inside an iframe
 * @returns true if embedded in an iframe
 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return window.parent !== window;
}

/**
 * Send a message to the parent frame
 * @param type - Message type
 * @param data - Additional data to include
 */
export function sendMessageToParent(type: string, data: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  if (!isEmbedded()) return;

  window.parent.postMessage({ type, ...data }, '*');
}

/**
 * Notify parent that the dashboard is ready
 */
export function notifyReady(): void {
  sendMessageToParent('ready', { source: 'working-parents-tax-relief-act' });
}

/**
 * Notify parent of a state change
 * @param state - Current state to sync
 */
export function syncStateWithParent(state: HashParams): void {
  sendMessageToParent('statechange', { state });
}
