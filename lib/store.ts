import { STORE_PREFIX } from './constants';
import {
  normalizeAnalysisStreak,
  advanceStreakAfterAnalysis,
  getEffectiveAnalysisStreak,
  emptyAnalysisStreak,
  type AnalysisStreak,
} from './analysis-streak';
import {
  normalizeQuestsSlice,
  questAfterAnalyze,
  questAfterAlternative,
  questAfterCompare,
  questAfterDailyQuizPassed,
  questAfterTutorial,
  questAfterKnova,
  questAfterBodyMeasurement,
  resolveQuestSlice,
  buildQuestBoard,
  buildWeekStreakView,
  ensureDailyForToday,
  isDailyQuestPairComplete,
  trimXpEarnedByDayMap,
  type QuestsSlice,
  type WeekDayCell,
} from './daily-quests';
import { toLocalYmd } from './local-date';
import {
  XP_ALTERNATIVE_QUEST,
  XP_ANALYSIS,
  XP_COMPARE_QUEST,
  XP_DAILY_PAIR_COMPLETE,
  XP_DAILY_QUIZ,
} from './xp-rewards';
import { analysisProductIdentityKey, comparePairIdentityKey } from './product-identity';
import type { DailyOxQuizSolvedStored } from './daily-quiz';

export const MIN_VIEW_SECONDS_FOR_XP = 5;

export type { AnalysisStreak };
export type { QuestsSlice };
export type { QuestBoardUi, QuestRowUi, WeekDayCell } from './daily-quests';

export interface BodyMeasurement {
  date: string; // ISO
  heightCm: number;
  weightKg: number;
  recordedAt?: string;
  seq?: number;
}

