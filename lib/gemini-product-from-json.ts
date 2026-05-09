import {
  computeDailyPercentages,
  type NutritionDailyPercent,
  type NutritionFactsInput,
} from '@/lib/nutrition-daily';
import { isCanonicalFoodCategory } from '@/lib/food-domain-config';
import type {
  AnalysisConfidenceLevel,
  AnalysisResult,
  LabelExplicitPercentage,
} from '@/lib/store';

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseNutritionTableRows(raw: unknown): { name: string; amount: string }[] {
  const src = Array.isArray(raw) ? raw : null;
  if (!src) return [];
  const out: { name: string; amount: string }[] = [];
  for (const item of src) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = row.name != null ? String(row.name).trim() : '';
    const amount = row.amount != null ? String(row.amount).trim() : '';
    if (!name && !amount) continue;
    out.push({
      name: name || '항목',
      amount: amount || '—',
    });
  }
  return out;
}

function firstNumber(text: string): number | null {
  const m = String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function amountToUnitValue(amount: string, expect: 'mg' | 'g' | 'kcal'): number | null {
  const src = String(amount).replace(/,/g, '').toLowerCase();
  const m = src.match(/(-?\d+(?:\.\d+)?)\s*(mg|g|kcal|㎎|ｇ|그램|밀리그램)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2] || '';
  const unit = u === '㎎' || u === '밀리그램' ? 'mg' : u === 'ｇ' || u === '그램' ? 'g' : u;
  if (expect === 'kcal') return n;
  if (!unit) return n;
  if (expect === unit) return n;
  if (expect === 'mg' && unit === 'g') return n * 1000;
  if (expect === 'g' && unit === 'mg') return n / 1000;
  return n;
}

function inferFromTableRows(
  rows: { name: string; amount: string }[],
  nameRe: RegExp,
  unit: 'mg' | 'g' | 'kcal'
): number | null {
  for (const row of rows) {
    if (!nameRe.test(row.name)) continue;
    const byUnit = amountToUnitValue(row.amount, unit);
    if (byUnit != null) return byUnit;
    const byNumber = firstNumber(row.amount);
    if (byNumber != null) return byNumber;
  }
  return null;
}

function parseNutrition(raw: unknown): NutritionFactsInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tableRows = parseNutritionTableRows(o.tableRows ?? o.nutritionTableRows);
  const caloriesKcal =
    numOrNull(o.caloriesKcal) ??
    inferFromTableRows(tableRows, /(열량|칼로리|kcal|energy|calories?)/i, 'kcal');
  const sodiumMg = numOrNull(o.sodiumMg) ?? inferFromTableRows(tableRows, /(나트륨|sodium)/i, 'mg');
  const carbsG =
    numOrNull(o.carbsG) ?? inferFromTableRows(tableRows, /(탄수화물|carb(?:ohydrate)?s?)/i, 'g');
  const sugarG = numOrNull(o.sugarG) ?? inferFromTableRows(tableRows, /(당류|당\b|sugar)/i, 'g');
  const proteinG = numOrNull(o.proteinG) ?? inferFromTableRows(tableRows, /(단백질|protein)/i, 'g');
  const fatG = numOrNull(o.fatG) ?? inferFromTableRows(tableRows, /(^|[^가-힣])지방|total\s*fat/i, 'g');
  const saturatedFatG =
    numOrNull(o.saturatedFatG) ?? inferFromTableRows(tableRows, /(포화지방|saturated\s*fat)/i, 'g');
  const transFatG =
    numOrNull(o.transFatG) ?? inferFromTableRows(tableRows, /(트랜스지방|trans\s*fat)/i, 'g');
  const cholesterolMg =
    numOrNull(o.cholesterolMg) ?? inferFromTableRows(tableRows, /(콜레스테롤|cholesterol)/i, 'mg');
  const dietaryFiberG =
    numOrNull(o.dietaryFiberG) ?? inferFromTableRows(tableRows, /(식이섬유|fiber|fibre)/i, 'g');
  const servingSizeText =
    o.servingSizeText != null && String(o.servingSizeText).trim() ? String(o.servingSizeText).trim() : null;
  const basisIsPerServing = o.basisIsPerServing !== false;
  if (
    tableRows.length === 0 &&
    caloriesKcal == null &&
    sodiumMg == null &&
    carbsG == null &&
    sugarG == null &&
    proteinG == null &&
    fatG == null &&
    saturatedFatG == null &&
    transFatG == null &&
    cholesterolMg == null &&
    dietaryFiberG == null &&
    !servingSizeText
  ) {
    return null;
  }
  return {
    caloriesKcal,
    sodiumMg,
    carbsG,
    sugarG,
    proteinG,
    fatG,
    saturatedFatG,
    transFatG,
    cholesterolMg,
    dietaryFiberG,
    servingSizeText: servingSizeText ?? undefined,
    basisIsPerServing,
    tableRows: tableRows.length > 0 ? tableRows : undefined,
  };
}

