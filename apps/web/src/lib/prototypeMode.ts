export const PROTOTYPE_SEARCH_PARAM = 'prototype';

export function usePrototypeMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(PROTOTYPE_SEARCH_PARAM) === '1';
}