function measurementDateKey(v: string | undefined | null): string {
  const s = (v || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return toLocalYmd(d);
}

export function compareBodyMeasurementsAsc(a: BodyMeasurement, b: BodyMeasurement): number {
  const da = measurementDateKey(a.date);
  const db = measurementDateKey(b.date);
  if (da !== db) return da < db ? -1 : 1;
  const ra = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
  const rb = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
  if (ra !== rb) return ra - rb;
  const sa = typeof a.seq === 'number' && Number.isFinite(a.seq) ? a.seq : 0;
  const sb = typeof b.seq === 'number' && Number.isFinite(b.seq) ? b.seq : 0;
  if (sa !== sb) return sa - sb;
  return 0;
}

export function compareBodyMeasurementsDesc(a: BodyMeasurement, b: BodyMeasurement): number {
  return -compareBodyMeasurementsAsc(a, b);
}

function nextBodyMeasurementSeq(list: BodyMeasurement[]): number {
  let maxSeq = 0;
  for (const m of list) {
    if (typeof m?.seq === 'number' && Number.isFinite(m.seq)) {
      if (m.seq > maxSeq) maxSeq = m.seq;
    }
  }
  return maxSeq + 1;
}

export interface Profile {
  birthYear?: number | null;
  birthDate?: string | null;
  gender?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  bodyMeasurements?: BodyMeasurement[];
  appearanceMode?: string;
  onboardingLocked?: boolean;
  privacyConsentAccepted?: boolean;
}

export function profileHasBirth(profile: Profile): boolean {
  const y = profile.birthYear;
  const cy = new Date().getFullYear();
  if (y != null && typeof y === 'number' && Number.isFinite(y) && y >= 1900 && y <= cy) return true;
  const bd = profile.birthDate;
  return !!(bd && String(bd).trim().length >= 4);
}

export function normalizeProfileFields(profile: Profile): Profile {
  const p = { ...profile };
  if ((p.birthYear == null || !Number.isFinite(p.birthYear)) && p.birthDate) {
    const m = String(p.birthDate).match(/^(\d{4})/);
    if (m) p.birthYear = parseInt(m[1], 10);
  }
  return p;
}

export interface HistoryItem {
  id: string;
  productName: string;
  companyName?: string;
  scannedAt: string;
  maxRiskScore: number;
  result: AnalysisResult;
  analysisSeconds?: number;
  customProductName?: string | null;
  entryKind?: 'analyze' | 'compare';
  compareSeconds?: number;
  comparePayload?: {
    productA: AnalysisResult;
    productB: AnalysisResult;
    betterChoice: 'A' | 'B' | 'similar';
    comparisonSummary: string;
    recommendationLine: string;
  };
  pendingAnalysisXp?: boolean;
  analysisXpGranted?: boolean;
  pendingCompareXp?: boolean;
  compareXpGranted?: boolean;
}

export interface NutritionTableRow {
  name: string;
  amount: string;
}

export interface NutritionFacts {
  caloriesKcal?: number | null;
  sodiumMg?: number | null;
  carbsG?: number | null;
  sugarG?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  saturatedFatG?: number | null;
  transFatG?: number | null;
  cholesterolMg?: number | null;
  dietaryFiberG?: number | null;
  servingSizeText?: string | null;
  basisIsPerServing?: boolean;
  tableRows?: NutritionTableRow[] | null;
}

export interface NutritionDailyPercent {
  calories?: number;
  sodium?: number;
  carbs?: number;
  sugar?: number;
  protein?: number;
  fat?: number;
  saturatedFat?: number;
  transFat?: number;
  cholesterol?: number;
  dietaryFiber?: number;
}

export interface LabelExplicitPercentage {
  name: string;
  percent: number;
}

export type AnalysisConfidenceLevel = 'low' | 'medium' | 'high';

export interface AnalysisResult {
  product: { productName: string; companyName?: string; rawMaterials?: string };
  novaGroup: number;
  novaSubgroup?: string | null;
  judgmentReason?: string | null;
  concernIngredients: Array<{
    name: string;
    explanation: string;
    minPercent?: number | null;
    maxPercent?: number | null;
  }>;
  keyInsights?: string[] | null;
  analysisConfidence?: AnalysisConfidenceLevel | null;
  labelExplicitPercentages?: LabelExplicitPercentage[] | null;
  briefDescription?: string | null;
  consumptionAdvice?: string | null;
  foodCategory?: string | null;
  nutrition?: NutritionFacts | null;
  nutritionDailyPercent?: NutritionDailyPercent | null;
  personalizedIntakeNote?: string | null;
  personalizedIntakeFootnote?: string | null;
  alternativeFoodText?: string | null;
  alternativeFoodFromWebSearch?: boolean;
  alternativeFoodEngineFallback?: boolean;
  alternativeUnavailableReason?: 'NO_SEARCH_KEY' | 'FETCH_FAILED' | 'NO_MATCH' | null;
  alternativeFoodLoaded?: boolean;
  alternativeFoodNotice?: string | null;
  alternativeFoodUserRequested?: boolean;
  fastAnalysisDemo?: boolean;
}

export interface AppState {
  onboardingCompleted: boolean;
  profile: Profile;
  history: HistoryItem[];
  analysisStreak?: AnalysisStreak;
  quests?: QuestsSlice;
}

function getStoreKey(clientId: string): string {
  return STORE_PREFIX + clientId.trim();
}

export function loadState(clientId: string): AppState {
  if (typeof window === 'undefined')
    return {
      onboardingCompleted: false,
      profile: {},
      history: [],
      analysisStreak: emptyAnalysisStreak(),
      quests: {},
    };
  const key = getStoreKey(clientId);
  const json = localStorage.getItem(key);
  if (!json)
    return {
      onboardingCompleted: false,
      profile: {},
      history: [],
      analysisStreak: emptyAnalysisStreak(),
      quests: {},
    };
  try {
    const parsed = JSON.parse(json);
    const profile = normalizeProfileFields(parsed.profile || {});
    const hasHw =
      profile.heightCm != null &&
      profile.weightKg != null &&
      profile.heightCm > 0 &&
      profile.weightKg > 0;
    if (Array.isArray(profile.bodyMeasurements) === false && hasHw) {
      const now = new Date();
      profile.bodyMeasurements = [
        {
          date: toLocalYmd(now),
          heightCm: Number(profile.heightCm),
          weightKg: Number(profile.weightKg),
          recordedAt: now.toISOString(),
          seq: 1,
        },
      ];
    }
    if (
      Array.isArray(profile.bodyMeasurements) &&
      profile.bodyMeasurements.length === 0 &&
      hasHw
    ) {
      const now = new Date();
      profile.bodyMeasurements = [
        {
          date: toLocalYmd(now),
          heightCm: Number(profile.heightCm),
          weightKg: Number(profile.weightKg),
          recordedAt: now.toISOString(),
          seq: 1,
        },
      ];
    }
    if (!Array.isArray(profile.bodyMeasurements)) profile.bodyMeasurements = [];
    return {
      onboardingCompleted: !!parsed.onboardingCompleted,
      profile,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      analysisStreak: normalizeAnalysisStreak(parsed.analysisStreak),
      quests: normalizeQuestsSlice(parsed.quests),
    };
  } catch {
    return {
      onboardingCompleted: false,
      profile: {},
      history: [],
      analysisStreak: emptyAnalysisStreak(),
      quests: {},
    };
  }
}

export function saveState(clientId: string, state: AppState): void {
  if (typeof window === 'undefined') return;
  const key = getStoreKey(clientId);
  localStorage.setItem(key, JSON.stringify(state || {}));
}

export function getProfile(clientId: string): Profile {
  return loadState(clientId).profile || {};
}

export function setProfile(clientId: string, profile: Profile): void {
  const state = loadState(clientId);
  let p = normalizeProfileFields(profile || {});
  if (
    p.heightCm != null &&
    p.weightKg != null &&
    (!Array.isArray(p.bodyMeasurements) || p.bodyMeasurements.length === 0)
  ) {
    const now = new Date();
    p = {
      ...p,
      bodyMeasurements: [
        {
          date: toLocalYmd(now),
          heightCm: p.heightCm,
          weightKg: p.weightKg,
          recordedAt: now.toISOString(),
          seq: 1,
        },
      ],
    };
  }
  state.profile = p;
  const pr = state.profile;
  state.onboardingCompleted = !!(
    profileHasBirth(pr) &&
    pr.gender &&
    pr.heightCm != null &&
    pr.weightKg != null
  );
  saveState(clientId, state);
}

export function getHistory(clientId: string): HistoryItem[] {
  return loadState(clientId).history || [];
}

export function getAnalysisStreak(clientId: string): { displayCurrent: number; longest: number } {
  const s = loadState(clientId);
  return getEffectiveAnalysisStreak(normalizeAnalysisStreak(s.analysisStreak));
}

export function getQuestBoard(clientId: string) {
  const state = loadState(clientId);
  return buildQuestBoard(resolveQuestSlice(state), new Date(), clientId);
}

export function getStreakToastSnapshot(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const s = loadState(clientId);
  return {
    displayCurrent: getEffectiveAnalysisStreak(normalizeAnalysisStreak(s.analysisStreak)).displayCurrent,
    didIncrease: false,
  };
}

function clampXp(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 99_999_999);
}

