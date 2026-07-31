import { useCallback, useEffect, useState } from 'react';
import { parseHash, toHash, type RouteState } from '@/lib/hashRouter';

export interface UseHashRouteResult {
  route: RouteState;
  navigate: (route: RouteState, options?: { replace?: boolean }) => void;
  closeOverlay: () => void;
}

function readHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

export function useHashRoute(): UseHashRouteResult {
  const [route, setRoute] = useState<RouteState>(() => parseHash(readHash()));

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash(readHash()));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((next: RouteState, options?: { replace?: boolean }) => {
    const hash = toHash(next);
    if (options?.replace) {
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', hash);
      }
    } else {
      if (window.location.hash !== hash) {
        window.location.hash = hash;
      }
    }
    setRoute(next);
  }, []);

  const closeOverlay = useCallback(() => {
    navigate({ page: route.page, overlay: null }, { replace: true });
  }, [navigate, route.page]);

  return { route, navigate, closeOverlay };
}