function normalizeFoodCategory(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (isCanonicalFoodCategory(s)) return s;
  return s.length > 0 ? s : null;
}

function normalizeNovaSubgroup(novaGroup: number, v: unknown): string | null {
  if (novaGroup !== 4) return null;
  const s = v != null ? String(v).trim().toUpperCase() : '';
  if (s === '4A' || s === '4B' || s === '4C') return s;
  return null;
}

type KoreanNovaClassification = {
  novaGroup: 1 | 2 | 3 | 4;
  novaSubgroup: '4A' | '4B' | '4C' | null;
};

type StructureType = 'simple_single' | 'simple_mix' | 'recomposed' | 'coated_or_flavored_mix';
type DominanceType = 'whole_base_dominant' | 'mixed_balanced' | 'ultra_signal_dominant';

type IngredientSignals = {
  decomposedCount: number;
  additiveCount: number;
  hasCoreAdditive: boolean;
  structureType: StructureType;
  dominanceType: DominanceType;
};

const DECOMPOSED_INGREDIENT_KEYWORDS = [
  '분리',
  '유청',
  '카제인',
  '글루텐',
  '가수분해',
  '변성전분',
  '말토덱스트린',
  '덱스트린',
  '고과당',
  '과당시럽',
  '액상과당',
  '분리대두단백',
  '단백질농축',
];

const ADDITIVE_KEYWORDS = ['감미료', '향료', '색소', '착색', '유화제', '보존료', '안정제', '산도조절제'];

/** NOVA 2 (조리용 가공) 후보 — 원재료 표 줄마다 이 계열만 있으면 2단계 후보로 봐요. */
const GROUP2_KEYWORDS = [
  '설탕',
  '소금',
  '올리고당',
  '물엿',
  '시럽',
  '꿀',
  '버터',
  '마가린',
  '식용유',
  '올리브유',
  '참기름',
  '들기름',
  '전분',
];

/** 시럽은 2단계 후보에 넣되, 초콜릿·사탕류와 붙은 줄은 2단계 전용으로 보지 않아요. */
const GROUP2_LINE_BLOCKERS = [
  '초코볼',
  '초콜릿',
  '초코',
  '사탕',
  '캔디',
  '젤리',
  '코팅',
  '쿠키',
  '비스킷',
  '크래커',
  '마시멜로',
];

const NUT_INGREDIENT_KEYWORDS = [
  '견과',
  '땅콩',
  '피넛',
  '아몬드',
  '호두',
  '캐슈',
  '피스타치오',
  '마카다미아',
  '헤이즐넛',
  '브라질넛',
  '피칸',
  '해바라기씨',
  '호박씨',
  'peanut',
  'almond',
  'walnut',
  'cashew',
  'pistachio',
  'pecan',
  'hazelnut',
  'macadamia',
  'brazil nut',
  'mixed nut',
  'tree nut',
];

const ULTRA_TOPPING_KEYWORDS = [
  '초코볼',
  '초콜릿',
  '사탕',
  '캔디',
  '젤리',
  '코팅',
  '시럽',
  '쿠키',
  '비스킷',
  '크래커',
  '마시멜로',
];