export function getTotalXp(clientId: string): number {
  const qs = normalizeQuestsSlice(loadState(clientId).quests);
  return clampXp(qs.totalXp ?? 0);
}

export function addXp(clientId: string, delta: number): number {
  if (delta <= 0 || !Number.isFinite(delta)) return getTotalXp(clientId);
  const state = loadState(clientId);
  const qs = normalizeQuestsSlice(state.quests);
  const d = Math.floor(delta);
  const next = clampXp((qs.totalXp ?? 0) + d);
  const ymd = toLocalYmd(new Date());
  const prevDay = qs.xpEarnedByDay?.[ymd] ?? 0;
  const merged = { ...qs.xpEarnedByDay, [ymd]: prevDay + d };
  state.quests = {
    ...qs,
    totalXp: next,
    xpEarnedByDay: trimXpEarnedByDayMap(merged, 24),
  };
  saveState(clientId, state);
  return next;
}

export function getDailyOxQuizSolvedForToday(clientId: string): DailyOxQuizSolvedStored | null {
  const qs = normalizeQuestsSlice(loadState(clientId).quests);
  const s = qs.dailyOxQuizSolved;
  if (!s) return null;
  const today = toLocalYmd(new Date());
  if (s.dateYmd !== today) return null;
  return s;
}

