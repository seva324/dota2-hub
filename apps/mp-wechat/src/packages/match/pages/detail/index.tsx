// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { fetchMatchDetail } from '@/services/api';
import { formatDuration, formatMatchTime } from '@/utils/format';

function isRadiantPlayer(player) {
  return Number(player.player_slot ?? 256) < 128;
}

export default function MatchDetailPage() {
  const router = useRouter();
  const matchId = String(router.params.matchId || '');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!matchId) {
        setError('缺少对局 ID');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const response = await fetchMatchDetail(matchId);
        if (!active) return;
        setPayload(response);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '对局详情加载失败');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [matchId]);

  const radiantPlayers = useMemo(() => (payload?.players || []).filter(isRadiantPlayer), [payload]);
  const direPlayers = useMemo(() => (payload?.players || []).filter((player) => !isRadiantPlayer(player)), [payload]);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">对局详情</Text>
        <Text className="page-subtitle">Match ID: {matchId || '--'}</Text>
      </View>

      <LoadState loading={loading} error={error} empty={!loading && !payload} emptyText="未找到这场比赛的数据" />

      {!loading && !error && payload ? (
        <>
          <View className="section-card">
            <Text className="section-title">
              {payload.radiant_team?.name || 'Radiant'} {payload.radiant_score ?? 0} : {payload.dire_score ?? 0} {payload.dire_team?.name || 'Dire'}
            </Text>
            <Text className="muted">开始时间：{formatMatchTime(payload.start_time)}</Text>
            <Text className="muted">比赛时长：{formatDuration(payload.duration)}</Text>
            <Text className="muted">胜者：{payload.radiant_win ? payload.radiant_team?.name || 'Radiant' : payload.dire_team?.name || 'Dire'}</Text>
          </View>

          <View className="section-card">
            <Text className="section-title">Ban/Pick 摘要</Text>
            <Text className="muted">
              {(payload.picks_bans || [])
                .slice(0, 10)
                .map((item) => `${item.is_pick ? 'Pick' : 'Ban'} #${item.hero_id ?? '?'}`)
                .join(' / ') || '暂无草稿数据'}
            </Text>
          </View>

          <View className="section-card">
            <Text className="section-title">Radiant 阵容</Text>
            <View className="list-gap">
              {radiantPlayers.map((player, index) => (
                <View key={`${player.account_id || 'r'}-${index}`} className="game-row">
                  <Text>{player.personaname || player.account_id || 'Unknown'}</Text>
                  <Text className="muted">
                    #{player.hero_id ?? '?'} · {player.kills ?? 0}/{player.deaths ?? 0}/{player.assists ?? 0}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View className="section-card">
            <Text className="section-title">Dire 阵容</Text>
            <View className="list-gap">
              {direPlayers.map((player, index) => (
                <View key={`${player.account_id || 'd'}-${index}`} className="game-row">
                  <Text>{player.personaname || player.account_id || 'Unknown'}</Text>
                  <Text className="muted">
                    #{player.hero_id ?? '?'} · {player.kills ?? 0}/{player.deaths ?? 0}/{player.assists ?? 0}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Button className="button-secondary" onClick={() => Taro.navigateBack()}>
            返回上一页
          </Button>
        </>
      ) : null}
    </View>
  );
}
