// @ts-nocheck
import { Text, View } from '@tarojs/components';
import { formatPublishedDay } from '@/utils/format';

export function NewsListCard({ items }) {
  if (!items.length) return null;

  return (
    <View className="section-card">
      <View className="section-heading">
        <View className="stack">
          <Text className="section-title">News Brief</Text>
          <Text className="muted">Lightweight headlines from backend cache</Text>
        </View>
      </View>
      <View className="list-gap">
        {items.map((item) => (
          <View key={item.id} className="summary-row">
            <View className="stack summary-main">
              <Text className="summary-title summary-title-wrap">{item.title}</Text>
              <Text className="muted">{item.source || 'News source'}</Text>
            </View>
            <Text className="muted">{formatPublishedDay(item.published_at)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
