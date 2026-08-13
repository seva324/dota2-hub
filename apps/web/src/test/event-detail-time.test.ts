import { describe, expect, it } from 'vitest';
import { formatCenterAsCstTime } from '../pages/EventDetailPage';

describe('formatCenterAsCstTime', () => {
  it('把 DLTV UTC 时间串转北京时间 HH:MM', () => {
    expect(formatCenterAsCstTime('2026-08-14 02:00:00')).toBe('10:00');
    expect(formatCenterAsCstTime('2026-08-14 05:00:00')).toBe('13:00');
    // 跨天：前一天 22:00 UTC = 次日 06:00 北京
    expect(formatCenterAsCstTime('2026-08-13 22:00:00')).toBe('06:00');
  });

  it('非时间串原样返回（比分/无效值）', () => {
    expect(formatCenterAsCstTime('2 - 0')).toBe('2 - 0');
    expect(formatCenterAsCstTime('')).toBe('');
    expect(formatCenterAsCstTime('garbage')).toBe('garbage');
  });
});
