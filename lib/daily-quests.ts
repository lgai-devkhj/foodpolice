import { normalizeAnalysisStreak, type AnalysisStreak } from './analysis-streak';
import { parseDailyOxQuizSolvedStored, type DailyOxQuizSolvedStored } from './daily-quiz';
import { toLocalYmd } from './local-date';

export { toLocalYmd };

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
  compareDone: boolean;
  bodyMeasurementDone: boolean;
}

export interface QuestsSlice {
  firstUseAt?: string;
  lifetime?: QuestLifetime;
  daily?: QuestDaily;
  dailyPairCompleteYmds?: string[];
  totalXp?: number;
  xpEarnedByDay?: Record<string, number>;
  dailyOxQuizSolved?: DailyOxQuizSolvedStored;
}

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
  let totalXp: number | undefined;
  if (typeof q.totalXp === 'number' && Number.isFinite(q.totalXp) && q.totalXp >= 0) {
    totalXp = Math.min(Math.floor(q.totalXp), 99_999_999);
  }
  let xpEarnedByDay: Record<string, number> | undefined;
  if (q.xpEarnedByDay && typeof q.xpEarnedByDay === 'object' && !Array.isArray(q.xpEarnedByDay)) {
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries(q.xpEarnedByDay)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
      o[k] = Math.min(Math.floor(v), 99_999_999);
    }
    xpEarnedByDay = trimXpEarnedByDayMap(o, 24);
  }
  const todayYmd = toLocalYmd(new Date());
  let dailyOxQuizSolved: DailyOxQuizSolvedStored | undefined;
  const parsedSolved = parseDailyOxQuizSolvedStored(q.dailyOxQuizSolved);
  if (parsedSolved && parsedSolved.dateYmd === todayYmd) {
    dailyOxQuizSolved = parsedSolved;
  }
  return {
    firstUseAt,
    lifetime,
    daily,
    dailyPairCompleteYmds,
    totalXp,
    xpEarnedByDay,
    dailyOxQuizSolved,
  };
}

export function trimXpEarnedByDayMap(
  map: Record<string, number>,
  keepDays: number,
  now: Date = new Date(),
): Record<string, number> {
  const today = toLocalYmd(now);
  let cutoff = today;
  for (let i = 0; i < keepDays - 1; i++) {
    cutoff = addDaysToYmd(cutoff, -1);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k >= cutoff) out[k] = v;
  }
  return out;
}

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
    analyze: {
      title: '오늘의 퀴즈 (OX)',
      subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념',
    },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '오늘은 이렇게만 해볼까요?',
    analyze: { title: '오늘의 퀴즈 (OX)', subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '짧게 끝내고 스트릭 챙기기.',
    analyze: { title: '오늘의 퀴즈 (OX)', subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '오늘의 루틴 — 2개만 체크하면 끝.',
    analyze: { title: '오늘의 퀴즈 (OX)', subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '매일 조금씩, 쌓이는 스트릭.',
    analyze: { title: '오늘의 퀴즈 (OX)', subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '오늘도 가볍게! 두 가지만.',
    analyze: { title: '오늘의 퀴즈 (OX)', subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '스트릭은 오늘의 2개로 올라가요.',
    analyze: { title: '오늘의 퀴즈 (OX)', subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념' },
    alt: { title: '더 나은 선택 찾기', subtitle: '다른 제품이어도 괜찮아요 · 결과에서 「대체 식품」' },
  },
  {
    lead: '루틴 유지 중이에요? 오늘도 2개.',
    analyze: { title: '오늘의 퀴즈 (OX)', subtitle: '로드 시 미리 받아옴 · NOVA·원재료 개념' },
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
  return Math.abs(h) % QUEST_FLAVORS.length;
}

export function hashStringFnv(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

export type DailyQuestPairSlot = 'analyze' | 'alternative' | 'compare';

const DAILY_QUEST_PAIRS: Array<[DailyQuestPairSlot, DailyQuestPairSlot]> = [
  ['analyze', 'alternative'],
  ['analyze', 'compare'],
  ['alternative', 'compare'],
];

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

const DISPLAY_FLAVOR_EPOCH_YMD = '2020-01-01';

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
  for (let i = 0; i < QUEST_FLAVORS.length; i++) {
    if (i !== prevDisplayedIndex) others.push(i);
  }
  return others[Math.abs(h) % others.length]!;
}

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

export function questFlavorIndexForToday(clientId: string, now: Date): number {
  return displayedFlavorIndexForLocalYmd(clientId, toLocalYmd(now));
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
): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  const firstUseAt =
    !prev.firstUseAt || scannedAtIso < prev.firstUseAt ? scannedAtIso : prev.firstUseAt;
  return {
    ...prev,
    firstUseAt,
    daily: { ...daily },
  };
}

export function questAfterDailyQuizPassed(prev: QuestsSlice, now: Date): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  return { ...prev, daily: { ...daily, analyzeDone: true } };
}

export function questAfterAlternative(prev: QuestsSlice, now: Date): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  return { ...prev, daily: { ...daily, alternativeDone: true } };
}

export function questAfterCompare(
  prev: QuestsSlice,
  now: Date,
  scannedAtIso?: string,
): QuestsSlice {
  const todayYmd = toLocalYmd(now);
  const daily = ensureDailyForToday(prev, todayYmd);
  let firstUseAt = prev.firstUseAt;
  if (scannedAtIso) {
    firstUseAt =
      !prev.firstUseAt || scannedAtIso < prev.firstUseAt ? scannedAtIso : prev.firstUseAt;
  }
  return { ...prev, firstUseAt, daily: { ...daily, compareDone: true } };
}

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

export interface WeekDayCell {
  ymd: string;
  weekdayLabel: string;
  dayNum: number;
  done: boolean;
  isToday: boolean;
}

export function buildWeekStreakView(
  completeYmds: string[] | undefined,
  now: Date,
  streak?: AnalysisStreak | null,
): WeekDayCell[] {
  const set = new Set(completeYmds || []);
  if (streak != null) {
    const s = normalizeAnalysisStreak(streak);
    if (s.lastStreakDate && s.current > 0) {
      for (let k = 0; k < s.current; k++) {
        set.add(addDaysToYmd(s.lastStreakDate, -k));
      }
    }
  }
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
