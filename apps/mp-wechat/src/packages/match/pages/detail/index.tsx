// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { LoadState } from '@/components/LoadState';
import { StatusBadge } from '@/components/StatusBadge';
import { TeamRow } from '@/components/TeamRow';
import { fetchMpMatchDetail } from '@/services/api';
import { formatDuration, formatMatchTime, getMatchPayloadStatusMeta } from '@/utils/format';

function isRadiantPlayer(player) {
  return Number(player?.player_slot ?? 256) < 128;
}

function getWinnerLabel(payload) {
  if (payload?.radiant_win === true || payload?.radiant_win === 1) {
    return payload?.radiant_team?.name || 'Radiant';
  }
  if (payload?.radiant_win === false || payload?.radiant_win === 0) {
    return payload?.dire_team?.name || 'Dire';
  }
  return 'TBD';
}

function getDraftRows(picksBans = []) {
  return picksBans.slice(0, 12).map((entry, index) => {
    const teamValue = String(entry?.team ?? '').toLowerCase();
    const side = teamValue === '1' || teamValue === 'dire' ? 'Dire' : 'Radiant';
    const action = entry?.is_pick === true || entry?.is_pick === 1 ? 'Pick' : 'Ban';
    return {
      key: `${entry?.hero_id ?? 'hero'}-${index}`,
      side,
      action,
      heroId: entry?.hero_id ?? '?',
      order: typeof entry?.order === 'number' ? entry.order + 1 : index + 1,
    };
  });
}

function PlayerRow({ player }) {
  return (
    <View className="game-row">
      <View className="stack summary-main">
        <Text className="game-title">{player?.personaname || player?.account_id || 'Unknown player'}</Text>
        <Text className="muted">Hero #{player?.hero_id ?? '?'}</Text>
      </View>
      <View className="stack game-meta">
        <Text>{player?.kills ?? 0}/{player?.deaths ?? 0}/{player?.assists ?? 0}</Text>
        <Text className="muted">
          {player?.net_worth ? `${Math.round(player.net_worth / 1000)}k net` : 'Net worth --'}
        </Text>
      </View>
    </View>
  );
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
        setError('Match id is required');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const response = await fetchMpMatchDetail(matchId);
        if (!active) return;
        setPayload(response);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load match detail');
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
  const draftRows = useMemo(() => getDraftRows(payload?.picks_bans || []), [payload]);
  const statusMeta = getMatchPayloadStatusMeta(payload);

  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">Match Detail</Text>
        <Text className="page-subtitle">Match ID: {matchId || '--'}</Text>
      </View>

      <LoadState loading={loading} error={error} empty={!loading && !payload} emptyText="Match detail not found" />

      {!loading && !error && payload ? (
        <>
          <View className="section-card section-card-live">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Scoreboard</Text>
                <Text className="muted">{formatMatchTime(payload.start_time)} · {formatDuration(payload.duration)}</Text>
              </View>
              <StatusBadge status={statusMeta.tone} label={statusMeta.label} />
            </View>

            <View className="match-body">
              <TeamRow logoUrl={payload?.radiant_team?.logo_url} name={payload?.radiant_team?.name || 'Radiant'} />
              <View className="score-block">
                <Text className="score-main">{payload?.radiant_score ?? 0} : {payload?.dire_score ?? 0}</Text>
                <Text className="muted">Winner: {getWinnerLabel(payload)}</Text>
              </View>
              <TeamRow logoUrl={payload?.dire_team?.logo_url} name={payload?.dire_team?.name || 'Dire'} align="right" />
            </View>
          </View>

          <View className="section-card">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Match Info</Text>
                <Text className="muted">Compact view of timing and result</Text>
              </View>
            </View>
            <View className="list-gap compact-meta">
              <View className="summary-row">
                <Text className="muted">Started</Text>
                <Text>{formatMatchTime(payload.start_time)}</Text>
              </View>
              <View className="summary-row">
                <Text className="muted">Duration</Text>
                <Text>{formatDuration(payload.duration)}</Text>
              </View>
              <View className="summary-row">
                <Text className="muted">Winner</Text>
                <Text>{getWinnerLabel(payload)}</Text>
              </View>
            </View>
          </View>

          <View className="section-card">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Picks / Bans</Text>
                <Text className="muted">Rendered only when draft data exists</Text>
              </View>
            </View>
            {draftRows.length > 0 ? (
              <View className="list-gap">
                {draftRows.map((row) => (
                  <View key={row.key} className="summary-row">
                    <View className="stack summary-main">
                      <Text className="summary-title">{row.side} {row.action}</Text>
                      <Text className="muted">Order {row.order}</Text>
                    </View>
                    <Text>Hero #{row.heroId}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <LoadState empty emptyText="No picks or bans data for this match" />
            )}
          </View>

          <View className="section-card">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Radiant Players</Text>
                <Text className="muted">KDA and hero snapshot</Text>
              </View>
            </View>
            <View className="list-gap">
              {radiantPlayers.length > 0 ? radiantPlayers.map((player, index) => (
                <PlayerRow key={`${player?.account_id || 'radiant'}-${index}`} player={player} />
              )) : <LoadState empty emptyText="No radiant player data" />}
            </View>
          </View>

          <View className="section-card">
            <View className="section-heading">
              <View className="stack">
                <Text className="section-title">Dire Players</Text>
                <Text className="muted">KDA and hero snapshot</Text>
              </View>
            </View>
            <View className="list-gap">
              {direPlayers.length > 0 ? direPlayers.map((player, index) => (
                <PlayerRow key={`${player?.account_id || 'dire'}-${index}`} player={player} />
              )) : <LoadState empty emptyText="No dire player data" />}
            </View>
          </View>

          <Button className="button-secondary" onClick={() => Taro.navigateBack()}>
            Back
          </Button>
        </>
      ) : null}
    </View>
  );
}