export function markDailyAnalyzeQuizDone(
  clientId: string,
  solved?: DailyOxQuizSolvedStored | null,
): {
  displayCurrent: number;
  didIncrease: boolean;
  totalXp: number;
} {
  const state = loadState(clientId);
  const prev = normalizeQuestsSlice(state.quests);
  const daily = ensureDailyForToday(prev, toLocalYmd(new Date()));
  if (daily.analyzeDone) {
    return { ...getStreakToastSnapshot(clientId), totalXp: getTotalXp(clientId) };
  }
  const todayYmd = toLocalYmd(new Date());
  let next = questAfterDailyQuizPassed(prev, new Date());
  if (solved && solved.dateYmd === todayYmd) {
    next = { ...next, dailyOxQuizSolved: solved };
  }
  state.quests = next;
  saveState(clientId, state);
  addXp(clientId, XP_DAILY_QUIZ);
  const streak = tryAdvanceStreakIfAllQuestsDone(clientId);
  return { ...streak, totalXp: getTotalXp(clientId) };
}

export function tryAdvanceStreakIfAllQuestsDone(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  const slice = resolveQuestSlice(state);
  const daily = ensureDailyForToday(slice, toLocalYmd(new Date()));
  const ymd = daily.dateYmd;
  if (!isDailyQuestPairComplete(daily, clientId, ymd)) {
    return getStreakToastSnapshot(clientId);
  }
  const qs = normalizeQuestsSlice(state.quests);
  const dateSet = new Set(qs.dailyPairCompleteYmds || []);
  const firstPairCompleteToday = !dateSet.has(ymd);
  if (!dateSet.has(ymd)) {
    dateSet.add(ymd);
    state.quests = {
      ...qs,
      dailyPairCompleteYmds: Array.from(dateSet).sort().slice(-120),
    };
  }
  const oldNorm = normalizeAnalysisStreak(state.analysisStreak);
  const beforeDisplay = getEffectiveAnalysisStreak(oldNorm).displayCurrent;
  const newStreak = advanceStreakAfterAnalysis(oldNorm, new Date());
  const afterDisplay = getEffectiveAnalysisStreak(newStreak).displayCurrent;
  const didIncrease = afterDisplay > beforeDisplay;
  state.analysisStreak = newStreak;
  saveState(clientId, state);
  if (firstPairCompleteToday) {
    addXp(clientId, XP_DAILY_PAIR_COMPLETE);
  }
  return { displayCurrent: afterDisplay, didIncrease };
}

export function getWeekStreakSheetData(clientId: string): {
  displayStreak: number;
  longest: number;
  week: WeekDayCell[];
} {
  const state = loadState(clientId);
  const slice = normalizeQuestsSlice(state.quests);
  const st = normalizeAnalysisStreak(state.analysisStreak);
  const displayStreak = getEffectiveAnalysisStreak(st).displayCurrent;
  const week = buildWeekStreakView(slice.dailyPairCompleteYmds, new Date(), state.analysisStreak);
  return { displayStreak, longest: st.longest, week };
}

