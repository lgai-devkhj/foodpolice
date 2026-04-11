/**
 * 듀오링고 스타일 일일 퀘스트(로컬 날짜 기준).
 */

export type QuestId = 'analyze' | 'alternative' | 'tutorial' | 'knova' | 'bodyMeasurement';

export interface QuestLifetime {
  tutorialDone?: boolean;
  knovaLearnDone?: boolean;
}

export interface QuestDaily {
  dateYmd: string;
  analyzeDone: boolean;
  alternativeDone: boolean;
  bodyMeasurementDone: boolean;
}

export interface QuestsSlice {
  /** 첫 분석 시각(ISO). 사용 기간·퀘스트 노출에 사용 */
  firstUseAt?: string;
  lifetime?: QuestLifetime;
  daily?: QuestDaily;
  /** 일일 2개 퀘스트를 모두 완료한 날(YYYY-MM-DD), 오름차순 */
  dailyPairCompleteYmds?: string[];
}

export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function emptyQuestDaily(todayYmd: string): QuestDaily {
  return {
    dateYmd: todayYmd,
    analyzeDone: false,
    alternativeDone: false,
    bodyMeasurementDone: false,
  };
}

export function normalizeQuestsSlice(raw: unknown): QuestsSlice {
  if (raw == null || typeof raw !== 'object') return {};
  const q = raw as Partial<QuestsSlice>;
  const firstUseAt =
    typeof q.firstUseAt === 'string' && q.firstUseAt.length >= 8 ? q.firstUseAt : undefined;
  const lifetime =
    q.lifetime && typeof q.lifetime === 'object'
      ? {
          tutorialDone: q.lifetime.tutorialDone === true,
          knovaLearnDone: q.lifetime.knovaLearnDone === true,
        }
      : undefined;
  let daily: QuestDaily | undefined;
  if (q.daily && typeof q.daily === 'object') {
    const d = q.daily as Partial<QuestDaily>;
    const dateYmd =
      typeof d.dateYmd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.dateYmd)
        ? d.dateYmd
        : toLocalYmd(new Date());
    daily = {
      dateYmd,
      analyzeDone: d.analyzeDone === true,
      alternativeDone: d.alternativeDone === true,
      bodyMeasurementDone: d.bodyMeasurementDone === true,
    };
  }
  let dailyPairCompleteYmds: string[] | undefined;
  if (Array.isArray(q.dailyPairCompleteYmds)) {
    dailyPairCompleteYmds = q.dailyPairCompleteYmds.filter(
      (x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x),
    );
    dailyPairCompleteYmds = Array.from(new Set(dailyPairCompleteYmds)).sort();
    if (dailyPairCompleteYmds.length > 120) dailyPairCompleteYmds = dailyPairCompleteYmds.slice(-120);
  }
  return { firstUseAt, lifetime, daily, dailyPairCompleteYmds };
}

/** 기록에만 있고 firstUseAt이 없을 때 마이그레이션 */
export function earliestScannedAtFromHistory(history: Array<{ scannedAt: string }>): string | undefined {
  if (!Array.isArray(history) || history.length === 0) return undefined;
  let min = history[0].scannedAt;
  for (const h of history) {
    if (h.scannedAt && h.scannedAt < min) min = h.scannedAt;
  }
  return min;
}

export function ensureDailyForToday(slice: QuestsSlice, todayYmd: string): QuestDaily {
  const d = slice.daily;
  if (!d || d.dateYmd !== todayYmd) return emptyQuestDaily(todayYmd);
  return { ...d, dateYmd: d.dateYmd };
}

export function daysSinceFirstUse(firstUseAt: string | undefined, now: Date): number {
  if (!firstUseAt) return 0;
  const t0 = new Date(firstUseAt).getTime();
  if (Number.isNaN(t0)) return 0;
  const t1 = now.getTime();
  return Math.max(0, Math.floor((t1 - t0) / 86400000));
}

/** 키·몸무게 일일 퀘스트: 첫 사용 후 30일 이상 */
export const BODY_QUEST_MIN_DAYS = 30;

export function shouldShowBodyQuest(firstUseAt: string | undefined, now: Date): boolean {
  return daysSinceFirstUse(firstUseAt, now) >= BODY_QUEST_MIN_DAYS;
}

export function bodyQuestMonthLabel(firstUseAt: string | undefined, now: Date): string {
  const days = daysSinceFirstUse(firstUseAt, now);
  const months = Math.max(1, Math.floor(days / 30));
  return `${months}개월 차 · 오늘 한 번만 적어도 돼요`;
}

export interface QuestRowUi {
  id: QuestId;
  title: string;
  subtitle?: string;
  done: boolean;
}

