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
  toLocalYmd as questDayYmd,
  type QuestsSlice,
  type WeekDayCell,
} from './daily-quests';
import {
  XP_ALTERNATIVE_QUEST,
  XP_ANALYSIS,
  XP_COMPARE_QUEST,
  XP_DAILY_PAIR_COMPLETE,
  XP_DAILY_QUIZ,
} from './xp-rewards';

export type { AnalysisStreak };
export type { QuestsSlice };
export type { QuestBoardUi, QuestRowUi, WeekDayCell } from './daily-quests';

export interface BodyMeasurement {
  date: string; // ISO
  heightCm: number;
  weightKg: number;
  /** 같은 calendar 날짜에 여러 건일 때 정렬·최신 판별용(추가 시각) */
  recordedAt?: string;
  /** 추가 순서 번호(항상 증가). 같은 날짜/시각 충돌 시 최종 tie-breaker */
  seq?: number;
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function measurementDateKey(v: string | undefined | null): string {
  const s = (v || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return toLocalYmd(d);
}

/** 날짜 오름차순, 같은 날이면 recordedAt(없으면 0) 오름차순 */
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
  /** 출생연도(연 나이·맞춤 열량 계산에 사용) */
  birthYear?: number | null;
  /** @deprecated 이전 버전.data. `birthYear`로 이전됨 */
  birthDate?: string | null;
  gender?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  bodyMeasurements?: BodyMeasurement[];
  appearanceMode?: string;
  onboardingLocked?: boolean;
  /** 개인정보 수집·이용 동의(미동의 시 서비스 이용 불가) */
  privacyConsentAccepted?: boolean;
}

/** 생년월일(legacy) 또는 출생연도 */
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
  /** 해당 스캔 분석 소요 시간(초). 기록에서 다시 열어도 표시용으로 유지 */
  analysisSeconds?: number;
  customProductName?: string | null;
  /** 기본 analyze. compare면 comparePayload로 비교 결과 재표시 */
  entryKind?: 'analyze' | 'compare';
  comparePayload?: {
    productA: AnalysisResult;
    productB: AnalysisResult;
    betterChoice: 'A' | 'B' | 'similar';
    comparisonSummary: string;
    recommendationLine: string;
  };
}

