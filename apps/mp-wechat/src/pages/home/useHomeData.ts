// @ts-nocheck
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import { fetchMpHome } from '@/services/api';
import { readCache, writeCache } from '@/services/cache';

const HOME_CACHE_KEY = 'mp-home:v1';
const HOME_CACHE_TTL_MS = 60 * 1000;

export function useHomeData() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const nextPayload = await fetchMpHome();
      setPayload(nextPayload);
      setError('');
      writeCache(HOME_CACHE_KEY, nextPayload, HOME_CACHE_TTL_MS);
    } catch (loadError) {
      if (!payload) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load home data');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      Taro.stopPullDownRefresh();
    }
  };

  useEffect(() => {
    const cached = readCache(HOME_CACHE_KEY);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      void load({ silent: true });
      return;
    }

    void load();
  }, []);

  usePullDownRefresh(() => {
    void load({ silent: true });
  });

  const quickTeams = useMemo(() => {
    const teamMap = new Map();
    for (const match of payload?.upcoming || []) {
      const candidates = [
        { team_id: match.radiant_team_id, name: match.radiant_team_name, name_cn: null },
        { team_id: match.dire_team_id, name: match.dire_team_name, name_cn: null },
      ];
      for (const team of candidates) {
        const key = team.team_id || team.name;
        if (!key || teamMap.has(key)) continue;
        teamMap.set(key, team);
        if (teamMap.size >= 6) break;
      }
      if (teamMap.size >= 6) break;
    }
    return Array.from(teamMap.values());
  }, [payload]);

  return {
    payload,
    loading,
    refreshing,
    error,
    reload: () => load({ silent: true }),
    quickTeams,
  };
}
