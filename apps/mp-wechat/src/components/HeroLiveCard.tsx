// @ts-nocheck
import { Text, View } from '@tarojs/components';
import { StatusBadge } from '@/components/StatusBadge';

export function HeroLiveCard({ heroLive, liveMatchCount }) {
  if (!heroLive) return null;

  const teams = heroLive.teams || [];
  const title = teams.length >= 2
    ? `${teams[0].name || 'Team A'} vs ${teams[1].name || 'Team B'}`
    : (heroLive.leagueName || 'Live match');

  return (
    <View className="section-card section-card-live">
      <View className="section-heading">
        <View className="stack">
          <Text className="section-title">Live Spotlight</Text>
          <Text className="muted">{heroLive.leagueName || 'Tracked live series'}</Text>
        </View>
        <StatusBadge status="live" label={`${liveMatchCount} live`} />
      </View>
      <View className="live-hero-card">
        <Text className="live-hero-title">{title}</Text>
        <Text className="live-hero-score">{heroLive.seriesScore || 'Live'}</Text>
        <Text className="muted">Best of {heroLive.bestOf || '3'} · {heroLive.maps?.length || 0} maps tracked</Text>
      </View>
    </View>
  );
}
