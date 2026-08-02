import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useHashRoute } from '@/hooks/useHashRoute';

function setHash(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

describe('useHashRoute', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes from the current hash', () => {
    window.location.hash = '#/tournaments';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toEqual({ page: 'tournaments', overlay: null });
  });

  it('parses a deep link from the initial hash', () => {
    window.location.hash = '#/match/7777';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route.page).toBe('match');
    expect(result.current.route.matchId).toBe('7777');
  });

  it('updates on hashchange events', () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => setHash('#/teams'));
    expect(result.current.route).toEqual({ page: 'teams', overlay: null });
  });

  it('clears the overlay when navigating back to a top-level hash', () => {
    window.location.hash = '#/player/898754153';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route.overlay).toEqual({ type: 'player', accountId: '898754153' });
    act(() => setHash('#/'));
    expect(result.current.route).toEqual({ page: 'home', overlay: null });
  });

  it('navigate sets the hash', () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      result.current.navigate({ page: 'matches', overlay: null }, { replace: false });
    });
    expect(window.location.hash).toBe('#/matches');
    expect(result.current.route).toEqual({ page: 'matches', overlay: null });
  });

  it('closeOverlay returns to the home hash', () => {
    window.location.hash = '#/home/match/90001';
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current.closeOverlay());
    expect(window.location.hash).toBe('#/');
    expect(result.current.route).toEqual({ page: 'home', overlay: null });
  });

  it('unsubscribes the listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHashRoute());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });
});
