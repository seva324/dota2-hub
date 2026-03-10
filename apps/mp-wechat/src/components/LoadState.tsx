// @ts-nocheck
import { Text, View } from '@tarojs/components';

export function LoadState({ loading, error, empty, emptyText = 'No data yet' }) {
  if (loading) {
    return (
      <View className="loading-card">
        <Text>Loading data…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="empty-card">
        <Text>{error}</Text>
      </View>
    );
  }

  if (empty) {
    return (
      <View className="empty-card">
        <Text>{emptyText}</Text>
      </View>
    );
  }

  return null;
}
