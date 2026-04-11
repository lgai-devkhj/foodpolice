import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildQuestBoard,
  buildWeekStreakView,
  questAfterAnalyze,
  resolveQuestSlice,
  emptyQuestDaily,
  ensureDailyForToday,
  toLocalYmd,
  getTodayAnalyzeLabel,
  DAILY_QUEST_ANALYZE_LABELS,
} from './daily-quests';

describe('daily-quests', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('일일 퀘스트는 항상 2개(분석·대체), 문구는 날짜·clientId에 따라 바뀜', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const board = buildQuestBoard(
      {
        daily: emptyQuestDaily('2026-06-15'),
        lifetime: {},
      },
      new Date(),
      'user-a',
    );
    expect(board.dailyTotal).toBe(2);
    expect(board.dailyRows.map((r) => r.id)).toEqual(['analyze', 'alternative']);
    expect(board.lead.length).toBeGreaterThan(0);
    const same = buildQuestBoard(
      {
        daily: emptyQuestDaily('2026-06-15'),
        lifetime: {},
      },
      new Date(),
      'user-a',
    );
    expect(same.dailyRows[0]?.title).toBe(board.dailyRows[0]?.title);
    const titles = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const dt = new Date(2026, 0, 1 + i);
      const ymd = toLocalYmd(dt);
      const b = buildQuestBoard(
        { daily: emptyQuestDaily(ymd), lifetime: {} },
        dt,
        'user-a',
      );
      titles.add(b.dailyRows[0]?.title ?? '');
    }
    expect(titles.size).toBeGreaterThan(1);
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

  it('첫 퀘스트: AI 일치(dailyQuestProductMatch)가 true일 때만 analyzeDone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const now = new Date();
    const no = questAfterAnalyze({}, '2026-06-15T12:00:00.000Z', now, false);
    expect(ensureDailyForToday(no, '2026-06-15').analyzeDone).toBe(false);
    const yes = questAfterAnalyze({}, '2026-06-15T12:00:00.000Z', now, true);
    expect(ensureDailyForToday(yes, '2026-06-15').analyzeDone).toBe(true);
  });

  it('getTodayAnalyzeLabel은 8종 중 하나', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const label = getTodayAnalyzeLabel('user-x', new Date());
    expect(DAILY_QUEST_ANALYZE_LABELS).toContain(label);
  });
});
