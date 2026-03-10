// @ts-nocheck
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { formatMatchTime, formatRelativeCountdown, formatSeriesScore } from '@/utils/format';
import { TeamRow } from './TeamRow';

export function MatchCard({ match, showScore = false }) {
  const leftScore = 'radiant_score' in match ? match.radiant_score : null;
  const rightScore = 'dire_score' in match ? match.dire_score : null;

  const goTeam = (teamId) => {
    if (!teamId) return;
    Taro.navigateTo({ url: `/packages/team/pages/detail/index?teamId=${teamId}` });
  };

  const goMatch = () => {
    const matchId = 'match_id' in match ? match.match_id : '';
    if (!matchId) return;
    Taro.navigateTo({ url: `/packages/match/pages/detail/index?matchId=${matchId}` });
  };

  return (
    <View className="match-card section-card">
      <View className="row-between">
        <View className="stack">
          <Text className="section-title">{match.tournament_name || '未知赛事'}</Text>
          <Text className="page-subtitle">{match.series_type || 'BO3'}</Text>
        </View>
        <View className="stack match-time">
          <Text>{formatMatchTime(match.start_time)}</Text>
          <Text className="muted">{formatRelativeCountdown(match.start_time)}</Text>
        </View>
      </View>

      <View className="match-body">
        <View onClick={() => goTeam(match.radiant_team_id)}>
          <TeamRow logoUrl={match.radiant_team_logo} name={match.radiant_team_name} />
        </View>
        <View className="score-block" onClick={goMatch}>
          <Text className="score-main">
            {showScore ? formatSeriesScore(leftScore, rightScore) : 'VS'}
          </Text>
          <Text className="muted">{showScore ? '查看对局' : '点击详情'}</Text>
        </View>
        <View onClick={() => goTeam(match.dire_team_id)}>
          <TeamRow logoUrl={match.dire_team_logo} name={match.dire_team_name} align="right" />
        </View>
      </View>
    </View>
  );
}
