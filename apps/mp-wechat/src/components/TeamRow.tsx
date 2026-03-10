// @ts-nocheck
import { Image, Text, View } from '@tarojs/components';
import { getTeamLabel } from '@/utils/format';

export function TeamRow({ logoUrl, name, align = 'left' }) {
  return (
    <View className={`team-row ${align === 'right' ? 'team-row-right' : ''}`}>
      {align === 'right' ? (
        <>
          <Text className="team-name">{getTeamLabel(name)}</Text>
          {logoUrl ? <Image className="team-logo" src={logoUrl} mode="aspectFit" /> : <View className="team-logo team-logo-fallback" />}
        </>
      ) : (
        <>
          {logoUrl ? <Image className="team-logo" src={logoUrl} mode="aspectFit" /> : <View className="team-logo team-logo-fallback" />}
          <Text className="team-name">{getTeamLabel(name)}</Text>
        </>
      )}
    </View>
  );
}