/** 영양표 한 줄(항목명 + 표기량 문자열). 칼슘·비타민 등 임의 항목 포함 */
export interface NutritionTableRow {
  name: string;
  /** 숫자·단위·% 등 라벨에 적힌 그대로 */
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
  /** 한국 영양표 기준 mg */
  cholesterolMg?: number | null;
  /** 식이섬유 g */
  dietaryFiberG?: number | null;
  servingSizeText?: string | null;
  basisIsPerServing?: boolean;
  /** 표에 보이는 영양항목 전부(위에서 아래 순). 있으면 UI에서 이걸 우선 표시 */
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

/** 라벨에 명시된 원재료 함량 %(있을 때만) */
export interface LabelExplicitPercentage {
  name: string;
  percent: number;
}

/** AI 추정 첨가·감미 등 미량 성분 함량 범위(참고용) */
export interface EstimatedIngredient {
  name: string;
  minPercent: number;
  maxPercent: number;
  isConcern: boolean;
}

export type AnalysisConfidenceLevel = 'low' | 'medium' | 'high';

export interface AnalysisResult {
  product: { productName: string; companyName?: string; rawMaterials?: string };
  novaGroup: number;
  /** Group IV일 때 4A | 4B | 4C */
  novaSubgroup?: string | null;
  judgmentReason?: string | null;
  concernIngredients: Array<{
    name: string;
    explanation: string;
    /** 통합 엔진 추정 함량 범위(%) */
    minPercent?: number | null;
    maxPercent?: number | null;
  }>;
  /** 스키마 호환용(모델은 빈 배열만 반환). 과거 분석에 값이 남을 수 있음 */
  estimatedIngredients?: EstimatedIngredient[] | null;
  /** 짧은 인사이트 문장 */
  keyInsights?: string[] | null;
  /** 비율·라벨 해석 전체의 불확실도(LLM이 프롬프트 규칙으로 선택한 low|medium|high) */
  analysisConfidence?: AnalysisConfidenceLevel | null;
  /** 라벨에 직접 인쇄된 % (있을 때) */
  labelExplicitPercentages?: LabelExplicitPercentage[] | null;
  briefDescription?: string | null;
  consumptionAdvice?: string | null;
  foodCategory?: string | null;
  nutrition?: NutritionFacts | null;
  nutritionDailyPercent?: NutritionDailyPercent | null;
  personalizedIntakeNote?: string | null;
  /** 키·몸무게가 있을 때 맞춤 열량 안내 아래에 붙이는 짧은 설명 */
  personalizedIntakeFootnote?: string | null;
  alternativeFoodText?: string | null;
  /** true면 대체 식품 문구가 Google Search 그라운딩 2차 호출 결과 */
  alternativeFoodFromWebSearch?: boolean;
  /** NOVA 3·4: /api/alternatives 응답 전 false → 로딩. 1·2는 즉시 true */
  alternativeFoodLoaded?: boolean;
  /** NOVA 1~2 등: 대체 추천 없음 이유(즉시 표시, 웹 검색 없음) */
  alternativeFoodNotice?: string | null;
  /** NOVA 1~2: 사용자가 「그래도 받기」로 웹 추천을 요청함 */
  alternativeFoodUserRequested?: boolean;
  /** 일일 첫 퀘스트: AI가 오늘 미션 식품 종류와 실제 촬영 제품이 맞는다고 판단한 경우 */
  dailyQuestProductMatch?: boolean;
}

export interface AppState {
  onboardingCompleted: boolean;
  profile: Profile;
  history: HistoryItem[];
  /** 연속 분석 일수(로컬 저장). 없으면 normalize 시 빈 값 */
  analysisStreak?: AnalysisStreak;
  /** 일일 퀘스트·첫 사용 시각 등 */
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
    /* 하나만 있어도 기록 표시: 키·몸무게만 있고 기록 배열이 비어 있으면 한 건 채움 */
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

/** 화면 표시용: 끊긴 스트릭은 0일로 표시 */
export function getAnalysisStreak(clientId: string): { displayCurrent: number; longest: number } {
  const s = loadState(clientId);
  return getEffectiveAnalysisStreak(normalizeAnalysisStreak(s.analysisStreak));
}

export function getQuestBoard(clientId: string) {
  const state = loadState(clientId);
  return buildQuestBoard(resolveQuestSlice(state), new Date(), clientId);
}

/** 스트릭 UI·토스트용 스냅샷(증가 없음) */
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
  const next = clampXp((qs.totalXp ?? 0) + Math.floor(delta));
  state.quests = { ...qs, totalXp: next };
  saveState(clientId, state);
  return next;
}

/** 일일 첫 퀘스트(키워드 퀴즈) 정답 시 — 오늘 이미 한 경우 무시 */
export function markDailyAnalyzeQuizDone(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
  totalXp: number;
} {
  const state = loadState(clientId);
  const prev = normalizeQuestsSlice(state.quests);
  const daily = ensureDailyForToday(prev, questDayYmd(new Date()));
  if (daily.analyzeDone) {
    return { ...getStreakToastSnapshot(clientId), totalXp: getTotalXp(clientId) };
  }
  state.quests = questAfterDailyQuizPassed(prev, new Date());
  saveState(clientId, state);
  addXp(clientId, XP_DAILY_QUIZ);
  const streak = tryAdvanceStreakIfAllQuestsDone(clientId);
  return { ...streak, totalXp: getTotalXp(clientId) };
}

/** 매일 배정된 2개 미션을 모두 완료했을 때만 연속 일수를 올림. */
export function tryAdvanceStreakIfAllQuestsDone(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  const slice = resolveQuestSlice(state);
  const daily = ensureDailyForToday(slice, questDayYmd(new Date()));
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

export function markQuestAlternativeReceived(clientId: string): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  const prev = normalizeQuestsSlice(state.quests);
  const daily = ensureDailyForToday(prev, questDayYmd(new Date()));
  const already = daily.alternativeDone === true;
  state.quests = questAfterAlternative(prev, new Date());
  saveState(clientId, state);
  if (!already) {
    addXp(clientId, XP_ALTERNATIVE_QUEST);
  }
  return tryAdvanceStreakIfAllQuestsDone(clientId);
}

export function markQuestCompareDone(
  clientId: string,
  dailyQuestProductMatch?: boolean,
): {
  displayCurrent: number;
  didIncrease: boolean;
} {
  const state = loadState(clientId);
  const prev = normalizeQuestsSlice(state.quests);
  const daily = ensureDailyForToday(prev, questDayYmd(new Date()));
  const already = daily.compareDone === true;
  const scannedAtIso = new Date().toISOString();
  state.quests = questAfterCompare(
    prev,
    new Date(),
    dailyQuestProductMatch,
    dailyQuestProductMatch === true ? scannedAtIso : undefined,
  );
  saveState(clientId, state);
  if (!already) {
    addXp(clientId, XP_COMPARE_QUEST);
  }
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
  const item: HistoryItem = {
    id: itemId,
    productName: (result.product && result.product.productName) || '',
    companyName: result.product?.companyName,
    scannedAt: new Date().toISOString(),
    maxRiskScore: result.novaGroup || 4,
    result,
    ...(sec != null ? { analysisSeconds: sec } : {}),
    customProductName: null,
  };
  list.unshift(item);
  state.history = list.slice(0, 100);
  state.quests = questAfterAnalyze(
    normalizeQuestsSlice(state.quests),
    item.scannedAt,
    new Date(),
    result.dailyQuestProductMatch === true,
  );
  saveState(clientId, state);
  addXp(clientId, XP_ANALYSIS);
  const streak = tryAdvanceStreakIfAllQuestsDone(clientId);
  return { id: itemId, item, streak };
}

/** 비교 결과를 최근 기록에 남김(퀘스트·스트릭은 호출부에서 이미 처리된 경우가 많음) */
export function addCompareToHistory(
  clientId: string,
  payload: NonNullable<HistoryItem['comparePayload']>,
): { id: string; item: HistoryItem } {
  const state = loadState(clientId);
  const list = state.history || [];
  const itemId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  const na = (payload.productA.product?.productName || '').trim() || '제품 A';
  const nb = (payload.productB.product?.productName || '').trim() || '제품 B';
  const item: HistoryItem = {
    id: itemId,
    productName: `비교: ${na} · ${nb}`,
    scannedAt: new Date().toISOString(),
    maxRiskScore: Math.max(payload.productA.novaGroup || 4, payload.productB.novaGroup || 4),
    result: payload.productA,
    customProductName: null,
    entryKind: 'compare',
    comparePayload: payload,
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

/** 스캔 기록·개인 맞춤화·화면 설정 등 모든 데이터 삭제. 하나도 남기지 않음. */
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

/** index: 목록을 날짜 내림차순 정렬했을 때의 순서(0 = 최신) */
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
