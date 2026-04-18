import {
  computeDailyPercentages,
  type NutritionDailyPercent,
  type NutritionFactsInput,
} from '@/lib/nutrition-daily';
import type {
  AnalysisConfidenceLevel,
  AnalysisResult,
  EstimatedIngredient,
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

const FOOD_CATEGORIES = [
  '음료',
  '달콤한 간식',
  '짭짤한 간식',
  '간편한 한 끼',
  '빵·시리얼류',
  '유제품·디저트',
] as const;

function normalizeFoodCategory(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (FOOD_CATEGORIES.includes(s as (typeof FOOD_CATEGORIES)[number])) return s;
  return s.length > 0 ? s : null;
}

function normalizeNovaSubgroup(novaGroup: number, v: unknown): string | null {
  if (novaGroup !== 4) return null;
  const s = v != null ? String(v).trim().toUpperCase() : '';
  if (s === '4A' || s === '4B' || s === '4C') return s;
  return null;
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function parsePercentPair(
  minRaw: unknown,
  maxRaw: unknown,
): { minPercent: number | null; maxPercent: number | null } {
  if (minRaw == null && maxRaw == null) return { minPercent: null, maxPercent: null };
  let min =
    typeof minRaw === 'number' ? minRaw : parseFloat(String(minRaw ?? '').replace(/,/g, ''));
  let max =
    typeof maxRaw === 'number' ? maxRaw : parseFloat(String(maxRaw ?? '').replace(/,/g, ''));
  if (!Number.isFinite(min)) min = Number.NaN;
  if (!Number.isFinite(max)) max = Number.NaN;
  if (!Number.isFinite(min) && !Number.isFinite(max)) return { minPercent: null, maxPercent: null };
  if (!Number.isFinite(min)) min = max;
  if (!Number.isFinite(max)) max = min;
  let a = clampPercent(min);
  let b = clampPercent(max);
  if (a > b) [a, b] = [b, a];
  return { minPercent: a, maxPercent: b };
}

function parseEstimatedIngredients(raw: unknown): EstimatedIngredient[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EstimatedIngredient[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = o.name != null ? String(o.name).trim() : '';
    if (!name) continue;
    const { minPercent: mn, maxPercent: mx } = parsePercentPair(o.minPercent, o.maxPercent);
    if (mn == null || mx == null) continue;
    out.push({
      name,
      minPercent: mn,
      maxPercent: mx,
      isConcern: o.isConcern === true,
    });
    if (out.length >= 20) break;
  }
  return out.length > 0 ? out : null;
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
    const p = typeof o.percent === 'number' ? o.percent : parseFloat(String(o.percent ?? ''));
    if (!name || !Number.isFinite(p)) continue;
    out.push({ name, percent: clampPercent(p) });
    if (out.length >= 15) break;
  }
  return out.length > 0 ? out : null;
}

function isNutritionLabelLike(name: string): boolean {
  const n = (name || '').trim().toLowerCase();
  if (!n) return true;
  return /(?:나트륨|당류|열량|칼로리|kcal|탄수화물|단백질|지방|포화지방|트랜스지방|콜레스테롤|식이섬유|탄수|protein|fat|carb|sodium|calorie|칼슘|칼륨|인\b|철\b|철분|마그네슘|아연|셀레늄|요오드|엽산|니아신|판토텐|티아민|리보플라빈|피리독신|비오틴|비타민|비타민a|비타민d|비타민c|비타민e|비타민k|비타민 b|회분|수분)/i.test(
    n
  );
}

/** `/api/analyze`·`/api/compare` 공통: Gemini JSON 한 덩어리 → 앱 `AnalysisResult` 형태 */
export function buildAnalysisResultFromGeminiObject(
  parsed: Record<string, unknown>,
  options?: { dailyQuestProductMatch?: boolean }
): AnalysisResult {
  const product = {
    productName: (parsed.productName != null ? String(parsed.productName).trim() : '') as string,
    companyName: (parsed.companyName != null ? String(parsed.companyName).trim() : '') as string,
    rawMaterials: (parsed.rawMaterials != null ? String(parsed.rawMaterials).trim() : '') as string,
  };
  const novaGroup = Math.min(4, Math.max(1, parseInt(String(parsed.novaGroup), 10) || 4));
  const concernIngredients = Array.isArray(parsed.concernIngredients)
    ? (
        parsed.concernIngredients as Array<{
          name?: string;
          explanation?: string;
          minPercent?: unknown;
          maxPercent?: unknown;
        }>
      )
        .map((c) => {
          const { minPercent, maxPercent } = parsePercentPair(c.minPercent, c.maxPercent);
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

  const estimatedIngredients = parseEstimatedIngredients(parsed.estimatedIngredients);
  const keyInsights = parseKeyInsights(parsed.keyInsights);
  const analysisConfidence = parseAnalysisConfidence(parsed.analysisConfidence);
  const labelExplicitPercentages = parseLabelExplicitPercentages(parsed.labelExplicitPercentages);

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

  const novaSubgroup = normalizeNovaSubgroup(novaGroup, parsed.novaSubgroup);

  const dailyQuestProductMatch = options?.dailyQuestProductMatch === true;

  return {
    product,
    novaGroup,
    novaSubgroup,
    judgmentReason:
      parsed.judgmentReason != null && String(parsed.judgmentReason).trim().length > 0
        ? String(parsed.judgmentReason).trim()
        : null,
    concernIngredients,
    estimatedIngredients,
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
    dailyQuestProductMatch,
  };
}
