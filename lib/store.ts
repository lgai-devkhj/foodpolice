import { STORE_PREFIX } from './constants';

export interface BodyMeasurement {
  date: string; // ISO
  heightCm: number;
  weightKg: number;
}

export interface Profile {
  birthDate?: string | null;
  gender?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  bodyMeasurements?: BodyMeasurement[];
  appearanceMode?: string;
  onboardingLocked?: boolean;
}

export interface HistoryItem {
  id: string;
  productName: string;
  companyName?: string;
  scannedAt: string;
  maxRiskScore: number;
  result: AnalysisResult;
  customProductName?: string | null;
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
  servingSizeText?: string | null;
  basisIsPerServing?: boolean;
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
}

export interface AnalysisResult {
  product: { productName: string; companyName?: string; rawMaterials?: string };
  novaGroup: number;
  /** Group IV일 때 4A | 4B | 4C */
  novaSubgroup?: string | null;
  judgmentReason?: string | null;
  concernIngredients: Array<{ name: string; explanation: string }>;
  briefDescription?: string | null;
  consumptionAdvice?: string | null;
  foodCategory?: string | null;
  nutrition?: NutritionFacts | null;
  nutritionDailyPercent?: NutritionDailyPercent | null;
  personalizedIntakeNote?: string | null;
  alternativeFoodText?: string | null;
}

export interface AppState {
  onboardingCompleted: boolean;
  profile: Profile;
  history: HistoryItem[];
}

function getStoreKey(clientId: string): string {
  return STORE_PREFIX + clientId.trim();
}

export function loadState(clientId: string): AppState {
  if (typeof window === 'undefined')
    return { onboardingCompleted: false, profile: {}, history: [] };
  const key = getStoreKey(clientId);
  const json = localStorage.getItem(key);
  if (!json) return { onboardingCompleted: false, profile: {}, history: [] };
  try {
    const parsed = JSON.parse(json);
    const profile = parsed.profile || {};
    const hasHw =
      profile.heightCm != null &&
      profile.weightKg != null &&
      profile.heightCm > 0 &&
      profile.weightKg > 0;
    if (Array.isArray(profile.bodyMeasurements) === false && hasHw) {
      profile.bodyMeasurements = [
        {
          date: new Date().toISOString(),
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
        },
      ];
    }
    /* 하나만 있어도 기록 표시: 키·몸무게만 있고 기록 배열이 비어 있으면 한 건 채움 */
    if (
      Array.isArray(profile.bodyMeasurements) &&
      profile.bodyMeasurements.length === 0 &&
      hasHw
    ) {
      profile.bodyMeasurements = [
        {
          date: new Date().toISOString(),
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
        },
      ];
    }
    if (!Array.isArray(profile.bodyMeasurements)) profile.bodyMeasurements = [];
    return {
      onboardingCompleted: !!parsed.onboardingCompleted,
      profile,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { onboardingCompleted: false, profile: {}, history: [] };
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
  let p = profile || {};
  if (
    p.heightCm != null &&
    p.weightKg != null &&
    (!Array.isArray(p.bodyMeasurements) || p.bodyMeasurements.length === 0)
  ) {
    p = {
      ...p,
      bodyMeasurements: [
        { date: new Date().toISOString(), heightCm: p.heightCm, weightKg: p.weightKg },
      ],
    };
  }
  state.profile = p;
  const pr = state.profile;
  state.onboardingCompleted = !!(
    pr.birthDate &&
    pr.gender &&
    pr.heightCm != null &&
    pr.weightKg != null
  );
  saveState(clientId, state);
}

export function getHistory(clientId: string): HistoryItem[] {
  return loadState(clientId).history || [];
}

export function addToHistory(clientId: string, result: AnalysisResult): { id: string; item: HistoryItem } {
  const state = loadState(clientId);
  const list = state.history || [];
  const itemId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  const item: HistoryItem = {
    id: itemId,
    productName: (result.product && result.product.productName) || '',
    companyName: result.product?.companyName,
    scannedAt: new Date().toISOString(),
    maxRiskScore: result.novaGroup || 4,
    result,
    customProductName: null,
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
  saveState(clientId, state);
}

export function addBodyMeasurement(
  clientId: string,
  date: string,
  heightCm: number,
  weightKg: number
): void {
  const state = loadState(clientId);
  const p = state.profile || {};
  const list = Array.isArray(p.bodyMeasurements) ? [...p.bodyMeasurements] : [];
  list.push({ date, heightCm, weightKg });
  if (list.length > 100) list.splice(0, list.length - 100);
  const sorted = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latest = sorted[sorted.length - 1];
  state.profile = {
    ...p,
    bodyMeasurements: list,
    heightCm: latest?.heightCm ?? p.heightCm,
    weightKg: latest?.weightKg ?? p.weightKg,
  };
  const pr = state.profile;
  state.onboardingCompleted = !!(
    pr.birthDate &&
    pr.gender &&
    pr.heightCm != null &&
    pr.weightKg != null
  );
  saveState(clientId, state);
}

/** index: 목록을 날짜 내림차순 정렬했을 때의 순서(0 = 최신) */
export function removeBodyMeasurement(clientId: string, index: number): void {
  const state = loadState(clientId);
  const p = state.profile || {};
  const list = Array.isArray(p.bodyMeasurements) ? [...p.bodyMeasurements] : [];
  const sortedDesc = [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (index < 0 || index >= sortedDesc.length) return;
  const toRemove = sortedDesc[index];
  const idxInList = list.findIndex(
    (m) => m.date === toRemove.date && m.heightCm === toRemove.heightCm && m.weightKg === toRemove.weightKg
  );
  const newList = idxInList >= 0 ? list.filter((_, i) => i !== idxInList) : list;
  const nextSorted = [...newList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latest = nextSorted[nextSorted.length - 1];
  state.profile = {
    ...p,
    bodyMeasurements: newList,
    heightCm: latest?.heightCm ?? undefined,
    weightKg: latest?.weightKg ?? undefined,
  };
  const pr = state.profile;
  state.onboardingCompleted = !!(
    pr.birthDate &&
    pr.gender &&
    pr.heightCm != null &&
    pr.weightKg != null
  );
  saveState(clientId, state);
}
