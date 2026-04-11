import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildQuestBoard,
  buildWeekStreakView,
  questAfterAnalyze,
  resolveQuestSlice,
  emptyQuestDaily,
  ensureDailyForToday,
} from './daily-quests';

describe('daily-quests', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('일일 퀘스트는 항상 2개(분석·대체), 튜토리얼·K-NOVA는 bonusRows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const board = buildQuestBoard(
      {
        daily: emptyQuestDaily('2026-06-15'),
        lifetime: {},
      },
      new Date(),
    );
    expect(board.dailyTotal).toBe(2);
    expect(board.dailyRows.map((r) => r.id)).toEqual(['analyze', 'alternative']);
    expect(board.bonusRows.some((r) => r.id === 'tutorial')).toBe(true);
    expect(board.bonusRows.some((r) => r.id === 'knova')).toBe(true);
    expect(board.bonusRows.some((r) => r.id === 'bodyMeasurement')).toBe(false);
  });

  it('첫 사용 30일 후 키·몸무게는 bonusRows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const board = buildQuestBoard(
      {
        firstUseAt: '2026-05-01T10:00:00.000Z',
        daily: emptyQuestDaily('2026-06-15'),
        lifetime: { tutorialDone: true, knovaLearnDone: true },
      },
      new Date(),
    );
    expect(board.dailyTotal).toBe(2);
    expect(board.bonusRows.some((r) => r.id === 'bodyMeasurement')).toBe(true);
  });

  it('resolveQuestSlice는 기록에서 가장 이른 scannedAt을 사용', () => {
    const slice = resolveQuestSlice({
      quests: {},
      history: [{ scannedAt: '2026-04-02T00:00:00.000Z' }, { scannedAt: '2026-04-01T00:00:00.000Z' }],
    });
    expect(slice.firstUseAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('buildWeekStreakView는 최근 7일·완료 여부', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const week = buildWeekStreakView(['2026-06-14', '2026-06-15'], new Date());
    expect(week).toHaveLength(7);
    expect(week[6]?.ymd).toBe('2026-06-15');
    expect(week[6]?.isToday).toBe(true);
    expect(week[5]?.done).toBe(true);
    expect(week[4]?.done).toBe(false);
  });

  it('분석 완료 시 오늘 날짜에 analyzeDone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const now = new Date();
    const next = questAfterAnalyze({}, '2026-06-15T12:00:00.000Z', now);
    const daily = ensureDailyForToday(next, '2026-06-15');
    expect(daily.analyzeDone).toBe(true);
  });
});
