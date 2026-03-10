// @ts-nocheck
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { CompactMatchRow } from '@/components/CompactMatchRow';
import { HeroLiveCard } from '@/components/HeroLiveCard';
import { LoadState } from '@/components/LoadState';
import { NewsListCard } from '@/components/NewsListCard';
import { QuickEntryGrid } from '@/components/QuickEntryGrid';
import { TournamentListCard } from '@/components/TournamentListCard';
import { useHomeData } from './useHomeData';

export default function HomePage() {
  const { payload, loading, refreshing, error, reload, quickTeams } = useHomeData();

  const upcoming = (payload?.upcoming || []).slice(0, 4);
  const tournaments = (payload?.tournaments || []).slice(0, 4);
  const news = (payload?.news || []).slice(0, 3);

  return (
    <View className="app-page">
      <View className="page-header home-hero">
        <View className="stack home-hero-copy">
          <Text className="page-title">刀刀对局雷达站</Text>
          <Text className="page-subtitle">
            Compact Dota 2 radar built for quick checks: upcoming first, live when it matters.
          </Text>
        </View>
        <View className="stack home-hero-meta">
          <Text className="hero-number">{payload?.liveMatchCount || 0}</Text>
          <Text className="muted">tracked live</Text>
        </View>
      </View>

      {refreshing ? (
        <View className="refresh-hint">
          <Text className="muted">Refreshing latest data…</Text>
        </View>
      ) : null}

      <LoadState loading={loading} error={error} empty={!loading && !payload} emptyText="No home data available" />

      {!loading && !error && payload ? (
        <>
          <HeroLiveCard heroLive={payload.heroLive} liveMatchCount={payload.liveMatchCount} />

          <View className="section-card">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Upcoming Matches</Text>
                <Text className="muted">Next 2 days, optimized for a quick scan</Text>
              </View>
              <Button className="button-secondary button-small" onClick={() => Taro.switchTab({ url: '/pages/upcoming/index' })}>
                Load more
              </Button>
            </View>
            <View className="list-gap">
              {upcoming.map((match) => (
                <CompactMatchRow key={String(match.id)} match={match} />
              ))}
            </View>
          </View>

          <TournamentListCard tournaments={tournaments} />

          <View className="section-card">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Important Now</Text>
                <Text className="muted">Live spotlight first, then closest fixtures</Text>
              </View>
            </View>
            <View className="list-gap">
              {upcoming.slice(0, 3).map((match) => (
                <CompactMatchRow key={`important-${String(match.id)}`} match={match} prioritizeTournament />
              ))}
            </View>
          </View>

          <QuickEntryGrid teams={quickTeams} />

          <NewsListCard items={news} />

          <View className="section-card">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Manual Refresh</Text>
                <Text className="muted">Pull down to refresh or tap below when you want a fresh network fetch</Text>
              </View>
            </View>
            <Button className="button-secondary" onClick={reload}>
              Refresh home data
            </Button>
          </View>
        </>
      ) : null}
    </View>
  );
}
