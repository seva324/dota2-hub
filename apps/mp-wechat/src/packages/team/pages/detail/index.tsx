// @ts-nocheck
import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { MatchCard } from '@/components/MatchCard';
import { fetchTeamDetail } from '@/services/api';
import { getWinRateLabel } from '@/utils/format';

const PAGE_SIZE = 5;

export default function TeamDetailPage() {
  const router = useRouter();
  const teamId = String(router.params.teamId || '');
  const [payload, setPayload] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = async (nextOffset, append) => {
    if (!teamId) {
      setError('缺少战队 ID');
      setLoading(false);
      return;
    }

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetchTeamDetail(teamId, nextOffset, PAGE_SIZE);
      setPayload(response);
      setRecentMatches((current) => (append ? [...current, ...(response.recentMatches || [])] : response.recentMatches || []));
      setOffset(nextOffset + (response.recentMatches || []).length);
      setHasMore(Boolean(response.pagination?.hasMore));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '战队详情加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(0, false);
  }, [teamId]);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">{payload?.team?.name || '战队详情'}</Text>
        <Text className="page-subtitle">{payload?.team?.region || '未知地区'} · 胜率 {getWinRateLabel(payload?.stats?.winRate)}</Text>
      </View>

      {payload?.nextMatch ? (
        <View>
          <Text className="section-title">下一场比赛</Text>
          <MatchCard match={payload.nextMatch} />
        </View>
      ) : null}

      {payload ? (
        <View className="section-card">
          <Text className="section-title">队伍概览</Text>
          <Text className="muted">近 90 天战绩：{payload.stats.wins} 胜 / {payload.stats.losses} 负</Text>
          <Text className="muted">活跃阵容：{payload.activeSquad.map((player) => player.name).filter(Boolean).join(' / ') || '待补充'}</Text>
          <Text className="muted">高频英雄：{payload.topHeroes.map((hero) => `#${hero.hero_id}`).join('、') || '待补充'}</Text>
        </View>
      ) : null}

      <Text className="section-title">近期比赛</Text>
      <LoadState loading={loading} error={error} empty={!loading && recentMatches.length === 0} emptyText="该战队暂无近期比赛" />

      {!loading && !error ? (
        <>
          <View className="list-gap">
            {recentMatches.map((match) => (
              <MatchCard key={match.match_id} match={match} showScore />
            ))}
          </View>
          {hasMore ? (
            <Button className="button-secondary" loading={loadingMore} onClick={() => void load(offset, true)}>
              加载更多战绩
            </Button>
          ) : null}
          {!teamId ? (
            <Button className="button-secondary" onClick={() => Taro.navigateBack()}>
              返回
            </Button>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
