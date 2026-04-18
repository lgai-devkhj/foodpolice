import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildQuestBoard,
  buildWeekStreakView,
  questAfterAnalyze,
  questAfterCompare,
  questAfterDailyQuizPassed,
  resolveQuestSlice,
  emptyQuestDaily,
  ensureDailyForToday,
  toLocalYmd,
  getTodayAnalyzeLabel,
  questFlavorIndexForToday,
  displayedFlavorIndexForLocalYmd,
  addDaysToYmd,
  DAILY_QUEST_ANALYZE_LABELS,
  pickDailyQuestPair,
  isDailyQuestPairComplete,
} from './daily-quests';

describe('daily-quests', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('일일 퀘스트는 3종 중 2개 조합·항상 2줄, 문구는 날짜·clientId에 따라 바뀜', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const ymd = '2026-06-15';
    const board = buildQuestBoard(
      {
        daily: emptyQuestDaily(ymd),
        lifetime: {},
      },
      new Date(),
      'user-a',
    );
    expect(board.dailyTotal).toBe(2);
    const pair = pickDailyQuestPair('user-a', ymd);
    expect(board.dailyRows.map((r) => r.id)).toEqual(pair);
    expect(board.lead.length).toBeGreaterThan(0);
    const same = buildQuestBoard(
      {
        daily: emptyQuestDaily(ymd),
        lifetime: {},
      },
      new Date(),
      'user-a',
    );
    expect(same.dailyRows[0]?.title).toBe(board.dailyRows[0]?.title);
    const titles = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const dt = new Date(2026, 0, 1 + i);
      const dYmd = toLocalYmd(dt);
      const b = buildQuestBoard(
        { daily: emptyQuestDaily(dYmd), lifetime: {} },
        dt,
        'user-a',
      );
      titles.add(b.dailyRows[0]?.title ?? '');
    }
    expect(titles.size).toBeGreaterThan(1);
  });

  it('pickDailyQuestPair는 clientId에 따라 3종 조합이 나뉘고, 같은 입력은 고정', () => {
    const byClient = new Set<string>();
    for (let i = 0; i < 40; i++) {
      byClient.add(pickDailyQuestPair(`device-${i}`, '2026-06-15').join(','));
    }
    expect(byClient.size).toBeGreaterThan(1);
    const p = pickDailyQuestPair('stable-client', '2026-06-15');
    expect(pickDailyQuestPair('stable-client', '2026-06-15')).toEqual(p);
  });

  it('questAfterCompare는 compareDone을 켠다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const now = new Date();
    const next = questAfterCompare({}, now);
    expect(ensureDailyForToday(next, '2026-06-15').compareDone).toBe(true);
  });

  it('questAfterCompare는 compareDone만 켠다(첫 퀘스트는 퀴즈로 완료)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const now = new Date();
    const next = questAfterCompare({}, now, true, '2026-06-15T12:00:05.000Z');
    const d = ensureDailyForToday(next, '2026-06-15');
    expect(d.compareDone).toBe(true);
    expect(d.analyzeDone).toBe(false);
  });

  it('isDailyQuestPairComplete는 오늘 배정 2슬롯을 모두 만족할 때만 true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const ymd = '2026-06-15';
    const cid = 'user-pair-complete';
    const pair = pickDailyQuestPair(cid, ymd);
    let daily = emptyQuestDaily(ymd);
    expect(isDailyQuestPairComplete(daily, cid, ymd)).toBe(false);
    for (const k of pair) {
      if (k === 'analyze') daily = { ...daily, analyzeDone: true };
      else if (k === 'alternative') daily = { ...daily, alternativeDone: true };
      else daily = { ...daily, compareDone: true };
    }
    expect(isDailyQuestPairComplete(daily, cid, ymd)).toBe(true);
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

  it('완료일 배열이 비어도 스트릭 저장값으로 어제(토) 달성 표시 — 일요 미달성 직후에도 토요일 불 유지', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const week = buildWeekStreakView(
      [],
      new Date(),
      { lastStreakDate: '2026-06-14', current: 1, longest: 1 },
    );
    const sat = week.find((c) => c.ymd === '2026-06-14');
    expect(sat?.done).toBe(true);
    expect(week.find((c) => c.ymd === '2026-06-15')?.done).toBe(false);
  });

  it('첫 퀘스트(analyzeDone): 촬영·AI 일치로는 완료되지 않고 퀴즈로만 완료', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const now = new Date();
    const no = questAfterAnalyze({}, '2026-06-15T12:00:00.000Z', now, false);
    expect(ensureDailyForToday(no, '2026-06-15').analyzeDone).toBe(false);
    const yes = questAfterAnalyze({}, '2026-06-15T12:00:00.000Z', now, true);
    expect(ensureDailyForToday(yes, '2026-06-15').analyzeDone).toBe(false);
  });

  it('questAfterDailyQuizPassed는 analyzeDone을 켠다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const now = new Date();
    const next = questAfterDailyQuizPassed({}, now);
    expect(ensureDailyForToday(next, '2026-06-15').analyzeDone).toBe(true);
  });

  it('getTodayAnalyzeLabel은 8종 중 하나', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const label = getTodayAnalyzeLabel('user-x', new Date());
    expect(DAILY_QUEST_ANALYZE_LABELS).toContain(label);
  });

  it('연속 이틀은 같은 품목 미션이 나오지 않음', () => {
    vi.useFakeTimers();
    const clientId = 'user-streak-test';
    for (let day = 2; day <= 120; day++) {
      const today = new Date(2026, 0, day, 12, 0, 0);
      const yesterday = new Date(2026, 0, day - 1, 12, 0, 0);
      vi.setSystemTime(today);
      const labelToday = getTodayAnalyzeLabel(clientId, today);
      vi.setSystemTime(yesterday);
      const labelYesterday = getTodayAnalyzeLabel(clientId, yesterday);
      expect(labelToday).not.toBe(labelYesterday);
    }
  });

  it('displayedFlavorIndexForLocalYmd는 에포크 이후 연속 날짜가 항상 서로 다른 인덱스', () => {
    const cid = 'chain-test';
    let prev = displayedFlavorIndexForLocalYmd(cid, '2020-01-01');
    for (let i = 1; i < 200; i++) {
      const ymd = addDaysToYmd('2020-01-01', i);
      const cur = displayedFlavorIndexForLocalYmd(cid, ymd);
      expect(cur).not.toBe(prev);
      prev = cur;
    }
  });
});
