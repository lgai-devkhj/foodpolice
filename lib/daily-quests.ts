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

export interface QuestRowUi {
  id: QuestId;
  title: string;
  subtitle?: string;
  done: boolean;
}

/** 매일 고정 2개(분석·대체)만 일일·스트릭에 반영. 문구는 날짜·사용자별로 바뀜 */
export interface QuestBoardUi {
  lead: string;
  dailyRows: QuestRowUi[];
  dailyCompleted: number;
  dailyTotal: number;
}

const QUEST_FLAVORS: Array<{
  lead: string;
  analyze: { title: string; subtitle: string };
  alt: { title: string; subtitle: string };
}> = [
  {
    lead: '매일 미션은 2개뿐이에요. 다 하면 스트릭이 올라가요.',
    analyze: { title: '포장 분석하기', subtitle: '하루 1번이면 충분해요' },
    alt: { title: '대체 식품 추천 받기', subtitle: '결과 화면에서 확인할 수 있어요' },
  },
  {
    lead: '오늘은 이렇게만 해볼까요?',
    analyze: { title: '라벨 한 번 찍기', subtitle: '원재료·영양표 촬영하면 돼요' },
    alt: { title: '더 나은 선택 찾기', subtitle: '대체 식품 문구가 뜨면 돼요' },
  },
  {
    lead: '짧게 끝내고 스트릭 챙기기.',
    analyze: { title: '포장 사진 분석', subtitle: '카메라로 바로 촬영' },
    alt: { title: '대안 식품 둘러보기', subtitle: '결과 카드에서 열 수 있어요' },
  },
  {
    lead: '오늘의 루틴 — 2개만 체크하면 끝.',
    analyze: { title: '포장 분석 완료하기', subtitle: '스캔 한 번이면 OK' },
    alt: { title: '추천 식품 확인하기', subtitle: '분석 후 화면에서 확인' },
  },
  {
    lead: '매일 조금씩, 쌓이는 스트릭.',
    analyze: { title: '제품 포장 읽기', subtitle: 'NOVA·원재료까지 한 번에' },
    alt: { title: '대체 추천 받기', subtitle: '결과 화면 하단에서' },
  },
  {
    lead: '오늘도 가볍게! 두 가지만.',
    analyze: { title: '포장 분석하기', subtitle: '하루 1회면 충분해요' },
    alt: { title: '대체 식품 보기', subtitle: '추천 문구가 나오면 완료' },
  },
  {
    lead: '스트릭은 오늘의 2개로 올라가요.',
    analyze: { title: '라벨 스캔하기', subtitle: '영양표·성분표 촬영' },
    alt: { title: '비슷한 대안 찾기', subtitle: '결과에서 추천 확인' },
  },
  {
    lead: '루틴 유지 중이에요? 오늘도 2개.',
    analyze: { title: '포장 분석', subtitle: '한 번이면 스트릭에 반영돼요' },
    alt: { title: '대체 식품 추천', subtitle: '결과 화면에서 열기' },
  },
];

function questFlavorIndex(ymd: string, clientId: string): number {
  const seed = `${clientId || 'local'}|${ymd}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % QUEST_FLAVORS.length;
}

export function buildQuestBoard(slice: QuestsSlice, now: Date, clientId = ''): QuestBoardUi {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(slice, todayYmd);
  const flavor = QUEST_FLAVORS[questFlavorIndex(todayYmd, clientId)]!;

  const dailyRows: QuestRowUi[] = [
    {
      id: 'analyze',
      title: flavor.analyze.title,
      subtitle: flavor.analyze.subtitle,
      done: daily.analyzeDone,
    },
    {
      id: 'alternative',
      title: flavor.alt.title,
      subtitle: flavor.alt.subtitle,
      done: daily.alternativeDone,
    },
  ];
  const dailyCompleted = dailyRows.filter((r) => r.done).length;
  const dailyTotal = dailyRows.length;

  return { lead: flavor.lead, dailyRows, dailyCompleted, dailyTotal };
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