const WHOLE_BASE_INGREDIENT_KEYWORDS = [
  ...NUT_INGREDIENT_KEYWORDS,
  '채소',
  '야채',
  '양상추',
  '로메인',
  '케일',
  '시금치',
  '브로콜리',
  '당근',
  '토마토',
  '오이',
  '양배추',
  '귀리',
  '오트',
  '오트밀',
  '통곡물',
  '현미',
  '보리',
  '퀴노아',
  '그래놀라',
  '건포도',
  '크랜베리',
  '블루베리',
  '무화과',
  '대추',
  '과일',
  '씨앗',
  '치아씨드',
  '아마씨',
  '해바라기씨',
  '호박씨',
];

function splitRawMaterials(rawMaterials: string): string[] {
  return rawMaterials
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

function ingredientLineMatchesGroup2Candidate(line: string): boolean {
  return includesAnyKeyword(line, GROUP2_KEYWORDS);
}

/** 2단계 전용(조리용 재료만)으로 보기 어려운 줄 — 초콜릿·사탕 스낵, 분해원료, 첨가물 표기 등 */
function ingredientLineBlocksExclusiveGroup2(line: string): boolean {
  return (
    includesAnyKeyword(line, GROUP2_LINE_BLOCKERS) ||
    includesAnyKeyword(line, DECOMPOSED_INGREDIENT_KEYWORDS) ||
    includesAnyKeyword(line, ADDITIVE_KEYWORDS)
  );
}

/** 원재료가 전부 Group 2 계열이면 Group 2로 확정 (분해·첨가·스낵 혼합 신호 없음). */
function isExclusiveGroup2Product(
  ingredients: string[],
  decomposedCount: number,
  additiveCount: number,
  hasCoreAdditive: boolean,
): boolean {
  if (ingredients.length === 0) return false;
  if (decomposedCount > 0 || additiveCount > 0 || hasCoreAdditive) return false;
  return ingredients.every(
    (item) => ingredientLineMatchesGroup2Candidate(item) && !ingredientLineBlocksExclusiveGroup2(item),
  );
}

function parseIngredientPercent(item: string): number | null {
  const m = String(item).match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseIngredientSignals(v: unknown): IngredientSignals | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const d = typeof o.decomposedCount === 'number' ? o.decomposedCount : parseInt(String(o.decomposedCount), 10);
  const a = typeof o.additiveCount === 'number' ? o.additiveCount : parseInt(String(o.additiveCount), 10);
  const hasCore = o.hasCoreAdditive === true;
  const structureType = String(o.structureType ?? '').trim() as StructureType;
  const dominanceType = String(o.dominanceType ?? '').trim() as DominanceType;
  const structureOk =
    structureType === 'simple_single' ||
    structureType === 'simple_mix' ||
    structureType === 'recomposed' ||
    structureType === 'coated_or_flavored_mix';
  const dominanceOk =
    dominanceType === 'whole_base_dominant' ||
    dominanceType === 'mixed_balanced' ||
    dominanceType === 'ultra_signal_dominant';
  if (!Number.isFinite(d) || !Number.isFinite(a) || !structureOk || !dominanceOk) return null;
  return {
    decomposedCount: Math.max(0, Math.round(d)),
    additiveCount: Math.max(0, Math.round(a)),
    hasCoreAdditive: hasCore,
    structureType,
    dominanceType,
  };
}

function classifyByIngredientSignals(sig: IngredientSignals): KoreanNovaClassification {
  const decomposedCount = sig.decomposedCount;
  const additiveCount = sig.additiveCount;
  const hasCoreAdditive = sig.hasCoreAdditive;
  const s = decomposedCount + additiveCount;
  const simpleStructure = sig.structureType === 'simple_single' || sig.structureType === 'simple_mix';
  const wholeDominant = sig.dominanceType === 'whole_base_dominant';
  const ultraDominant = sig.dominanceType === 'ultra_signal_dominant';

  if (simpleStructure && decomposedCount === 0 && additiveCount === 0 && !hasCoreAdditive) {
    return { novaGroup: 1, novaSubgroup: null };
  }
  if (
    (simpleStructure || sig.structureType === 'coated_or_flavored_mix') &&
    wholeDominant &&
    decomposedCount === 0 &&
    additiveCount <= 2 &&
    !hasCoreAdditive
  ) {
    return { novaGroup: 3, novaSubgroup: null };
  }
  if (ultraDominant || decomposedCount >= 1 || additiveCount >= 3 || hasCoreAdditive) {
    if (wholeDominant && decomposedCount <= 1 && additiveCount <= 2) {
      // 우세 구조는 4A 상한
      return { novaGroup: 4, novaSubgroup: '4A' };
    }
    if (decomposedCount <= 1 && additiveCount <= 2) return { novaGroup: 4, novaSubgroup: '4A' };
    if (s <= 7) return { novaGroup: 4, novaSubgroup: '4B' };
    return { novaGroup: 4, novaSubgroup: '4C' };
  }
  return { novaGroup: 3, novaSubgroup: null };
}

/**
 * 견과·씨앗 위주인데 원재료 규칙은 3, 모델 ingredientSignals만 4로 올린 경우 —
 * 첨가·분해 개수를 과대 해석하면 4B가 나오기 쉬워요. 초콜릿·사탕 등 초가공 토핑이 섞인 믹스는 제외해요.
 */
function shouldPreferDeterministicNova3ForNutBaseSnack(
  rawMaterials: string,
  deterministicNova: KoreanNovaClassification | null,
  aiDrivenNova: KoreanNovaClassification | null,
): boolean {
  if (!deterministicNova || deterministicNova.novaGroup !== 3) return false;
  if (!aiDrivenNova || aiDrivenNova.novaGroup !== 4) return false;
  const ingredients = splitRawMaterials(rawMaterials);
  if (ingredients.length === 0) return false;
  const nutItems = ingredients.filter((item) => includesAnyKeyword(item, NUT_INGREDIENT_KEYWORDS));
  if (nutItems.length === 0 && !includesAnyKeyword(rawMaterials, NUT_INGREDIENT_KEYWORDS)) return false;
  const ultraToppingItems = ingredients.filter((item) => includesAnyKeyword(item, ULTRA_TOPPING_KEYWORDS));
  if (ultraToppingItems.length > 0) return false;
  return true;
}

/** 원재료 표에서 베리·건과로 보이는 첫 줄 — 판정 문장에 그대로 인용해요(다른 이름을 임의로 넣지 않음). */
const TRAIL_MIX_FRUIT_LINE_RE =
  /블루베리|크랜베리|건포도|건조포도|무화과|건망고|건사과|베리류?|cranberr|blueberr|raisin|건조\s*과일|건과류?/i;

function firstTrailMixFruitRawLine(rawMaterials: string): string | null {
  for (const line of splitRawMaterials(rawMaterials)) {
    if (TRAIL_MIX_FRUIT_LINE_RE.test(line)) {
      const t = line.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      return t.length > 96 ? `${t.slice(0, 93)}…` : t;
    }
  }
  return null;
}

function buildTrailMixCappedJudgment(productName: string, rawMaterials: string): string {
  const pn = productName.trim();
  const fruitLine = firstTrailMixFruitRawLine(rawMaterials);
  const tail =
    ' 견과류 본연의 맛을 즐기기 위해 가급적 첨가물이 적은 제품을 선택하는 것도 좋은 방법이에요.';

  if (pn) {
    if (fruitLine) {
      return `「${pn}」 원재료 표에 적힌 「${fruitLine}」에는 설탕·향료 등이 함께 들어갈 수 있어요.${tail}`;
    }
    return `「${pn}」은(는) 견과와 건과·베리류가 함께 들어 있는 믹스예요. 원재료 표에 설탕·향료 등이 함께 적힌 항목이 있을 수 있어요.${tail}`;
  }
  if (fruitLine) {
    return `원재료 표에 적힌 「${fruitLine}」에는 설탕·향료 등이 함께 들어갈 수 있어요.${tail}`;
  }
  return `견과 믹스에 건과·베리류가 함께 들어 있을 수 있어요. 원재료 표에 설탕·향료 등이 함께 적힌 항목이 있을 수 있어요.${tail}`;
}

function shouldCapNova3ForTrailMixNutProduct(rawMaterials: string, productName: string): boolean {
  const blob = `${rawMaterials}\n${productName}`.trim();
  if (!blob) return false;
  if (includesAnyKeyword(blob, ULTRA_TOPPING_KEYWORDS)) return false;
  if (!includesAnyKeyword(blob, NUT_INGREDIENT_KEYWORDS)) return false;

  const ingredients = splitRawMaterials(rawMaterials);
  if (ingredients.some((item) => includesAnyKeyword(item, DECOMPOSED_INGREDIENT_KEYWORDS))) {
    return false;
  }

  const nutLineCount = ingredients.filter((item) =>
    includesAnyKeyword(item, NUT_INGREDIENT_KEYWORDS),
  ).length;
  if (nutLineCount < 1) return false;

  const trailFruitOrBerry =
    /블루베리|크랜베리|건포도|건조포도|무화과|건망고|건사과|베리|cranberr|blueberr|raisin|건조\s*과일|건과(?:류)?/i.test(
      blob,
    );
  const nameLikeNutHandful =
    /너트한줌|한\s*줌|투데이\s*넛|today\s*nut|trail\s*mix|견과.*혼합|혼합\s*견과|너트\s*믹스/i.test(blob);

  if (trailFruitOrBerry) return true;
  if (nameLikeNutHandful && nutLineCount >= 2) return true;
  return false;
}

function classifyByKoreanNovaRules(rawMaterials: string): KoreanNovaClassification | null {
  const ingredients = splitRawMaterials(rawMaterials);
  if (ingredients.length === 0) return null;

  const decomposedCount = ingredients.filter((item) =>
    includesAnyKeyword(item, DECOMPOSED_INGREDIENT_KEYWORDS),
  ).length;
  const additiveCount = ingredients.filter((item) => includesAnyKeyword(item, ADDITIVE_KEYWORDS)).length;
  const hasCoreAdditive = ingredients.some((item) => item.includes('감미료') || item.includes('향료'));

  const nutItems = ingredients.filter((item) => includesAnyKeyword(item, NUT_INGREDIENT_KEYWORDS));
  const wholeBaseItems = ingredients.filter((item) =>
    includesAnyKeyword(item, WHOLE_BASE_INGREDIENT_KEYWORDS),
  );
  const ultraToppingItems = ingredients.filter((item) => includesAnyKeyword(item, ULTRA_TOPPING_KEYWORDS));
  const mixedNutSnack = nutItems.length > 0 && ultraToppingItems.length > 0;
  const mixedWholeBaseSnack = wholeBaseItems.length > 0 && ultraToppingItems.length > 0;
  const nutPercent = nutItems.reduce((acc, item) => acc + (parseIngredientPercent(item) ?? 0), 0);
  const wholeBasePercent = wholeBaseItems.reduce((acc, item) => acc + (parseIngredientPercent(item) ?? 0), 0);
  const toppingPercent = ultraToppingItems.reduce(
    (acc, item) => acc + (parseIngredientPercent(item) ?? 0),
    0,
  );
  const hasPercentSignal = nutPercent > 0 || wholeBasePercent > 0 || toppingPercent > 0;
  const nutDominantByMixRule = hasPercentSignal
    ? nutPercent >= 60 && toppingPercent < 30
    : nutItems.length >= ultraToppingItems.length * 2;
  const toppingHeavyByMixRule = hasPercentSignal
    ? toppingPercent >= 30
    : ultraToppingItems.length >= nutItems.length;
  const wholeBaseDominantWithSecondaryTopping = mixedWholeBaseSnack
    ? hasPercentSignal
      ? wholeBasePercent >= 50 && toppingPercent <= 35
      : wholeBaseItems.length > ultraToppingItems.length
    : false;

  // --- 1) Group 2: 조리용 가공 재료만 구성 (설탕·유지·시럽 등, 분해·첨가·스낵 혼합 없음) ---
  if (isExclusiveGroup2Product(ingredients, decomposedCount, additiveCount, hasCoreAdditive)) {
    return { novaGroup: 2, novaSubgroup: null };
  }

  // --- 2) Group 1: 미가공 또는 최소 가공 단일 식품 ---
  if (ingredients.length === 1 && decomposedCount === 0 && additiveCount === 0 && !hasCoreAdditive) {
    return { novaGroup: 1, novaSubgroup: null };
  }

  // --- 3) Group 3: 가공식품 (혼합·우세 구조·완만한 첨가) ---
  // 혼합 구성 우세 법칙: 견과류+사탕/토핑 혼합에서는 "무엇이 우세한지"를 먼저 봐요.
  if (mixedNutSnack) {
    if (nutDominantByMixRule && decomposedCount === 0 && additiveCount <= 2 && !hasCoreAdditive) {
      return { novaGroup: 3, novaSubgroup: null };
    }
    if (toppingHeavyByMixRule) {
      const strongToppingSignal = toppingPercent >= 45 || additiveCount >= 3 || decomposedCount >= 1;
      return { novaGroup: 4, novaSubgroup: strongToppingSignal ? '4B' : '4A' };
    }
  }
  // 우세 구조 법칙: 통견과/씨앗/건과일이 주체이고 초가공 토핑이 보조면 최종을 4A 초과로 올리지 않아요.
  if (wholeBaseDominantWithSecondaryTopping) {
    if (decomposedCount === 0 && additiveCount <= 2 && !hasCoreAdditive) {
      return { novaGroup: 3, novaSubgroup: null };
    }
    return { novaGroup: 4, novaSubgroup: '4A' };
  }
  if (ingredients.length >= 2 && decomposedCount === 0 && additiveCount <= 2 && !hasCoreAdditive) {
    return { novaGroup: 3, novaSubgroup: null };
  }

  // --- 4) Group 4: 초가공 (4A → 4B → 4C) ---
  const s = decomposedCount + additiveCount;
  if (decomposedCount <= 1 && additiveCount <= 2) {
    return { novaGroup: 4, novaSubgroup: '4A' };
  }
  if (s <= 7) {
    return { novaGroup: 4, novaSubgroup: '4B' };
  }
  return { novaGroup: 4, novaSubgroup: '4C' };
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function parseNumericPercentFragment(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim();
  return parseFloat(s);
}

function parsePercentPair(
  minRaw: unknown,
  maxRaw: unknown,
): { minPercent: number | null; maxPercent: number | null } {
  if (minRaw == null && maxRaw == null) return { minPercent: null, maxPercent: null };
  let min = typeof minRaw === 'number' ? minRaw : parseNumericPercentFragment(minRaw);
  let max = typeof maxRaw === 'number' ? maxRaw : parseNumericPercentFragment(maxRaw);
  if (!Number.isFinite(min)) min = Number.NaN;
  if (!Number.isFinite(max)) max = Number.NaN;
  if (!Number.isFinite(min) && !Number.isFinite(max)) return { minPercent: null, maxPercent: null };
  if (!Number.isFinite(min)) min = max;
  if (!Number.isFinite(max)) max = min;
  let a = clampPercent(min);
  let b = clampPercent(max);
  if (a > b) [a, b] = [b, a];
  // 모델이 애매할 때 던지는 0~100 같은 무의미한 전구간 값은 노출하지 않아요.
  if (a <= 0.1 && b >= 99.9) return { minPercent: null, maxPercent: null };
  if (b - a >= 95) return { minPercent: null, maxPercent: null };
  return { minPercent: a, maxPercent: b };
}

function parseKeyInsights(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    const s = x != null ? String(x).trim() : '';
    if (s) out.push(s);
    if (out.length >= 5) break;
  }
  return out.length > 0 ? out : null;
}

function parseAnalysisConfidence(raw: unknown): AnalysisConfidenceLevel | null {
  const s = raw != null ? String(raw).trim().toLowerCase() : '';
  if (s === 'low' || s === 'medium' || s === 'high') return s;
  return null;
}

function parseLabelExplicitPercentages(raw: unknown): LabelExplicitPercentage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: LabelExplicitPercentage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = o.name != null ? String(o.name).trim() : '';
    const p =
      typeof o.percent === 'number' ? o.percent : parseNumericPercentFragment(o.percent ?? '');
    if (!name || !Number.isFinite(p)) continue;
    out.push({ name, percent: clampPercent(p) });
    if (out.length >= 15) break;
  }
  return out.length > 0 ? out : null;
}

