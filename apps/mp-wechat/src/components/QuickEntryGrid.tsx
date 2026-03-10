// @ts-nocheck
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';

export function QuickEntryGrid({ teams }) {
  return (
    <View className="section-card">
      <View className="section-heading">
        <View className="stack">
          <Text className="section-title">Quick Entry</Text>
          <Text className="muted">Jump into teams and tournaments without extra taps</Text>
        </View>
      </View>

      <View className="quick-grid quick-grid-compact">
        <Button className="button-primary" onClick={() => Taro.switchTab({ url: '/pages/upcoming/index' })}>
          Upcoming
        </Button>
        <Button className="button-secondary" onClick={() => Taro.switchTab({ url: '/pages/tournaments/index' })}>
          Tournaments
        </Button>
      </View>

      {teams.length > 0 ? (
        <View className="chip-row">
          {teams.map((team) => (
            <View
              key={`${team.team_id || team.name}`}
              className="quick-chip"
              onClick={() => team.team_id && Taro.navigateTo({ url: `/packages/team/pages/detail/index?teamId=${team.team_id}` })}
            >
              <Text className="quick-chip-text">{team.name_cn || team.name || 'Team'}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
