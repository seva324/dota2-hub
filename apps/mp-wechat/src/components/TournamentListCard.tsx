// @ts-nocheck
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { StatusBadge } from '@/components/StatusBadge';
import { formatMatchTime, getTournamentStatusMeta } from '@/utils/format';

export function TournamentListCard({ tournaments }) {
  return (
    <View className="section-card">
      <View className="section-heading">
        <View className="stack">
          <Text className="section-title">Highlight Tournaments</Text>
          <Text className="muted">Live and upcoming events worth tracking</Text>
        </View>
        <Button className="button-secondary button-small" onClick={() => Taro.switchTab({ url: '/pages/tournaments/index' })}>
          More
        </Button>
      </View>
      <View className="list-gap">
        {tournaments.map((item) => {
          const statusMeta = getTournamentStatusMeta(item);
          return (
            <View
              key={item.id}
              className="summary-row summary-row-tappable"
              onClick={() => Taro.navigateTo({ url: `/packages/tournament/pages/detail/index?tournamentId=${item.id}` })}
            >
              <View className="stack summary-main">
                <Text className="summary-title">{item.name_cn || item.name}</Text>
                <Text className="muted">{item.location || 'Global'} · {formatMatchTime(item.start_time)}</Text>
              </View>
              <View className="stack summary-side">
                <StatusBadge status={statusMeta.tone} label={statusMeta.label} />
                <Text className="muted">{item.tier || 'T1'}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