function concernMinMaxRawFromItem(item: {
  minPercent?: unknown;
  maxPercent?: unknown;
}): { minRaw: unknown; maxRaw: unknown } {
  const rec = item as Record<string, unknown>;
  return {
    minRaw:
      rec.minPercent ??
      rec.min_percent ??
      rec.estimatedMinPercent ??
      rec.estimated_min_percent,
    maxRaw:
      rec.maxPercent ??
      rec.max_percent ??
      rec.estimatedMaxPercent ??
      rec.estimated_max_percent,
  };
}

function mergeExplicitPercentIntoConcerns(
  concerns: Array<{
    name: string;
    explanation: string;
    minPercent: number | null;
    maxPercent: number | null;
  }>,
  labels: LabelExplicitPercentage[] | null,
): Array<{
  name: string;
  explanation: string;
  minPercent: number | null;
  maxPercent: number | null;
}> {
  if (!labels || labels.length === 0) return concerns;
  return concerns.map((c) => {
    if (c.minPercent != null && c.maxPercent != null) return c;
    const p = matchLabelPercentForConcernName(c.name, labels);
    if (p == null) return c;
    return { ...c, minPercent: p, maxPercent: p };
  });
}

function matchLabelPercentForConcernName(
  concernName: string,
  labels: LabelExplicitPercentage[],
): number | null {
  const n = concernName.trim().toLowerCase().replace(/\s+/g, '');
  if (n.length < 2) return null;
  for (const lp of labels) {
    const ln = lp.name.trim().toLowerCase().replace(/\s+/g, '');
    if (ln.length < 2) continue;
    if (n.includes(ln) || ln.includes(n)) return lp.percent;
  }
  return null;
}

