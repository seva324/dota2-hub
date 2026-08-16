import { describe, expect, it } from 'vitest';
import { formatBracketDateCst, formatCenterAsCstTime } from '../pages/EventDetailPage';

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

describe('formatBracketDateCst', () => {
  it('把淘汰赛 UTC 时间串转北京时间 MM-DD HH:MM', () => {
    expect(formatBracketDateCst('2026-08-20 02:00:00')).toBe('08-20 10:00');
    expect(formatBracketDateCst('2026-08-23 05:00:00')).toBe('08-23 13:00');
  });

  it('跨天时日期翻到次日', () => {
    // 前一天 18:00 UTC = 次日 02:00 北京
    expect(formatBracketDateCst('2026-08-20 18:00:00')).toBe('08-21 02:00');
    // 前一天 22:00 UTC = 次日 06:00 北京
    expect(formatBracketDateCst('2026-08-21 22:00:00')).toBe('08-22 06:00');
  });

  it('空值/无效值原样返回', () => {
    expect(formatBracketDateCst('')).toBe('');
    expect(formatBracketDateCst(undefined)).toBe('');
    expect(formatBracketDateCst('garbage')).toBe('garbage');
  });
});
