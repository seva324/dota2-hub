// @ts-nocheck
import { Text, View } from '@tarojs/components';
import { getApiBaseUrl } from '@/services/api';

export default function SettingsPage() {
  return (
    <View className="app-page">
      <View className="page-header">
        <Text className="page-title">Settings / About</Text>
        <Text className="page-subtitle">
          Compact WeChat shell for the dota2-hub backend and shared contracts.
        </Text>
      </View>

      <View className="section-card">
        <Text className="section-title">App Profile</Text>
        <View className="list-gap">
          <View className="summary-row">
            <Text>Product</Text>
            <Text className="muted">刀刀对局雷达站</Text>
          </View>
          <View className="summary-row">
            <Text>Runtime</Text>
            <Text className="muted">Taro + React + WeChat Mini Program</Text>
          </View>
          <View className="summary-row">
            <Text>Backend</Text>
            <Text className="muted">Vercel Functions + Neon Postgres</Text>
          </View>
        </View>
      </View>

      <View className="section-card">
        <Text className="section-title">Current API</Text>
        <Text className="muted api-endpoint">{getApiBaseUrl()}</Text>
      </View>

      <View className="section-card">
        <Text className="section-title">Next Steps</Text>
        <View className="list-gap">
          <Text className="muted">- Wire real assets and richer detail states.</Text>
          <Text className="muted">- Add pull-down refresh and infinite list polish.</Text>
          <Text className="muted">- Split heavier views into future subpackages.</Text>
        </View>
      </View>
    </View>
  );
}
