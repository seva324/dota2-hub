// @ts-nocheck
import { Text, View } from '@tarojs/components';

export function LoadState({ loading, error, empty, emptyText = '暂无数据' }) {
  if (loading) {
    return (
      <View className="loading-card">
        <Text>数据加载中...</Text>
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