export function getXpWeekChartData(clientId: string): {
  cells: Array<{
    ymd: string;
    weekdayLabel: string;
    dayNum: number;
    xp: number;
    isToday: boolean;
  }>;
  weekTotal: number;
  maxInWeek: number;
} {
  const qs = normalizeQuestsSlice(loadState(clientId).quests);
  const byDay = qs.xpEarnedByDay || {};
  const now = new Date();
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  const cells: Array<{
    ymd: string;
    weekdayLabel: string;
    dayNum: number;
    xp: number;
    isToday: boolean;
  }> = [];
  let weekTotal = 0;
  let maxInWeek = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const ymd = toLocalYmd(d);
    const xp = Math.min(byDay[ymd] ?? 0, 99_999_999);
    weekTotal += xp;
    if (xp > maxInWeek) maxInWeek = xp;
    cells.push({
      ymd,
      weekdayLabel: labels[d.getDay()] ?? '',
      dayNum: d.getDate(),
      xp,
      isToday: i === 0,
    });
  }
  if (maxInWeek < 1) maxInWeek = 1;
  return { cells, weekTotal, maxInWeek };
}

export function markQuestAlternativeReceived(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  const prev = normalizeQuestsSlice(state.quests);
  const daily = ensureDailyForToday(prev, toLocalYmd(new Date()));
  const already = daily.alternativeDone === true;
  state.quests = questAfterAlternative(prev, new Date());
  saveState(clientId, state);
  if (!already) {
    addXp(clientId, XP_ALTERNATIVE_QUEST);
  }
  return tryAdvanceStreakIfAllQuestsDone(clientId);
}

export function markQuestCompareDone(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  const prev = normalizeQuestsSlice(state.quests);
  const scannedAtIso = new Date().toISOString();
  state.quests = questAfterCompare(prev, new Date(), scannedAtIso);
  saveState(clientId, state);
  return tryAdvanceStreakIfAllQuestsDone(clientId);
}

export function markQuestTutorialDone(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  state.quests = questAfterTutorial(normalizeQuestsSlice(state.quests));
  saveState(clientId, state);
  return tryAdvanceStreakIfAllQuestsDone(clientId);
}

export function markQuestKnovaLearnDone(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  const prev = normalizeQuestsSlice(state.quests);
  if (prev.lifetime?.knovaLearnDone) return getStreakToastSnapshot(clientId);
  state.quests = questAfterKnova(prev);
  saveState(clientId, state);
  return tryAdvanceStreakIfAllQuestsDone(clientId);
}

function historyHasAnalyzeIdentityKey(list: HistoryItem[], key: string): boolean {
  if (!key) return false;
  for (const h of list) {
    if (h.entryKind === 'compare') continue;
    if (analysisProductIdentityKey(h.result) === key) return true;
  }
  return false;
}

function historyHasComparePairKey(list: HistoryItem[], key: string): boolean {
  if (!key) return false;
  for (const h of list) {
    if (h.entryKind !== 'compare' || !h.comparePayload) continue;
    if (comparePairIdentityKey(h.comparePayload.productA, h.comparePayload.productB) === key) return true;
  }
  return false;
}

export function addToHistory(
  clientId: string,
  result: AnalysisResult,
  analysisSeconds?: number,
): {
  id: string;
  item: HistoryItem;
  streak: { displayCurrent: number; didIncrease: boolean };
} {
  const state = loadState(clientId);
  const list = state.history || [];
  const itemId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  const sec =
    analysisSeconds != null && Number.isFinite(analysisSeconds) && analysisSeconds >= 0
      ? analysisSeconds
      : undefined;
  const identityKey = analysisProductIdentityKey(result);
  const duplicateAnalyze =
    identityKey.length > 0 && historyHasAnalyzeIdentityKey(list, identityKey);
  const item: HistoryItem = {
    id: itemId,
    productName: (result.product && result.product.productName) || '',
    companyName: result.product?.companyName,
    scannedAt: new Date().toISOString(),
    maxRiskScore: result.novaGroup || 4,
    result,
    ...(sec != null ? { analysisSeconds: sec } : {}),
    customProductName: null,
    pendingAnalysisXp: !duplicateAnalyze,
    analysisXpGranted: false,
  };
  list.unshift(item);
  state.history = list.slice(0, 100);
  state.quests = questAfterAnalyze(
    normalizeQuestsSlice(state.quests),
    item.scannedAt,
    new Date(),
  );
  saveState(clientId, state);
  const streak = tryAdvanceStreakIfAllQuestsDone(clientId);
  return { id: itemId, item, streak };
}