function isNutritionLabelLike(name: string): boolean {
  const n = (name || '').trim().toLowerCase();
  if (!n) return true;
  return /(?:나트륨|당류|열량|칼로리|kcal|탄수화물|단백질|지방|포화지방|트랜스지방|콜레스테롤|식이섬유|탄수|protein|fat|carb|sodium|calorie|칼슘|칼륨|인\b|철\b|철분|마그네슘|아연|셀레늄|요오드|엽산|니아신|판토텐|티아민|리보플라빈|피리독신|비오틴|비타민|비타민a|비타민d|비타민c|비타민e|비타민k|비타민 b|회분|수분)/i.test(
    n
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickFirstStringField(rec: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = rec[k];
    if (v == null) continue;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) return s;
      continue;
    }
    if (typeof v === 'number') {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

function extractProductCoreFields(parsed: Record<string, unknown>): {
  productName: string;
  companyName: string;
  rawMaterials: string;
} {
  const nameKeys = ['productName', 'product_name', 'name', '제품명', '상품명', '식품명'];
  const companyKeys = ['companyName', 'company_name', 'manufacturer', 'brand', '제조원', '제조사', '업체명'];
  const rawKeys = [
    'rawMaterials',
    'raw_materials',
    'ingredients',
    'ingredientList',
    '원재료',
    '원재료명',
    '원재료명및함량',
  ];

  let productName = pickFirstStringField(parsed, nameKeys);
  let companyName = pickFirstStringField(parsed, companyKeys);
  let rawMaterials = pickFirstStringField(parsed, rawKeys);

  const containers = ['product', 'item', 'analysis', 'result', 'data', 'output', 'label'];
  for (const c of containers) {
    const inner = asRecord(parsed[c]);
    if (!inner) continue;
    if (!productName) productName = pickFirstStringField(inner, nameKeys);
    if (!companyName) companyName = pickFirstStringField(inner, companyKeys);
    if (!rawMaterials) rawMaterials = pickFirstStringField(inner, rawKeys);
    if (productName && companyName && rawMaterials) break;
  }

  return { productName, companyName, rawMaterials };
}

/**
 * 원재료 문자열로 이미 Group 2(조리용 가공)가 확정되면, 모델 ingredientSignals가
 * 단일·무첨가로 Group 1을 줘도 덮어쓰지 않아요. (설탕만 있는데 1단계로 나오는 문제 방지)
 */
function mergeNovaGroupWithRawMaterialPriority(
  aiDrivenNova: KoreanNovaClassification | null,
  deterministicNova: KoreanNovaClassification | null,
  modelNovaGroup: number,
): number {
  if (deterministicNova?.novaGroup === 2) return 2;
  return aiDrivenNova?.novaGroup ?? deterministicNova?.novaGroup ?? modelNovaGroup;
}

export function buildAnalysisResultFromGeminiObject(parsed: Record<string, unknown>): AnalysisResult {
  const core = extractProductCoreFields(parsed);
  const product = {
    productName: core.productName,
    companyName: core.companyName,
    rawMaterials: core.rawMaterials,
  };
  const modelNovaGroup = Math.min(4, Math.max(1, parseInt(String(parsed.novaGroup), 10) || 4));
  const modelSignals = parseIngredientSignals(parsed.ingredientSignals);
  const aiDrivenNova = modelSignals ? classifyByIngredientSignals(modelSignals) : null;
  const deterministicNova = classifyByKoreanNovaRules(product.rawMaterials);
  let novaGroup = mergeNovaGroupWithRawMaterialPriority(aiDrivenNova, deterministicNova, modelNovaGroup);
  const labelExplicitPercentages = parseLabelExplicitPercentages(parsed.labelExplicitPercentages);

  const concernIngredientsRaw = Array.isArray(parsed.concernIngredients)
    ? (
        parsed.concernIngredients as Array<{
          name?: string;
          explanation?: string;
          minPercent?: unknown;
          maxPercent?: unknown;
        }>
      )
        .map((c) => {
          const { minRaw, maxRaw } = concernMinMaxRawFromItem(c);
          const { minPercent, maxPercent } = parsePercentPair(minRaw, maxRaw);
          return {
            name: (c.name || '').trim(),
            explanation: (c.explanation || '').trim(),
            minPercent,
            maxPercent,
          };
        })
        .filter((c) => c.name.length > 0 && !isNutritionLabelLike(c.name))
        .slice(0, 3)
    : [];

  const concernIngredients = mergeExplicitPercentIntoConcerns(
    concernIngredientsRaw,
    labelExplicitPercentages,
  );

  const keyInsights = parseKeyInsights(parsed.keyInsights);
  const analysisConfidence = parseAnalysisConfidence(parsed.analysisConfidence);

  const nutritionParsed = parseNutrition(parsed.nutrition);
  const nutritionDailyPercent: NutritionDailyPercent | null = nutritionParsed
    ? computeDailyPercentages(nutritionParsed)
    : null;

  const foodCategory = normalizeFoodCategory(parsed.foodCategory);
  const personalizedIntakeNote =
    parsed.consumptionAdvice != null && String(parsed.consumptionAdvice).trim().length > 0
      ? String(parsed.consumptionAdvice).trim()
      : null;
  const personalizedIntakeFootnote = null;

  const modelNovaSubgroup = normalizeNovaSubgroup(modelNovaGroup, parsed.novaSubgroup);
  let novaSubgroup =
    deterministicNova?.novaGroup === 2
      ? null
      : aiDrivenNova?.novaSubgroup ?? deterministicNova?.novaSubgroup ?? modelNovaSubgroup;

  if (shouldPreferDeterministicNova3ForNutBaseSnack(product.rawMaterials, deterministicNova, aiDrivenNova)) {
    novaGroup = 3;
    novaSubgroup = null;
  }

  let judgmentReason =
    parsed.judgmentReason != null && String(parsed.judgmentReason).trim().length > 0
      ? String(parsed.judgmentReason).trim()
      : null;

  if (
    novaGroup === 4 &&
    shouldCapNova3ForTrailMixNutProduct(product.rawMaterials, product.productName)
  ) {
    novaGroup = 3;
    novaSubgroup = null;
    judgmentReason = buildTrailMixCappedJudgment(product.productName, product.rawMaterials);
  }

  return {
    product,
    novaGroup,
    novaSubgroup,
    judgmentReason,
    concernIngredients,
    keyInsights,
    analysisConfidence,
    labelExplicitPercentages,
    briefDescription:
      parsed.briefDescription != null && String(parsed.briefDescription).trim().length > 0
        ? String(parsed.briefDescription).trim()
        : null,
    consumptionAdvice:
      parsed.consumptionAdvice != null && String(parsed.consumptionAdvice).trim().length > 0
        ? String(parsed.consumptionAdvice).trim()
        : null,
    foodCategory,
    nutrition: nutritionParsed,
    nutritionDailyPercent,
    personalizedIntakeNote,
    personalizedIntakeFootnote,
    alternativeFoodText: null,
    alternativeFoodFromWebSearch: false,
    alternativeFoodEngineFallback: false,
    alternativeUnavailableReason: null,
  };
}
