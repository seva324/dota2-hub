// @ts-nocheck
import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Image, Text, View } from '@tarojs/components';
import { CompactMatchRow } from '@/components/CompactMatchRow';
import { LoadState } from '@/components/LoadState';
import { StatusBadge } from '@/components/StatusBadge';
import { fetchMpTeamDetail } from '@/services/api';
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
      setError('Team id is required');
      setLoading(false);
      return;
    }

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetchMpTeamDetail(teamId, nextOffset, PAGE_SIZE);
      const items = response.items || [];
      setPayload(response);
      setRecentMatches((current) => (append ? [...current, ...items] : items));
      setOffset(nextOffset + items.length);
      setHasMore(Boolean(response.pagination?.hasMore));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load team detail');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(0, false);
  }, [teamId]);

  const team = payload?.team;

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">{team?.name_cn || team?.name || 'Team Detail'}</Text>
        <Text className="page-subtitle">
          {team?.region || 'Unknown region'} · Win rate {getWinRateLabel(payload?.stats?.winRate)}
        </Text>
      </View>

      {team ? (
        <View className="section-card team-hero-card">
          <View className="team-hero-top">
            <View className="team-hero-brand">
              {team.logo_url ? (
                <Image className="team-logo-large" src={team.logo_url} mode="aspectFit" />
              ) : (
                <View className="team-logo-large team-logo team-logo-fallback" />
              )}
              <View className="stack summary-main">
                <Text className="section-title">{team.name_cn || team.name}</Text>
                {team.name_cn && team.name_cn !== team.name ? (
                  <Text className="muted">{team.name}</Text>
                ) : null}
                <Text className="muted">{team.region || 'Unknown region'}</Text>
              </View>
            </View>
            <StatusBadge status={payload?.nextMatch ? 'upcoming' : 'completed'} label={payload?.nextMatch ? 'Next scheduled' : 'No next match'} />
          </View>

          <View className="stats-grid">
            <View className="stats-item">
              <Text className="stats-value">{payload?.stats?.wins ?? 0}</Text>
              <Text className="muted">Wins</Text>
            </View>
            <View className="stats-item">
              <Text className="stats-value">{payload?.stats?.losses ?? 0}</Text>
              <Text className="muted">Losses</Text>
            </View>
            <View className="stats-item">
              <Text className="stats-value">{getWinRateLabel(payload?.stats?.winRate)}</Text>
              <Text className="muted">Win rate</Text>
            </View>
          </View>
        </View>
      ) : null}

      {payload?.nextMatch ? (
        <View className="section-card">
          <View className="section-heading">
            <View className="stack">
              <Text className="section-title">Next Match</Text>
              <Text className="muted">Upcoming scheduled series</Text>
            </View>
          </View>
          <CompactMatchRow match={payload.nextMatch} prioritizeTournament />
        </View>
      ) : null}

      {payload ? (
        <View className="section-card">
          <View className="section-heading">
            <View className="stack">
              <Text className="section-title">Team Summary</Text>
              <Text className="muted">Current metrics and tracked roster context</Text>
            </View>
          </View>

          <View className="list-gap compact-meta">
            <View className="summary-row">
              <Text className="muted">Active squad</Text>
              <Text className="summary-inline-text">
                {payload.activeSquad.map((player) => player.name).filter(Boolean).join(' / ') || 'No roster data'}
              </Text>
            </View>
            <View className="summary-row">
              <Text className="muted">Top heroes</Text>
              <Text className="summary-inline-text">
                {payload.topHeroes.map((hero) => `#${hero.hero_id} (${hero.matches})`).join(' · ') || 'No hero trend data'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View className="section-card">
        <View className="section-heading">
          <View className="stack">
            <Text className="section-title">Recent Matches</Text>
            <Text className="muted">Compact history view with stable pagination</Text>
          </View>
        </View>

        <LoadState loading={loading} error={error} empty={!loading && recentMatches.length === 0} emptyText="No recent matches found" />

        {!loading && !error ? (
          <>
            <View className="list-gap">
              {recentMatches.map((match) => (
                <CompactMatchRow key={match.match_id} match={match} showScore prioritizeTournament />
              ))}
            </View>
            {hasMore ? (
              <Button className="button-secondary" loading={loadingMore} onClick={() => void load(offset, true)}>
                Load more matches
              </Button>
            ) : null}
          </>
        ) : null}
      </View>

      {!teamId ? (
        <Button className="button-secondary" onClick={() => Taro.navigateBack()}>
          Back
        </Button>
      ) : null}
    </View>
  );
}
