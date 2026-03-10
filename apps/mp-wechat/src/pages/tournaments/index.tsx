// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { StatusBadge } from '@/components/StatusBadge';
import { fetchMpTournaments } from '@/services/api';
import {
  formatDateRange,
  formatPrizePool,
  getTournamentStatusMeta,
} from '@/utils/format';

const PAGE_SIZE = 20;

export default function TournamentsPage() {
  const [allTournaments, setAllTournaments] = useState([]);
  const [filter, setFilter] = useState('active');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = async (nextOffset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetchMpTournaments(nextOffset, PAGE_SIZE);
      const items = response.items || [];
      setAllTournaments((current) => (append ? [...current, ...items] : items));
      setOffset(nextOffset + items.length);
      setHasMore(Boolean(response.pagination?.hasMore));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(0, false);
  }, []);

  const tournaments = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return (allTournaments || []).filter((item) => {
      const statusMeta = getTournamentStatusMeta(item);
      if (filter === 'active') return statusMeta.tone === 'live';
      if (filter === 'upcoming') {
        return statusMeta.tone === 'upcoming' && (item.start_time || now) >= now - 86400;
      }
      return true;
    });
  }, [allTournaments, filter]);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">Tournaments</Text>
        <Text className="page-subtitle">Browse active and upcoming events with native page navigation.</Text>
      </View>

      <View className="section-card">
        <View className="quick-grid quick-grid-compact">
          <Button className={filter === 'active' ? 'button-primary' : 'button-secondary'} onClick={() => setFilter('active')}>
            Active
          </Button>
          <Button className={filter === 'upcoming' ? 'button-primary' : 'button-secondary'} onClick={() => setFilter('upcoming')}>
            Upcoming
          </Button>
        </View>
        <Button className={filter === 'all' ? 'button-primary' : 'button-secondary'} onClick={() => setFilter('all')}>
          All tournaments
        </Button>
      </View>

      <LoadState loading={loading} error={error} empty={!loading && tournaments.length === 0} emptyText="No tournaments in this view" />

      {!loading && !error ? (
        <>
          <View className="list-gap">
            {tournaments.map((item) => {
              const statusMeta = getTournamentStatusMeta(item);
              return (
                <View
                  key={item.id}
                  className="section-card section-card-compact"
                  onClick={() => Taro.navigateTo({ url: `/packages/tournament/pages/detail/index?tournamentId=${item.id}` })}
                >
                  <View className="section-heading">
                    <View className="stack summary-main">
                      <Text className="section-title">{item.name_cn || item.name}</Text>
                      {item.name_cn && item.name_cn !== item.name ? (
                        <Text className="muted">{item.name}</Text>
                      ) : null}
                    </View>
                    <StatusBadge status={statusMeta.tone} label={statusMeta.label} />
                  </View>

                  <View className="list-gap compact-meta">
                    <View className="summary-row">
                      <Text className="muted">Prize Pool</Text>
                      <Text>{formatPrizePool(item.prize_pool, item.prize_pool_usd)}</Text>
                    </View>
                    <View className="summary-row">
                      <Text className="muted">Location</Text>
                      <Text>{item.location || 'Global'}</Text>
                    </View>
                    <View className="summary-row">
                      <Text className="muted">Dates</Text>
                      <Text>{formatDateRange(item.start_time, item.end_time)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {hasMore ? (
            <Button className="button-secondary" loading={loadingMore} onClick={() => void load(offset, true)}>
              Load more tournaments
            </Button>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
