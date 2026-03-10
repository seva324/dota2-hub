// @ts-nocheck
import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { SeriesCard } from '@/components/SeriesCard';
import { fetchTournamentDetail } from '@/services/api';
import { formatMatchTime } from '@/utils/format';

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
      setError('缺少赛事 ID');
      setLoading(false);
      return;
    }

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetchTournamentDetail(tournamentId, nextOffset, PAGE_SIZE);
      setTournament(response.tournament || null);
      setSeries((current) => (append ? [...current, ...(response.series || [])] : response.series || []));
      setOffset(nextOffset + (response.series || []).length);
      setHasMore(Boolean(response.pagination?.hasMore));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '赛事详情加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(0, false);
  }, [tournamentId]);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">{tournament?.name || '赛事详情'}</Text>
        <Text className="page-subtitle">{tournament?.location || '未知地区'} · {tournament?.status || 'unknown'}</Text>
      </View>

      {tournament ? (
        <View className="section-card">
          <Text className="section-title">赛事信息</Text>
          <Text className="muted">开赛：{formatMatchTime(tournament.start_time)}</Text>
          <Text className="muted">奖金：{tournament.prize_pool || (tournament.prize_pool_usd ? `$${tournament.prize_pool_usd}` : '待补充')}</Text>
        </View>
      ) : null}

      <LoadState loading={loading} error={error} empty={!loading && series.length === 0} emptyText="这个赛事暂时还没有系列赛数据" />

      {!loading && !error ? (
        <>
          <View className="list-gap">
            {series.map((item) => (
              <SeriesCard key={item.series_id} series={item} />
            ))}
          </View>
          {hasMore ? (
            <Button className="button-secondary" loading={loadingMore} onClick={() => void load(offset, true)}>
              加载更多系列赛
            </Button>
          ) : null}
          {!tournamentId ? (
            <Button className="button-secondary" onClick={() => Taro.navigateBack()}>
              返回
            </Button>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