export function grantAnalysisXpAfterView(
  clientId: string,
  historyId: string,
  viewSeconds: number,
): { granted: boolean; totalXp: number } {
  if (viewSeconds < MIN_VIEW_SECONDS_FOR_XP) {
    return { granted: false, totalXp: getTotalXp(clientId) };
  }
  const state = loadState(clientId);
  const list = state.history || [];
  const idx = list.findIndex((i) => i.id === historyId);
  if (idx === -1) return { granted: false, totalXp: getTotalXp(clientId) };
  const item = list[idx];
  if (item.entryKind === 'compare') return { granted: false, totalXp: getTotalXp(clientId) };
  if (item.analysisXpGranted === true || item.pendingAnalysisXp !== true) {
    return { granted: false, totalXp: getTotalXp(clientId) };
  }
  item.analysisXpGranted = true;
  list[idx] = item;
  state.history = list;
  saveState(clientId, state);
  addXp(clientId, XP_ANALYSIS);
  return { granted: true, totalXp: getTotalXp(clientId) };
}

export function grantCompareXpAfterView(
  clientId: string,
  historyId: string,
  viewSeconds: number,
): { granted: boolean; totalXp: number } {
  if (viewSeconds < MIN_VIEW_SECONDS_FOR_XP) {
    return { granted: false, totalXp: getTotalXp(clientId) };
  }
  const state = loadState(clientId);
  const list = state.history || [];
  const idx = list.findIndex((i) => i.id === historyId);
  if (idx === -1) return { granted: false, totalXp: getTotalXp(clientId) };
  const item = list[idx];
  if (item.entryKind !== 'compare' || !item.comparePayload) {
    return { granted: false, totalXp: getTotalXp(clientId) };
  }
  if (item.compareXpGranted === true || item.pendingCompareXp !== true) {
    return { granted: false, totalXp: getTotalXp(clientId) };
  }
  item.compareXpGranted = true;
  list[idx] = item;
  state.history = list;
  saveState(clientId, state);
  addXp(clientId, XP_COMPARE_QUEST);
  return { granted: true, totalXp: getTotalXp(clientId) };
}

export function addCompareToHistory(
  clientId: string,
  payload: NonNullable<HistoryItem['comparePayload']>,
  compareSeconds?: number,
): { id: string; item: HistoryItem } {
  const state = loadState(clientId);
  const list = state.history || [];
  const itemId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  const na = (payload.productA.product?.productName || '').trim() || '제품 A';
  const nb = (payload.productB.product?.productName || '').trim() || '제품 B';
  const pairKey = comparePairIdentityKey(payload.productA, payload.productB);
  const duplicateCompare =
    pairKey.length > 0 && historyHasComparePairKey(list, pairKey);
  const secOk =
    compareSeconds != null &&
    typeof compareSeconds === 'number' &&
    Number.isFinite(compareSeconds) &&
    compareSeconds >= 0;
  const item: HistoryItem = {
    id: itemId,
    productName: `비교: ${na} · ${nb}`,
    scannedAt: new Date().toISOString(),
    maxRiskScore: Math.max(payload.productA.novaGroup || 4, payload.productB.novaGroup || 4),
    result: payload.productA,
    customProductName: null,
    entryKind: 'compare',
    comparePayload: payload,
    ...(secOk ? { compareSeconds } : {}),
    pendingCompareXp: !duplicateCompare,
    compareXpGranted: false,
  };
  list.unshift(item);
  state.history = list.slice(0, 100);
  saveState(clientId, state);
  return { id: itemId, item };
}

export function updateProductName(
  clientId: string,
  id: string,
  customName: string | null
): void {
  const state = loadState(clientId);
  const list = state.history || [];
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return;
  list[idx].customProductName = customName && customName.trim() ? customName.trim() : null;
  state.history = list;
  saveState(clientId, state);
}

