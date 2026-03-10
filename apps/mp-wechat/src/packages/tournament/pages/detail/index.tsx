// @ts-nocheck
import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { SeriesCard } from '@/components/SeriesCard';
import { StatusBadge } from '@/components/StatusBadge';
import { fetchMpTournamentDetail } from '@/services/api';
import {
  formatDateRange,
  formatPrizePool,
  getTournamentStatusMeta,
} from '@/utils/format';

const PAGE_SIZE = 10;

export default function TournamentDetailPage() {
  const router = useRouter();
  const tournamentId = String(router.params.tournamentId || '');
  const [tournament, setTournament] = useState(null);
  const [series, setSeries] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = async (nextOffset, append) => {
    if (!tournamentId) {
      setError('Tournament id is required');
      setLoading(false);
      return;
    }

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetchMpTournamentDetail(tournamentId, nextOffset, PAGE_SIZE);
      const items = response.items || [];
      setTournament(response.tournament || null);
      setSeries((current) => (append ? [...current, ...items] : items));
      setOffset(nextOffset + items.length);
      setHasMore(Boolean(response.pagination?.hasMore));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load tournament detail');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(0, false);
  }, [tournamentId]);

  const statusMeta = getTournamentStatusMeta(tournament);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">{tournament?.name_cn || tournament?.name || 'Tournament Detail'}</Text>
        {tournament?.name_cn && tournament?.name_cn !== tournament?.name ? (
          <Text className="page-subtitle">{tournament?.name}</Text>
        ) : (
          <Text className="page-subtitle">Paginated series view for mini program usage</Text>
        )}
      </View>

      {tournament ? (
        <View className="section-card">
          <View className="section-heading">
            <View className="stack">
              <Text className="section-title">Tournament Metadata</Text>
              <Text className="muted">{tournament.location || 'Global'}</Text>
            </View>
            <StatusBadge status={statusMeta.tone} label={statusMeta.label} />
          </View>

          <View className="list-gap compact-meta">
            <View className="summary-row">
              <Text className="muted">Prize Pool</Text>
              <Text>{formatPrizePool(tournament.prize_pool, tournament.prize_pool_usd)}</Text>
            </View>
            <View className="summary-row">
              <Text className="muted">Dates</Text>
              <Text>{formatDateRange(tournament.start_time, tournament.end_time)}</Text>
            </View>
            <View className="summary-row">
              <Text className="muted">Status</Text>
              <Text>{tournament.status || 'Upcoming'}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <LoadState loading={loading} error={error} empty={!loading && series.length === 0} emptyText="No series found for this tournament" />

      {!loading && !error ? (
        <>
          <View className="list-gap">
            {series.map((item) => (
              <SeriesCard key={item.series_id} series={item} />
            ))}
          </View>

          {hasMore ? (
            <Button className="button-secondary" loading={loadingMore} onClick={() => void load(offset, true)}>
              Load 10 more series
            </Button>
          ) : null}

          {!tournamentId ? (
            <Button className="button-secondary" onClick={() => Taro.navigateBack()}>
              Back
            </Button>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
