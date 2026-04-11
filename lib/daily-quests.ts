/**
 * 듀오링고 스타일 일일 퀘스트(로컬 날짜 기준).
 */

export type QuestId =
  | 'analyze'
  | 'alternative'
  | 'compare'
  | 'tutorial'
  | 'knova'
  | 'bodyMeasurement';

export interface QuestLifetime {
  tutorialDone?: boolean;
  knovaLearnDone?: boolean;
}

export interface QuestDaily {
  dateYmd: string;
  analyzeDone: boolean;
  alternativeDone: boolean;
  /** 상품 비교하기(제품 A·B 각 원재료+영양표) 완료 */
  compareDone: boolean;
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

/** 로컬 달력 기준 YYYY-MM-DD에 일 수 더하기 */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return toLocalYmd(dt);
}

export function emptyQuestDaily(todayYmd: string): QuestDaily {
  return {
    dateYmd: todayYmd,
    analyzeDone: false,
    alternativeDone: false,
    compareDone: false,
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
      compareDone: d.compareDone === true,
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

/** 매일 2개(특정 상품·대체·비교 중 무작위 2종)만 일일·스트릭에 반영. 문구는 날짜·사용자별로 바뀜 */
export interface QuestBoardUi {
  lead: string;
  dailyRows: QuestRowUi[];
  dailyCompleted: number;
  dailyTotal: number;
}

/** 일일 첫 퀘스트 대상 식품(순서 고정, 8개). AI가 촬영 제품이 맞는지 판단 */
export const DAILY_QUEST_ANALYZE_LABELS = [
  '삼각김밥',
  '샌드위치',
  '시리얼',
  '요거트',
  '냉동만두',
  '에너지바',
  '바나나우유',
  '쥬스',
] as const;

export type DailyQuestAnalyzeLabel = (typeof DAILY_QUEST_ANALYZE_LABELS)[number];

const QUEST_FLAVORS: Array<{
  lead: string;
  analyze: { title: string; subtitle: string };
  alt: { title: string; subtitle: string };
}> = [
  {
    lead: '매일 미션은 2개뿐이에요. 다 하면 스트릭이 올라가요.',
    analyze: {
      title: '「삼각김밥」 찍기',
      subtitle: 'AI가 포장을 보고 삼각김밥이 맞는지 판단해요',
    },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '오늘은 이렇게만 해볼까요?',
    analyze: { title: '「샌드위치」 찍기', subtitle: 'AI가 샌드위치 포장인지 판단해요' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '짧게 끝내고 스트릭 챙기기.',
    analyze: { title: '「시리얼」 찍기', subtitle: 'AI가 시리얼·그래놀라 박스인지 판단해요' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '오늘의 루틴 — 2개만 체크하면 끝.',
    analyze: { title: '「요거트」 찍기', subtitle: 'AI가 요거트·요구르트인지 판단해요' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '매일 조금씩, 쌓이는 스트릭.',
    analyze: { title: '「냉동만두」 찍기', subtitle: 'AI가 만두·교자류인지 판단해요' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '오늘도 가볍게! 두 가지만.',
    analyze: { title: '「에너지바」 찍기', subtitle: 'AI가 에너지바·프로틴바·그래놀라바인지 판단해요' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '스트릭은 오늘의 2개로 올라가요.',
    analyze: { title: '「바나나우유」 찍기', subtitle: 'AI가 바나나우유인지 판단해요' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '루틴 유지 중이에요? 오늘도 2개.',
    analyze: { title: '「쥬스」 찍기', subtitle: 'AI가 과일·채소 주스인지 판단해요(탄산음료 제외)' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
];

export function questFlavorIndex(ymd: string, clientId: string): number {
  const seed = `${clientId || 'local'}|${ymd}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % DAILY_QUEST_ANALYZE_LABELS.length;
}

/** fnv-1a 스타일 해시 — 연속 일자 중복 회피용 보조 시드 */
function hashStringFnv(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

/** 특정 상품 찍기 / 대체 식품 확인 / 상품 비교하기 — 매일 그중 2개만 배정 */
export type DailyQuestPairSlot = 'analyze' | 'alternative' | 'compare';

const DAILY_QUEST_PAIRS: Array<[DailyQuestPairSlot, DailyQuestPairSlot]> = [
  ['analyze', 'alternative'],
  ['analyze', 'compare'],
  ['alternative', 'compare'],
];

/**
 * 로컬 날짜·기기(clientId)마다 고정된 2슬롯(3종 중 2개 조합).
 */
export function pickDailyQuestPair(
  clientId: string,
  ymd: string,
): [DailyQuestPairSlot, DailyQuestPairSlot] {
  const h = hashStringFnv(`${clientId || 'local'}|${ymd}|pair`);
  return DAILY_QUEST_PAIRS[Math.abs(h) % DAILY_QUEST_PAIRS.length]!;
}

const COMPARE_QUEST_UI = {
  title: '제품 두 개 비교하기',
  subtitle: '「상품 비교하기」로 A·B 각각 원재료·영양표(총 4장)',
} as const;

/** 표시 인덱스 체인 시작일(그 전 날은 raw 해시만 이전일 프록시로 사용) */
const DISPLAY_FLAVOR_EPOCH_YMD = '2020-01-01';

/**
 * 날짜별로 캐시해 같은 날짜는 O(1). 첫 요청만 에포크→목표일까지 순회(수천 일 이하).
 */
const displayedFlavorIndexMemo = new Map<string, number>();

function pickDistinctFromRaw(
  ymd: string,
  clientId: string,
  rawIndex: number,
  prevDisplayedIndex: number,
): number {
  if (rawIndex !== prevDisplayedIndex) return rawIndex;
  const altSeed = `${clientId || 'local'}|${ymd}|no-repeat`;
  const h = hashStringFnv(altSeed);
  const others: number[] = [];
  for (let i = 0; i < DAILY_QUEST_ANALYZE_LABELS.length; i++) {
    if (i !== prevDisplayedIndex) others.push(i);
  }
  return others[Math.abs(h) % others.length]!;
}

/**
 * 로컬 날짜 기준, **바로 전날에 화면에 나왔던 품목**과는 항상 다른 인덱스(0~7).
 * 에포크 이전 날짜는 raw만 사용.
 */
export function displayedFlavorIndexForLocalYmd(clientId: string, targetYmd: string): number {
  const cid = clientId || 'local';
  const memoKey = `${cid}|${targetYmd}`;
  const cached = displayedFlavorIndexMemo.get(memoKey);
  if (cached !== undefined) return cached;

  if (targetYmd < DISPLAY_FLAVOR_EPOCH_YMD) {
    const r = questFlavorIndex(targetYmd, cid);
    displayedFlavorIndexMemo.set(memoKey, r);
    return r;
  }

  let startYmd = DISPLAY_FLAVOR_EPOCH_YMD;
  let prevDisplayed = questFlavorIndex(addDaysToYmd(DISPLAY_FLAVOR_EPOCH_YMD, -1), cid);

  let probe = addDaysToYmd(targetYmd, -1);
  while (probe >= DISPLAY_FLAVOR_EPOCH_YMD) {
    const k = `${cid}|${probe}`;
    if (displayedFlavorIndexMemo.has(k)) {
      prevDisplayed = displayedFlavorIndexMemo.get(k)!;
      startYmd = addDaysToYmd(probe, 1);
      break;
    }
    probe = addDaysToYmd(probe, -1);
  }

  for (let ymd = startYmd; ymd <= targetYmd; ymd = addDaysToYmd(ymd, 1)) {
    const raw = questFlavorIndex(ymd, cid);
    const d = pickDistinctFromRaw(ymd, cid, raw, prevDisplayed);
    displayedFlavorIndexMemo.set(`${cid}|${ymd}`, d);
    prevDisplayed = d;
  }

  return displayedFlavorIndexMemo.get(memoKey)!;
}

/**
 * 오늘의 퀘스트 품목 인덱스. **어제(로컬)에 표시된 품목과는 항상 다름.**
 */
export function questFlavorIndexForToday(clientId: string, now: Date): number {
  return displayedFlavorIndexForLocalYmd(clientId, toLocalYmd(now));
}

/** API `/api/analyze`에 넘길 오늘 미션 식품 라벨 */
export function getTodayAnalyzeLabel(clientId: string, now: Date): string {
  const idx = questFlavorIndexForToday(clientId, now);
  return DAILY_QUEST_ANALYZE_LABELS[idx] ?? DAILY_QUEST_ANALYZE_LABELS[0];
}

export function buildQuestBoard(slice: QuestsSlice, now: Date, clientId = ''): QuestBoardUi {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(slice, todayYmd);
  const flavor = QUEST_FLAVORS[questFlavorIndexForToday(clientId, now)]!;
  const pair = pickDailyQuestPair(clientId, todayYmd);

  const lead = pair.includes('analyze')
    ? flavor.lead
    : '오늘의 미션 2개를 완료하면 스트릭이 올라가요.';

  const dailyRows: QuestRowUi[] = [];
  for (const slot of pair) {
    if (slot === 'analyze') {
      dailyRows.push({
        id: 'analyze',
        title: flavor.analyze.title,
        subtitle: flavor.analyze.subtitle,
        done: daily.analyzeDone,
      });
    } else if (slot === 'alternative') {
      dailyRows.push({
        id: 'alternative',
        title: flavor.alt.title,
        subtitle: flavor.alt.subtitle,
        done: daily.alternativeDone,
      });
    } else {
      dailyRows.push({
        id: 'compare',
        title: COMPARE_QUEST_UI.title,
        subtitle: COMPARE_QUEST_UI.subtitle,
        done: daily.compareDone,
      });
    }
  }
  const dailyCompleted = dailyRows.filter((r) => r.done).length;
  const dailyTotal = dailyRows.length;

  return { lead, dailyRows, dailyCompleted, dailyTotal };
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

export function questAfterAnalyze(
  prev: QuestsSlice,
  scannedAtIso: string,
  now: Date,
  dailyQuestProductMatch: boolean,
): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  const firstUseAt =
    !prev.firstUseAt || scannedAtIso < prev.firstUseAt ? scannedAtIso : prev.firstUseAt;
  const analyzeDone = daily.analyzeDone || dailyQuestProductMatch;
  return {
    ...prev,
    firstUseAt,
    daily: { ...daily, analyzeDone },
  };
}

export function questAfterAlternative(prev: QuestsSlice, now: Date): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  return { ...prev, daily: { ...daily, alternativeDone: true } };
}

export function questAfterCompare(prev: QuestsSlice, now: Date): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  return { ...prev, daily: { ...daily, compareDone: true } };
}

/** 오늘 배정된 2슬롯을 모두 완료했는지 */
export function isDailyQuestPairComplete(
  daily: QuestDaily,
  clientId: string,
  ymd: string,
): boolean {
  const pair = pickDailyQuestPair(clientId, ymd);
  return pair.every((kind) => {
    if (kind === 'analyze') return daily.analyzeDone;
    if (kind === 'alternative') return daily.alternativeDone;
    return daily.compareDone;
  });
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