export function deleteFromHistory(clientId: string, id: string): void {
  const state = loadState(clientId);
  state.history = (state.history || []).filter((i) => i.id !== id);
  saveState(clientId, state);
}

export function updateHistoryResult(
  clientId: string,
  id: string,
  patch: Partial<AnalysisResult>
): void {
  const state = loadState(clientId);
  const list = state.history || [];
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return;
  list[idx].result = { ...list[idx].result, ...patch };
  state.history = list;
  saveState(clientId, state);
}

export function clearAllHistory(clientId: string): void {
  const state = loadState(clientId);
  state.history = [];
  saveState(clientId, state);
}

export function clearAllData(clientId: string): void {
  const state = loadState(clientId);
  state.history = [];
  state.profile = {};
  state.onboardingCompleted = false;
  state.analysisStreak = emptyAnalysisStreak();
  state.quests = {};
  saveState(clientId, state);
}

export function addBodyMeasurement(
  clientId: string,
  date: string,
  heightCm: number,
  weightKg: number,
): { displayCurrent: number; didIncrease: boolean } {
  const state = loadState(clientId);
  const p = state.profile || {};
  const list = Array.isArray(p.bodyMeasurements) ? [...p.bodyMeasurements] : [];
  list.push({
    date,
    heightCm,
    weightKg,
    recordedAt: new Date().toISOString(),
    seq: nextBodyMeasurementSeq(list),
  });
  if (list.length > 100) list.splice(0, list.length - 100);
  const sorted = [...list].sort(compareBodyMeasurementsAsc);
  const latest = sorted[sorted.length - 1];
  state.profile = {
    ...p,
    bodyMeasurements: list,
    heightCm: latest?.heightCm ?? p.heightCm,
    weightKg: latest?.weightKg ?? p.weightKg,
  };
  const pr = state.profile;
  state.onboardingCompleted = !!(
    profileHasBirth(pr) &&
    pr.gender &&
    pr.heightCm != null &&
    pr.weightKg != null
  );
  state.quests = questAfterBodyMeasurement(normalizeQuestsSlice(state.quests), new Date());
  saveState(clientId, state);
  return tryAdvanceStreakIfAllQuestsDone(clientId);
}

export function removeBodyMeasurement(clientId: string, index: number): void {
  const state = loadState(clientId);
  const p = state.profile || {};
  const list = Array.isArray(p.bodyMeasurements) ? [...p.bodyMeasurements] : [];
  const sortedDesc = [...list].sort(compareBodyMeasurementsDesc);
  if (index < 0 || index >= sortedDesc.length) return;
  const toRemove = sortedDesc[index];
  let idxInList = list.findIndex(
    (m) =>
      m.date === toRemove.date &&
      m.heightCm === toRemove.heightCm &&
      m.weightKg === toRemove.weightKg &&
      (m.recordedAt || '') === (toRemove.recordedAt || '') &&
      (m.seq ?? 0) === (toRemove.seq ?? 0)
  );
  if (idxInList < 0) {
    idxInList = list.findIndex(
      (m) => m.date === toRemove.date && m.heightCm === toRemove.heightCm && m.weightKg === toRemove.weightKg
    );
  }
  const newList = idxInList >= 0 ? list.filter((_, i) => i !== idxInList) : list;
  const nextSorted = [...newList].sort(compareBodyMeasurementsAsc);
  const latest = nextSorted[nextSorted.length - 1];
  state.profile = {
    ...p,
    bodyMeasurements: newList,
    heightCm: latest?.heightCm ?? undefined,
    weightKg: latest?.weightKg ?? undefined,
  };
  const pr = state.profile;
  state.onboardingCompleted = !!(
    profileHasBirth(pr) &&
    pr.gender &&
    pr.heightCm != null &&
    pr.weightKg != null
  );
  saveState(clientId, state);
}
