// @ts-nocheck
import { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { MatchCard } from '@/components/MatchCard';
import { fetchMpUpcoming } from '@/services/api';

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
        const response = await fetchMpUpcoming(3, 0, 20);
        if (!active) return;
        setMatches(response.items || []);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load upcoming matches');
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
        <Text className="page-title">Upcoming</Text>
        <Text className="page-subtitle">Next fixtures from the mini-program optimized API</Text>
      </View>

      <LoadState loading={loading} error={error} empty={!loading && matches.length === 0} emptyText="No matches in the next 3 days" />

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
