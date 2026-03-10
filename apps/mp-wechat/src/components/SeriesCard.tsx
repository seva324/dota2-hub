// @ts-nocheck
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { formatDuration, formatMatchTime, formatSeriesScore } from '@/utils/format';
import { TeamRow } from './TeamRow';

export function SeriesCard({ series }) {
  return (
    <View className="section-card">
      <View className="row-between">
        <View className="stack">
          <Text className="section-title">{series.stage || 'Main Stage'}</Text>
          <Text className="muted">{series.series_type || 'BO3'}</Text>
        </View>
        <View className="chip">{formatSeriesScore(series.radiant_score, series.dire_score)}</View>
      </View>

      <View className="match-body">
        <View
          onClick={() =>
            series.radiant_team_id &&
            Taro.navigateTo({ url: `/packages/team/pages/detail/index?teamId=${series.radiant_team_id}` })
          }
        >
          <TeamRow logoUrl={series.radiant_team_logo} name={series.radiant_team_name} />
        </View>
        <View className="score-block">
          <Text className="score-main">系列赛</Text>
        </View>
        <View
          onClick={() =>
            series.dire_team_id &&
            Taro.navigateTo({ url: `/packages/team/pages/detail/index?teamId=${series.dire_team_id}` })
          }
        >
          <TeamRow logoUrl={series.dire_team_logo} name={series.dire_team_name} align="right" />
        </View>
      </View>

      <View className="list-gap">
        {series.games.map((game, index) => (
          <View
            key={game.match_id}
            className="game-row"
            onClick={() => Taro.navigateTo({ url: `/packages/match/pages/detail/index?matchId=${game.match_id}` })}
          >
            <View className="stack">
              <Text className="game-title">第 {index + 1} 局</Text>
              <Text className="muted">{formatMatchTime(game.start_time)}</Text>
            </View>
            <View className="stack game-meta">
              <Text>{formatSeriesScore(game.radiant_score, game.dire_score)}</Text>
              <Text className="muted">{formatDuration(game.duration)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
