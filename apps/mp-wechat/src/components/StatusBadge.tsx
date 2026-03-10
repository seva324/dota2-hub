// @ts-nocheck
import { Text } from '@tarojs/components';

const STATUS_CLASS_MAP = {
  live: 'status-badge status-live',
  upcoming: 'status-badge status-upcoming',
  completed: 'status-badge status-completed',
};

export function StatusBadge({ status, label }) {
  return <Text className={STATUS_CLASS_MAP[status] || STATUS_CLASS_MAP.upcoming}>{label}</Text>;
}
