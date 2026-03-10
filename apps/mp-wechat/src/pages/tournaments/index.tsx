// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { fetchTournaments } from '@/services/api';
import { formatMatchTime } from '@/utils/format';

export default function TournamentsPage() {
  const [allTournaments, setAllTournaments] = useState([]);
  const [showTierSOnly, setShowTierSOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetchTournaments();
        if (!active) return;
        setAllTournaments(response.tournaments || []);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '赛事列表加载失败');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const tournaments = useMemo(() => {
    return (allTournaments || []).filter((item) => {
      const tier = String(item.tier || '').toUpperCase();
      return showTierSOnly ? tier === 'S' : tier !== 'S';
    });
  }, [allTournaments, showTierSOnly]);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">赛事列表</Text>
        <Text className="page-subtitle">先保留后端排序规则，前端只做轻筛选</Text>
      </View>

      <View className="section-card">
        <View className="quick-grid">
          <Button className={showTierSOnly ? 'button-primary' : 'button-secondary'} onClick={() => setShowTierSOnly(true)}>
            T1 赛事
          </Button>
          <Button className={!showTierSOnly ? 'button-primary' : 'button-secondary'} onClick={() => setShowTierSOnly(false)}>
            其他赛事
          </Button>
        </View>
      </View>

      <LoadState loading={loading} error={error} empty={!loading && tournaments.length === 0} emptyText="当前筛选下暂无赛事" />

      {!loading && !error ? (
        <View className="list-gap">
          {tournaments.map((item) => (
            <View
              key={item.id}
              className="section-card"
              onClick={() => Taro.navigateTo({ url: `/packages/tournament/pages/detail/index?tournamentId=${item.id}` })}
            >
              <View className="row-between">
                <View className="stack">
                  <Text className="section-title">{item.name}</Text>
                  <Text className="muted">{item.location || '未知地区'}</Text>
                </View>
                <Text className="chip">{item.status || 'unknown'}</Text>
              </View>
              <Text className="muted">开始时间：{formatMatchTime(item.start_time)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
