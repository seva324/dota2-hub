// @ts-nocheck
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { StatusBadge } from '@/components/StatusBadge';
import { formatMatchTime, formatRelativeCountdown, formatSeriesScore, getMatchStatusMeta } from '@/utils/format';

export function CompactMatchRow({ match, showScore = false, prioritizeTournament = false }) {
  const statusMeta = getMatchStatusMeta(match);
  const title = `${match.radiant_team_name || 'TBD'} vs ${match.dire_team_name || 'TBD'}`;
  const subtitle = prioritizeTournament
    ? `${match.series_type || 'BO3'} · ${formatMatchTime(match.start_time)}`
    : (match.tournament_name_cn || match.tournament_name || 'Unknown tournament');

  const sideMeta = showScore && match.radiant_score != null && match.dire_score != null
    ? formatSeriesScore(match.radiant_score, match.dire_score)
    : formatRelativeCountdown(match.start_time);

  const goToMatch = () => {
    const matchId = match.match_id || match.id;
    if (!matchId) return;
    Taro.navigateTo({ url: `/packages/match/pages/detail/index?matchId=${matchId}` });
  };

  return (
    <View className="summary-row summary-row-tappable" onClick={goToMatch}>
      <View className="stack summary-main">
        <Text className="summary-title">{title}</Text>
        <Text className="muted">{subtitle}</Text>
      </View>
      <View className="stack summary-side">
        <StatusBadge status={statusMeta.tone} label={statusMeta.label} />
        <Text className="muted">{sideMeta}</Text>
      </View>
    </View>
  );
}
