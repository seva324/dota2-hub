// @ts-nocheck
import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { fetchTournaments, fetchUpcoming } from '@/services/api';
import { formatMatchTime } from '@/utils/format';
import { LoadState } from '@/components/LoadState';

export default function HomePage() {
  const [upcoming, setUpcoming] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [upcomingResponse, tournamentsResponse] = await Promise.all([
          fetchUpcoming(2),
          fetchTournaments(),
        ]);
        if (!active) return;
        setUpcoming(upcomingResponse.upcoming.slice(0, 3));
        setTournaments((tournamentsResponse.tournaments || []).slice(0, 4));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '首页数据加载失败');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">刀刀对局雷达站</Text>
        <Text className="page-subtitle">沿用 dota2-hub 数据源的微信小程序 MVP</Text>
      </View>

      <LoadState loading={loading} error={error} />

      {!loading && !error ? (
        <>
          <View className="section-card">
            <Text className="section-title">MVP 导航</Text>
            <View className="quick-grid">
              <Button className="button-primary" onClick={() => Taro.switchTab({ url: '/pages/upcoming/index' })}>
                近期预告
              </Button>
              <Button className="button-secondary" onClick={() => Taro.switchTab({ url: '/pages/tournaments/index' })}>
                赛事列表
              </Button>
            </View>
          </View>

          <View className="section-card">
            <View className="row-between">
              <Text className="section-title">最近将开赛</Text>
              <Text className="muted">{upcoming.length} 场</Text>
            </View>
            <View className="list-gap">
              {upcoming.map((item) => (
                <View key={String(item.id)} className="summary-row">
                  <View className="stack">
                    <Text>{item.radiant_team_name} vs {item.dire_team_name}</Text>
                    <Text className="muted">{item.tournament_name || '未知赛事'}</Text>
                  </View>
                  <Text className="muted">{formatMatchTime(item.start_time)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="section-card">
            <View className="row-between">
              <Text className="section-title">重点赛事</Text>
              <Text className="muted">{tournaments.length} 项</Text>
            </View>
            <View className="list-gap">
              {tournaments.map((item) => (
                <View
                  key={item.id}
                  className="summary-row"
                  onClick={() => Taro.navigateTo({ url: `/packages/tournament/pages/detail/index?tournamentId=${item.id}` })}
                >
                  <View className="stack">
                    <Text>{item.name}</Text>
                    <Text className="muted">{item.location || '未知地区'}</Text>
                  </View>
                  <Text className="chip">{item.status || 'unknown'}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}
