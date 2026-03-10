// @ts-nocheck
import { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { MatchCard } from '@/components/MatchCard';
import { LoadState } from '@/components/LoadState';
import { fetchUpcoming } from '@/services/api';

export default function UpcomingPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetchUpcoming(3);
        if (!active) return;
        setMatches(response.upcoming || []);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '比赛预告加载失败');
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
        <Text className="page-title">近期预告</Text>
        <Text className="page-subtitle">沿用 `/api/upcoming`，优先做轻量浏览</Text>
      </View>

      <LoadState loading={loading} error={error} empty={!loading && matches.length === 0} emptyText="未来 3 天暂无赛程" />

      {!loading && !error ? (
        <View className="list-gap">
          {matches.map((match) => (
            <MatchCard key={String(match.id)} match={match} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
