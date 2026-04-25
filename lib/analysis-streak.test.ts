import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  advanceStreakAfterAnalysis,
  emptyAnalysisStreak,
  getEffectiveAnalysisStreak,
  normalizeAnalysisStreak,
} from './analysis-streak';

describe('analysis-streak', () => {
  it('첫 달성이면 1일', () => {
    const next = advanceStreakAfterAnalysis(emptyAnalysisStreak(), new Date('2026-04-03T12:00:00'));
    expect(next.current).toBe(1);
    expect(next.lastStreakDate).toBe('2026-04-03');
    expect(next.longest).toBe(1);
  });

  it('같은 날 두 번째 달성은 일수 증가 없음', () => {
    const first = advanceStreakAfterAnalysis(emptyAnalysisStreak(), new Date('2026-04-03T10:00:00'));
    const second = advanceStreakAfterAnalysis(first, new Date('2026-04-03T18:00:00'));
    expect(second.current).toBe(1);
    expect(second.lastStreakDate).toBe('2026-04-03');
  });

  it('다음 날 첫 달성이면 +1', () => {
    const day1 = advanceStreakAfterAnalysis(emptyAnalysisStreak(), new Date('2026-04-03T12:00:00'));
    const day2 = advanceStreakAfterAnalysis(day1, new Date('2026-04-04T12:00:00'));
    expect(day2.current).toBe(2);
    expect(day2.longest).toBe(2);
  });

  it('이틀 이상 비우면 1로 리셋', () => {
    const day1 = advanceStreakAfterAnalysis(emptyAnalysisStreak(), new Date('2026-04-01T12:00:00'));
    const afterGap = advanceStreakAfterAnalysis(day1, new Date('2026-04-04T12:00:00'));
    expect(afterGap.current).toBe(1);
  });

  it('이틀 이상 비면 표시는 0이지만 최장 기록은 유지', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T12:00:00'));
    const s = normalizeAnalysisStreak({
      lastStreakDate: '2026-04-01',
      current: 5,
      longest: 5,
    });
    const eff = getEffectiveAnalysisStreak(s);
    expect(eff.displayCurrent).toBe(0);
    expect(eff.longest).toBe(5);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
