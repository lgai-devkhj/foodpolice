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

const COOKING_INGREDIENT_KEYWORDS = ['설탕', '소금', '버터', '식용유', '꿀', '전분'];

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

function classifyByKoreanNovaRules(rawMaterials: string): KoreanNovaClassification | null {
  const ingredients = splitRawMaterials(rawMaterials);
  if (ingredients.length === 0) return null;

  const decomposedCount = ingredients.filter((item) =>
    includesAnyKeyword(item, DECOMPOSED_INGREDIENT_KEYWORDS)
  ).length;
  const additiveCount = ingredients.filter((item) => includesAnyKeyword(item, ADDITIVE_KEYWORDS)).length;
  const hasCoreAdditive = ingredients.some((item) => item.includes('감미료') || item.includes('향료'));
  const isSingleCookingIngredient =
    ingredients.length === 1 && includesAnyKeyword(ingredients[0], COOKING_INGREDIENT_KEYWORDS);
  const nutItems = ingredients.filter((item) => includesAnyKeyword(item, NUT_INGREDIENT_KEYWORDS));
  const wholeBaseItems = ingredients.filter((item) =>
    includesAnyKeyword(item, WHOLE_BASE_INGREDIENT_KEYWORDS)
  );
  const ultraToppingItems = ingredients.filter((item) => includesAnyKeyword(item, ULTRA_TOPPING_KEYWORDS));
  const mixedNutSnack = nutItems.length > 0 && ultraToppingItems.length > 0;
  const mixedWholeBaseSnack = wholeBaseItems.length > 0 && ultraToppingItems.length > 0;
  const nutPercent = nutItems.reduce((acc, item) => acc + (parseIngredientPercent(item) ?? 0), 0);
  const wholeBasePercent = wholeBaseItems.reduce((acc, item) => acc + (parseIngredientPercent(item) ?? 0), 0);
  const toppingPercent = ultraToppingItems.reduce(
    (acc, item) => acc + (parseIngredientPercent(item) ?? 0),
    0
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

  if (isSingleCookingIngredient) {
    return { novaGroup: 2, novaSubgroup: null };
  }
  if (ingredients.length === 1 && decomposedCount === 0 && additiveCount === 0) {
    return { novaGroup: 1, novaSubgroup: null };
  }
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

export function buildAnalysisResultFromGeminiObject(parsed: Record<string, unknown>): AnalysisResult {
  const product = {
    productName: (parsed.productName != null ? String(parsed.productName).trim() : '') as string,
    companyName: (parsed.companyName != null ? String(parsed.companyName).trim() : '') as string,
    rawMaterials: (parsed.rawMaterials != null ? String(parsed.rawMaterials).trim() : '') as string,
  };
  const modelNovaGroup = Math.min(4, Math.max(1, parseInt(String(parsed.novaGroup), 10) || 4));
  const modelSignals = parseIngredientSignals(parsed.ingredientSignals);
  const aiDrivenNova = modelSignals ? classifyByIngredientSignals(modelSignals) : null;
  const deterministicNova = classifyByKoreanNovaRules(product.rawMaterials);
  let novaGroup = aiDrivenNova?.novaGroup ?? deterministicNova?.novaGroup ?? modelNovaGroup;
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
    aiDrivenNova?.novaSubgroup ?? deterministicNova?.novaSubgroup ?? modelNovaSubgroup;

  if (shouldPreferDeterministicNova3ForNutBaseSnack(product.rawMaterials, deterministicNova, aiDrivenNova)) {
    novaGroup = 3;
    novaSubgroup = null;
  }

  return {
    product,
    novaGroup,
    novaSubgroup,
    judgmentReason:
      parsed.judgmentReason != null && String(parsed.judgmentReason).trim().length > 0
        ? String(parsed.judgmentReason).trim()
        : null,
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