/** 매일 고정 2개(분석·대체)만 일일·스트릭에 반영. 나머지는 bonusRows */
export interface QuestBoardUi {
  dailyRows: QuestRowUi[];
  dailyCompleted: number;
  dailyTotal: number;
  bonusRows: QuestRowUi[];
}

function rowDone(
  id: QuestId,
  daily: QuestDaily,
  lifetime: QuestLifetime | undefined,
  showBody: boolean,
): boolean {
  switch (id) {
    case 'analyze':
      return daily.analyzeDone;
    case 'alternative':
      return daily.alternativeDone;
    case 'tutorial':
      return lifetime?.tutorialDone === true;
    case 'knova':
      return lifetime?.knovaLearnDone === true;
    case 'bodyMeasurement':
      return showBody ? daily.bodyMeasurementDone : true;
    default:
      return false;
  }
}

export function buildQuestBoard(slice: QuestsSlice, now: Date): QuestBoardUi {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(slice, todayYmd);
  const lifetime = slice.lifetime || {};
  const firstUse = slice.firstUseAt;
  const showBody = shouldShowBodyQuest(firstUse, now);
  const showTutorial = lifetime.tutorialDone !== true;
  const showKnova = lifetime.knovaLearnDone !== true;

  const dailyRows: QuestRowUi[] = [
    {
      id: 'analyze',
      title: '포장 분석하기',
      subtitle: '하루에 1번이면 돼요',
      done: rowDone('analyze', daily, lifetime, showBody),
    },
    {
      id: 'alternative',
      title: '대체 식품 추천 받기',
      subtitle: '결과 화면에서 볼 수 있어요',
      done: rowDone('alternative', daily, lifetime, showBody),
    },
  ];
  const dailyCompleted = dailyRows.filter((r) => r.done).length;
  const dailyTotal = dailyRows.length;

  const bonusRows: QuestRowUi[] = [];
  if (showTutorial) {
    bonusRows.push({
      id: 'tutorial',
      title: '앱 사용법 보기',
      subtitle: '튜토리얼 · 한 번만 보면 돼요',
      done: rowDone('tutorial', daily, lifetime, showBody),
    });
  }
  if (showKnova) {
    bonusRows.push({
      id: 'knova',
      title: 'K-NOVA 알아보기',
      subtitle: '결과에서 ? 눌러보기',
      done: rowDone('knova', daily, lifetime, showBody),
    });
  }
  if (showBody) {
    bonusRows.push({
      id: 'bodyMeasurement',
      title: '키·몸무게 기록하기',
      subtitle: bodyQuestMonthLabel(firstUse, now),
      done: rowDone('bodyMeasurement', daily, lifetime, showBody),
    });
  }

  return { dailyRows, dailyCompleted, dailyTotal, bonusRows };
}

export function resolveQuestSlice(state: {
  quests?: unknown;
  history: Array<{ scannedAt: string }>;
}): QuestsSlice {
  const n = normalizeQuestsSlice(state.quests);
  if (n.firstUseAt) return n;
  const e = earliestScannedAtFromHistory(state.history);
  if (e) return { ...n, firstUseAt: e };
  return n;
}

export function questAfterAnalyze(prev: QuestsSlice, scannedAtIso: string, now: Date): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  const firstUseAt =
    !prev.firstUseAt || scannedAtIso < prev.firstUseAt ? scannedAtIso : prev.firstUseAt;
  return {
    ...prev,
    firstUseAt,
    daily: { ...daily, analyzeDone: true },
  };
}

export function questAfterAlternative(prev: QuestsSlice, now: Date): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  return { ...prev, daily: { ...daily, alternativeDone: true } };
}

export function questAfterTutorial(prev: QuestsSlice): QuestsSlice {
  return {
    ...prev,
    lifetime: { ...prev.lifetime, tutorialDone: true },
  };
}

export function questAfterKnova(prev: QuestsSlice): QuestsSlice {
  if (prev.lifetime?.knovaLearnDone) return prev;
  return {
    ...prev,
    lifetime: { ...prev.lifetime, knovaLearnDone: true },
  };
}

export function questAfterBodyMeasurement(prev: QuestsSlice, now: Date): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  return { ...prev, daily: { ...daily, bodyMeasurementDone: true } };
}

/** 최근 7일(오늘 포함) 셀 — 일일 2개 완료한 날만 done */
export interface WeekDayCell {
  ymd: string;
  weekdayLabel: string;
  dayNum: number;
  done: boolean;
  isToday: boolean;
}

export function buildWeekStreakView(completeYmds: string[] | undefined, now: Date): WeekDayCell[] {
  const set = new Set(completeYmds || []);
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  const cells: WeekDayCell[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const ymd = toLocalYmd(d);
    cells.push({
      ymd,
      weekdayLabel: labels[d.getDay()],
      dayNum: d.getDate(),
      done: set.has(ymd),
      isToday: i === 0,
    });
  }
  return cells;
}
