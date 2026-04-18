/**
 * 라벨 정보만으로 원재료 함량(%)을 규칙·수식 기반으로 근사 추정합니다.
 * 법적·분석 확정값이 아닌 참고용 근사치입니다.
 */

import type { IngredientRole, ValidateEstimatesAiResult } from '@/lib/ingredient-composition-ai';

export type ServingBasis = '100g' | '100ml' | 'serving';

export interface NutritionPer100g {
  fat: number;
  carbs: number;
  sugars: number;
  protein: number;
}

export interface IngredientCompositionInput {
  ingredients: string[];
  nutritionPer100g: NutritionPer100g;
  knownPercents: Record<string, number>;
  category: string;
  servingBasis: ServingBasis;
  /** 100ml 기준일 때 100g 환산용 (g/ml). 없으면 카테고리 기본값 사용 */
  densityGPerMl?: number;
  /** true면 순서 제약 완화(동률 허용 등은 별도 플래그 없이 완화만) */
  relaxOrder?: boolean;
}

export interface IngredientProfile {
  fat: number;
  carbs: number;
  sugars: number;
  protein: number;
  water: number;
}

export interface IngredientEstimateRow {
  name: string;
  estimatedPercent: number;
  minPercent: number;
  maxPercent: number;
  confidence: number;
  reasons: string[];
}

export interface IngredientCompositionResult {
  ingredientsEstimate: IngredientEstimateRow[];
  totalError: number;
  assumptions: string[];
  warnings: string[];
  summary: string;
  /** 하이브리드 모드에서 AI priors·검증 사용 여부 */
  aiUsed?: boolean;
  /** AI가 제시한 priors 신뢰도(0~1), 수식만이면 생략 */
  priorsConfidence?: number;
  /** AI 검증 단계 메모 */
  adjustmentNotes?: string[];
  /** 내부 진단용 */
  _debug?: {
    normalizedKeys: string[];
    matchedKnown: Record<string, number>;
    nutritionTarget: NutritionPer100g;
  };
}

export interface CompositeIngredientMeta {
  displayName: string;
  /** 향후 하위 분해용 */
  children?: { name: string; ratioInComposite: number }[];
}

const DEFAULT_UNKNOWN_PROFILE: IngredientProfile = {
  fat: 5,
  carbs: 50,
  sugars: 25,
  protein: 5,
  water: 35,
};

const CATEGORY_DEFAULT_DENSITY: Record<string, number> = {
  icecream: 1.05,
  drink: 1.02,
  snack: 0.45,
  bread: 0.35,
};

/** 카테고리별 canonical 키 → 100g당 대표 영양 (문헌·일반값 근사, 참고용) */
const PROFILE_BY_CATEGORY: Record<string, Record<string, IngredientProfile>> = {
  icecream: {
    cream: { fat: 37, carbs: 3, sugars: 3, protein: 2.5, water: 55 },
    milk: { fat: 3.5, carbs: 5, sugars: 5, protein: 3.3, water: 87 },
    skim_milk: { fat: 0.2, carbs: 5, sugars: 5, protein: 3.4, water: 91 },
    skim_milk_powder: { fat: 1, carbs: 52, sugars: 52, protein: 36, water: 3 },
    sugar: { fat: 0, carbs: 100, sugars: 100, protein: 0, water: 0 },
    egg_yolk: { fat: 26, carbs: 4, sugars: 0.5, protein: 16, water: 52 },
    egg: { fat: 10, carbs: 1, sugars: 0.5, protein: 13, water: 75 },
    butter: { fat: 81, carbs: 0.8, sugars: 0.6, protein: 0.9, water: 16 },
    cocoa_mass: { fat: 52, carbs: 15, sugars: 2, protein: 8, water: 3 },
    cocoa_powder: { fat: 14, carbs: 58, sugars: 2, protein: 20, water: 6 },
    syrup: { fat: 0, carbs: 78, sugars: 78, protein: 0, water: 22 },
    water: { fat: 0, carbs: 0, sugars: 0, protein: 0, water: 100 },
    strawberry_puree: { fat: 0.4, carbs: 8, sugars: 5, protein: 0.7, water: 90 },
    milk_powder: { fat: 26, carbs: 38, sugars: 38, protein: 26, water: 4 },
    chocolate_chip: { fat: 28, carbs: 58, sugars: 50, protein: 6, water: 2 },
    compound_chocolate: { fat: 30, carbs: 58, sugars: 52, protein: 5, water: 3 },
    vanilla: { fat: 0, carbs: 0, sugars: 0, protein: 0, water: 35 },
    emulsifier: { fat: 90, carbs: 0, sugars: 0, protein: 0, water: 0 },
    stabilizer: { fat: 0, carbs: 80, sugars: 0, protein: 0, water: 20 },
  },
  drink: {
    water: { fat: 0, carbs: 0, sugars: 0, protein: 0, water: 100 },
    sugar: { fat: 0, carbs: 100, sugars: 100, protein: 0, water: 0 },
    fructose: { fat: 0, carbs: 100, sugars: 100, protein: 0, water: 0 },
    concentrate: { fat: 0, carbs: 40, sugars: 35, protein: 1, water: 58 },
    milk: { fat: 3.5, carbs: 5, sugars: 5, protein: 3.3, water: 87 },
    flavor: { fat: 0, carbs: 20, sugars: 15, protein: 0, water: 75 },
    acidulant: { fat: 0, carbs: 0, sugars: 0, protein: 0, water: 100 },
    tea_extract: { fat: 0, carbs: 2, sugars: 0, protein: 0, water: 98 },
    coffee_extract: { fat: 0, carbs: 3, sugars: 0, protein: 1, water: 96 },
  },
  snack: {
    flour: { fat: 1.5, carbs: 76, sugars: 0.5, protein: 10, water: 12 },
    sugar: { fat: 0, carbs: 100, sugars: 100, protein: 0, water: 0 },
    palm_oil: { fat: 100, carbs: 0, sugars: 0, protein: 0, water: 0 },
    starch: { fat: 0, carbs: 88, sugars: 0, protein: 0.5, water: 11 },
    cocoa_powder: { fat: 14, carbs: 58, sugars: 2, protein: 20, water: 6 },
    skim_milk_powder: { fat: 1, carbs: 52, sugars: 52, protein: 36, water: 3 },
    salt: { fat: 0, carbs: 0, sugars: 0, protein: 0, water: 0 },
    leavening: { fat: 0, carbs: 0, sugars: 0, protein: 0, water: 0 },
    egg: { fat: 10, carbs: 1, sugars: 0.5, protein: 13, water: 75 },
  },
  bread: {
    wheat_flour: { fat: 1.5, carbs: 76, sugars: 0.5, protein: 10, water: 12 },
    sugar: { fat: 0, carbs: 100, sugars: 100, protein: 0, water: 0 },
    butter: { fat: 81, carbs: 0.8, sugars: 0.6, protein: 0.9, water: 16 },
    margarine: { fat: 80, carbs: 1, sugars: 0, protein: 0.5, water: 17 },
    egg: { fat: 10, carbs: 1, sugars: 0.5, protein: 13, water: 75 },
    milk_powder: { fat: 26, carbs: 38, sugars: 38, protein: 26, water: 4 },
    yeast: { fat: 1.5, carbs: 40, sugars: 0, protein: 40, water: 10 },
    water: { fat: 0, carbs: 0, sugars: 0, protein: 0, water: 100 },
  },
};

/** 표기 다양성 → canonical 키 */
const NAME_ALIASES: Record<string, string> = {
  유크림: 'cream',
  크림: 'cream',
  혼합크림: 'cream',
  생크림: 'cream',
  우유: 'milk',
  탈지우유: 'skim_milk',
  탈지분유: 'skim_milk_powder',
  탈지우유분말: 'skim_milk_powder',
  분유: 'milk_powder',
  전지분유: 'milk_powder',
  설탕: 'sugar',
  백설탕: 'sugar',
  정제당: 'sugar',
  물엿: 'syrup',
  올리고당: 'syrup',
  난황: 'egg_yolk',
  계란: 'egg',
  달걀: 'egg',
  버터: 'butter',
  마가린: 'margarine',
  코코아매스: 'cocoa_mass',
  코코아분말: 'cocoa_powder',
  카카오분말: 'cocoa_powder',
  딸기퓨레: 'strawberry_puree',
  초코칩: 'chocolate_chip',
  초콜릿칩: 'chocolate_chip',
  준초콜릿: 'compound_chocolate',
  정제수: 'water',
  정제수등: 'water',
  물: 'water',
  밀가루: 'flour',
  밀가루배합: 'flour',
  박력분: 'flour',
  팜유: 'palm_oil',
  전분: 'starch',
  팥앙금: 'sugar',
  소금: 'salt',
  이스트: 'yeast',
  유당: 'sugar',
  향료: 'flavor',
  식품첨가물: 'stabilizer',
  액상과당: 'fructose',
  오렌지농축액: 'concentrate',
  구연산: 'acidulant',
};

const CATEGORY_PRIOR_WEIGHT: Record<string, Record<string, number>> = {
  icecream: {
    cream: 1.4,
    milk: 1.1,
    skim_milk: 0.9,
    skim_milk_powder: 0.8,
    sugar: 1.0,
    egg_yolk: 0.5,
    egg: 0.3,
    butter: 0.4,
    water: 0.2,
    cocoa_mass: 0.5,
    cocoa_powder: 0.4,
    syrup: 0.6,
    strawberry_puree: 0.7,
    milk_powder: 0.75,
    chocolate_chip: 0.6,
    compound_chocolate: 0.6,
    vanilla: 0.1,
    emulsifier: 0.15,
    stabilizer: 0.15,
  },
  drink: { water: 2.5, sugar: 0.8, fructose: 0.7, concentrate: 0.9, milk: 0.6, flavor: 0.4, acidulant: 0.2 },
  snack: { flour: 1.2, sugar: 0.9, palm_oil: 0.8, starch: 0.5, cocoa_powder: 0.4, skim_milk_powder: 0.5, egg: 0.3 },
  bread: { wheat_flour: 1.5, water: 0.8, sugar: 0.5, butter: 0.4, margarine: 0.35, egg: 0.35, milk_powder: 0.3, yeast: 0.2 },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

/** 공백·특수문자 정리 후 alias 매칭 */
export function normalizeIngredientName(raw: string): string {
  const s = raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(/[,，]/g, '');
  if (!s) return 'unknown';
  if (NAME_ALIASES[s]) return NAME_ALIASES[s];
  const lower = s.toLowerCase();
  for (const [k, v] of Object.entries(NAME_ALIASES)) {
    if (k.toLowerCase() === lower) return v;
  }
  if (s.includes('크림') && !s.includes('치즈')) return 'cream';
  if (s.includes('설탕') || s.includes('당')) return 'sugar';
  if (s.includes('탈지') && s.includes('분')) return 'skim_milk_powder';
  if (s.includes('우유') && !s.includes('분')) return 'milk';
  if (s.includes('난황')) return 'egg_yolk';
  if (s.includes('물') && s.length <= 3) return 'water';
  return 'unknown';
}

export function getIngredientProfile(canonical: string, category: string): IngredientProfile {
  const cat = (category || 'snack').toLowerCase();
  const db = PROFILE_BY_CATEGORY[cat] || PROFILE_BY_CATEGORY.snack;
  if (db[canonical]) return { ...db[canonical] };
  for (const c of [cat, 'snack', 'icecream']) {
    const alt = PROFILE_BY_CATEGORY[c]?.[canonical];
    if (alt) return { ...alt };
  }
  return { ...DEFAULT_UNKNOWN_PROFILE };
}

function nutritionFromPercents(p: number[], profiles: IngredientProfile[]): NutritionPer100g {
  let fat = 0,
    carbs = 0,
    sugars = 0,
    protein = 0;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const w = p[i] / 100;
    fat += w * profiles[i].fat;
    carbs += w * profiles[i].carbs;
    sugars += w * profiles[i].sugars;
    protein += w * profiles[i].protein;
  }
  return { fat, carbs, sugars, protein };
}

export function predictNutritionFromEstimates(
  percents: number[],
  profiles: IngredientProfile[],
): NutritionPer100g {
  return nutritionFromPercents(percents, profiles);
}

/** 비음수·합 100 투영 */
function projectSimplex(p: number[]): number[] {
  const n = p.length;
  let x = p.map((v) => Math.max(0, v));
  const s = sum(x);
  if (s < 1e-9) return new Array(n).fill(100 / n);
  return x.map((v) => (v / s) * 100);
}

/** 감소 수열 투영 (PAVA on -p) */
function projectNonIncreasing(p: number[]): number[] {
  const n = p.length;
  if (n <= 1) return [...p];
  const x = [...p];
  let changed = true;
  let guard = 0;
  while (changed && guard++ < n * 8) {
    changed = false;
    for (let i = 0; i < n - 1; i++) {
      if (x[i] < x[i + 1]) {
        const m = (x[i] + x[i + 1]) / 2;
        x[i] = m;
        x[i + 1] = m;
        changed = true;
      }
    }
  }
  return x;
}

function applyKnownAndRenormalize(
  p: number[],
  fixed: Map<number, number>,
): number[] {
  const n = p.length;
  const out = [...p];
  let fixedSum = 0;
  fixed.forEach((v) => {
    fixedSum += v;
  });
  if (fixedSum > 100 + 1e-6) {
    const scale = 100 / fixedSum;
    fixed.forEach((v, i) => {
      out[i] = v * scale;
    });
  } else {
    fixed.forEach((v, i) => {
      out[i] = v;
    });
  }
  const rem = 100 - sum(Array.from(fixed.entries()).map(([i]) => out[i]));
  const freeIdx: number[] = [];
  for (let i = 0; i < n; i++) if (!fixed.has(i)) freeIdx.push(i);
  if (freeIdx.length === 0) return projectSimplex(out);
  let sFree = sum(freeIdx.map((i) => out[i]));
  if (sFree < 1e-9) {
    const eq = rem / freeIdx.length;
    freeIdx.forEach((i) => {
      out[i] = Math.max(0, eq);
    });
  } else {
    const scale = rem / sFree;
    freeIdx.forEach((i) => {
      out[i] = Math.max(0, out[i] * scale);
    });
  }
  return projectSimplex(out);
}

export function generateInitialEstimates(
  n: number,
  category: string,
  fixed: Map<number, number>,
  priorKeys: string[],
  /** AI typical(참고) — 고정 인덱스는 무시 */
  typicalHints?: (number | null | undefined)[],
): number[] {
  const cat = (category || 'snack').toLowerCase();
  const priors = CATEGORY_PRIOR_WEIGHT[cat] || CATEGORY_PRIOR_WEIGHT.snack;
  const p = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const key = priorKeys[i] || 'unknown';
    const base = priors[key] ?? (key === 'unknown' ? 0.25 : 0.6);
    const orderBias = (n - i) / n;
    p[i] = base * (0.5 + orderBias);
  }
  fixed.forEach((v, i) => {
    p[i] = v;
  });
  let out = applyKnownAndRenormalize(p, fixed);
  const geom = new Array(n).fill(0);
  let gsum = 0;
  for (let i = 0; i < n; i++) {
    if (fixed.has(i)) {
      geom[i] = 0;
      continue;
    }
    geom[i] = Math.pow(0.72, i) * (priorKeys[i] ? (priors[priorKeys[i]] ?? 0.5) : 0.4);
    gsum += geom[i];
  }
  if (gsum > 0) {
    const rem = 100 - sum(Array.from(fixed.entries()).map(([i]) => out[i]));
    for (let i = 0; i < n; i++) {
      if (!fixed.has(i)) out[i] = (geom[i] / gsum) * Math.max(0, rem);
    }
  }
  out = projectSimplex(out);
  out = applyKnownAndRenormalize(out, fixed);
  if (typicalHints && typicalHints.length === n) {
    for (let i = 0; i < n; i++) {
      const t = typicalHints[i];
      if (t == null || fixed.has(i)) continue;
      out[i] = 0.45 * out[i] + 0.55 * clamp(t, 0, 100);
    }
    out = applyKnownAndRenormalize(out, fixed);
  }
  if (!fixed.size) out = projectNonIncreasing(out);
  else {
    const free = [];
    for (let i = 0; i < n; i++) if (!fixed.has(i)) free.push(i);
    for (let a = 0; a < free.length - 1; a++) {
      const i = free[a];
      const j = free[a + 1];
      if (i < j && out[i] < out[j]) {
        const t = (out[i] + out[j]) / 2;
        out[i] = t;
        out[j] = t;
      }
    }
  }
  return applyKnownAndRenormalize(out, fixed);
}

const W = { fat: 1.2, carbs: 1.0, sugars: 1.1, protein: 1.0, order: 0.35, sugarCarb: 2.0 };
const KP_RANGE = 0.08;

export interface OptimizeAiPriors {
  ranges: Array<{ min: number; max: number } | null>;
  roles: IngredientRole[];
}

function loss(
  pred: NutritionPer100g,
  tgt: NutritionPer100g,
  p: number[],
  relaxOrder: boolean,
): number {
  let L =
    W.fat * Math.abs(pred.fat - tgt.fat) +
    W.carbs * Math.abs(pred.carbs - tgt.carbs) +
    W.sugars * Math.abs(pred.sugars - tgt.sugars) +
    W.protein * Math.abs(pred.protein - tgt.protein);
  if (pred.sugars > pred.carbs + 0.4) L += W.sugarCarb * (pred.sugars - pred.carbs);
  if (!relaxOrder) {
    for (let i = 0; i < p.length - 1; i++) {
      if (p[i] + 1e-6 < p[i + 1]) L += W.order * (p[i + 1] - p[i]);
    }
  }
  return L;
}

export function priorRangePenalty(
  p: number[],
  ranges: Array<{ min: number; max: number } | null | undefined>,
): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const r = ranges[i];
    if (!r) continue;
    if (p[i] < r.min) s += KP_RANGE * (r.min - p[i]) ** 2;
    else if (p[i] > r.max) s += KP_RANGE * (p[i] - r.max) ** 2;
  }
  return s;
}

export function roleConsistencyPenalty(
  p: number[],
  profiles: IngredientProfile[],
  target: NutritionPer100g,
  roles: IngredientRole[],
): number {
  if (!roles.length || roles.length !== p.length) return 0;
  const pred = nutritionFromPercents(p, profiles);
  let pen = 0;
  for (let i = 0; i < p.length; i++) {
    const role = roles[i];
    const cf = (p[i] / 100) * profiles[i].fat;
    const cc = (p[i] / 100) * profiles[i].carbs;
    const cp = (p[i] / 100) * profiles[i].protein;
    if (role === 'fat_source' && target.fat > 4) {
      const share = pred.fat > 0.01 ? cf / pred.fat : 0;
      if (share < 0.1) pen += 0.35 * (0.1 - share);
    }
    if (role === 'carb_source' && target.carbs > 5) {
      const share = pred.carbs > 0.01 ? cc / pred.carbs : 0;
      if (share < 0.1) pen += 0.3 * (0.1 - share);
    }
    if (role === 'protein_source' && target.protein > 3) {
      const share = pred.protein > 0.01 ? cp / pred.protein : 0;
      if (share < 0.08) pen += 0.3 * (0.08 - share);
    }
    if (role === 'water_base' && target.fat + target.carbs < 14) {
      if (p[i] < 3.5) pen += 0.22;
    }
    if (role === 'additive' && p[i] > 14) pen += 0.04 * (p[i] - 14);
  }
  return pen;
}

function combinedLoss(
  p: number[],
  profiles: IngredientProfile[],
  target: NutritionPer100g,
  relaxOrder: boolean,
  aiPriors?: OptimizeAiPriors,
): number {
  const pred = nutritionFromPercents(p, profiles);
  let L = loss(pred, target, p, relaxOrder);
  if (aiPriors) {
    L += priorRangePenalty(p, aiPriors.ranges);
    L += roleConsistencyPenalty(p, profiles, target, aiPriors.roles);
  }
  return L;
}

function priorRangeGradComponent(p: number[], i: number, ranges: Array<{ min: number; max: number } | null>): number {
  const r = ranges[i];
  if (!r) return 0;
  if (p[i] < r.min) return 2 * KP_RANGE * (p[i] - r.min);
  if (p[i] > r.max) return 2 * KP_RANGE * (p[i] - r.max);
  return 0;
}

export function optimizeIngredientPercents(
  p0: number[],
  profiles: IngredientProfile[],
  target: NutritionPer100g,
  fixed: Map<number, number>,
  options?: { maxIter?: number; relaxOrder?: boolean; aiPriors?: OptimizeAiPriors },
): number[] {
  const maxIter = options?.maxIter ?? 350;
  const relaxOrder = options?.relaxOrder ?? false;
  const aiPriors = options?.aiPriors;
  let p = [...p0];
  const n = p.length;
  const freeIdx: number[] = [];
  for (let i = 0; i < n; i++) if (!fixed.has(i)) freeIdx.push(i);

  const rangesForGrad =
    aiPriors?.ranges && aiPriors.ranges.length === n
      ? aiPriors.ranges
      : new Array(n).fill(null) as Array<{ min: number; max: number } | null>;

  let best = [...p];
  let bestL = combinedLoss(best, profiles, target, relaxOrder, aiPriors);

  const step = 0.45;
  for (let iter = 0; iter < maxIter; iter++) {
    const pred = nutritionFromPercents(p, profiles);
    const ef = pred.fat - target.fat;
    const ec = pred.carbs - target.carbs;
    const es = pred.sugars - target.sugars;
    const ep = pred.protein - target.protein;
    const sugarExcess = pred.sugars > pred.carbs + 0.35 ? pred.sugars - pred.carbs : 0;
    const grad: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (fixed.has(i)) continue;
      const pr = profiles[i];
      grad[i] =
        (W.fat * ef * pr.fat) / 100 +
        (W.carbs * ec * pr.carbs) / 100 +
        (W.sugars * es * pr.sugars) / 100 +
        (W.protein * ep * pr.protein) / 100;
      if (sugarExcess > 0) grad[i] += W.sugarCarb * sugarExcess * ((pr.sugars - pr.carbs) / 100);
      if (aiPriors) grad[i] += priorRangeGradComponent(p, i, rangesForGrad);
    }
    if (aiPriors && aiPriors.roles.length === n) {
      const eps = 0.06;
      const rp = (pp: number[]) => roleConsistencyPenalty(pp, profiles, target, aiPriors.roles);
      for (const i of freeIdx) {
        const pPlus = [...p];
        pPlus[i] += eps;
        const pMinus = [...p];
        pMinus[i] -= eps;
        grad[i] += (rp(pPlus) - rp(pMinus)) / (2 * eps);
      }
    }
    const gn = Math.sqrt(grad.reduce((a, g) => a + g * g, 0)) || 1;
    for (const i of freeIdx) {
      p[i] -= (step * grad[i]) / gn / (1 + iter * 0.002);
    }
    p = applyKnownAndRenormalize(p, fixed);
    if (!relaxOrder) p = projectNonIncreasing(p);
    p = applyKnownAndRenormalize(p, fixed);
    const Lnow = combinedLoss(p, profiles, target, relaxOrder, aiPriors);
    if (Lnow < bestL) {
      bestL = Lnow;
      best = [...p];
    }
  }

  let p2 = [...best];
  for (let h = 0; h < 120; h++) {
    const i = (h * 17 + 1) % n;
    const j = (h * 23 + 2) % n;
    if (i === j || fixed.has(i) || fixed.has(j)) continue;
    const delta = ((h % 11) * 0.11) % 1.0 - 0.5;
    const pi = p2[i] + delta;
    const pj = p2[j] - delta;
    if (pi < 0 || pj < 0) continue;
    const trial = [...p2];
    trial[i] = pi;
    trial[j] = pj;
    const t2 = applyKnownAndRenormalize(trial, fixed);
    const t3 = relaxOrder ? t2 : projectNonIncreasing(t2);
    const t4 = applyKnownAndRenormalize(t3, fixed);
    if (
      combinedLoss(t4, profiles, target, relaxOrder, aiPriors) <
      combinedLoss(p2, profiles, target, relaxOrder, aiPriors)
    )
      p2 = t4;
  }
  return applyKnownAndRenormalize(p2, fixed);
}

function totalNutritionError(pred: NutritionPer100g, tgt: NutritionPer100g): number {
  return (
    Math.abs(pred.fat - tgt.fat) +
    Math.abs(pred.carbs - tgt.carbs) +
    Math.abs(pred.sugars - tgt.sugars) +
    Math.abs(pred.protein - tgt.protein)
  );
}

export function calculateConfidence(input: {
  knownCount: number;
  nIngredients: number;
  unknownCount: number;
  nutritionError: number;
  matchedProfileCount: number;
  orderViolations: number;
  servingWarning: boolean;
}): number {
  let c = 0.55;
  c += 0.06 * Math.min(input.knownCount, 4);
  c += 0.04 * (input.matchedProfileCount / Math.max(1, input.nIngredients));
  c -= 0.07 * Math.min(input.unknownCount, 6);
  c -= 0.012 * input.nutritionError;
  c -= 0.04 * input.orderViolations;
  if (input.servingWarning) c -= 0.08;
  return clamp(c, 0.12, 0.92);
}

function perItemConfidence(
  base: number,
  canonical: string,
  spread: number,
): { confidence: number; minP: number; maxP: number } {
  const unc = canonical === 'unknown' ? 0.18 : 0;
  const conf = clamp(base - unc - spread * 0.25, 0.1, 0.95);
  return { confidence: conf, minP: 0, maxP: 0 };
}

function buildReasonsBase(
  i: number,
  n: number,
  canonical: string,
  p: number[],
  profiles: IngredientProfile[],
  pred: NutritionPer100g,
  tgt: NutritionPer100g,
): string[] {
  const r: string[] = [];
  if (i === 0) r.push('라벨 순서상 앞쪽 원재료로, 뒤 원재료보다 비율이 크거나 같게 맞춤');
  if (profiles[i].fat > 20 && tgt.fat > 8) r.push('지방 기여도가 큰 성분으로, 제품 지방 함량과의 균형을 위해 비중을 조정함');
  if (profiles[i].carbs > 60 || profiles[i].sugars > 60) r.push('탄수화물·당류 기여가 커서 영양표 당·탄수 오차를 줄이는 방향으로 반영함');
  if (canonical === 'skim_milk_powder' || canonical === 'milk' || canonical === 'milk_powder')
    r.push('유단백·유당(탄수) 기여를 반영함');
  if (i > 0 && p[i] <= p[i - 1] + 1e-6) r.push('앞선 원재료보다 작거나 같은 비율 제약을 만족함');
  if (r.length === 0) r.push('대표 영양 프로필과 전체 영양표 오차 최소화 결과를 반영함');
  return r.slice(0, 4);
}

function buildReasonsWithAi(
  i: number,
  n: number,
  canonical: string,
  p: number[],
  profiles: IngredientProfile[],
  pred: NutritionPer100g,
  tgt: NutritionPer100g,
  aiPriorReasoning?: string | null,
): string[] {
  const base = buildReasonsBase(i, n, canonical, p, profiles, pred, tgt);
  if (aiPriorReasoning && aiPriorReasoning.trim())
    base.unshift(`영양·제조 맥락(AI prior, 참고): ${aiPriorReasoning.trim()}`);
  return base.slice(0, 5);
}

export interface CompositionExtras {
  aiPriors?: OptimizeAiPriors;
  typicalHints?: (number | null | undefined)[];
  aiPriorReasonings?: string[];
  priorsConfidence?: number;
  aiUsed?: boolean;
  validateResult?: ValidateEstimatesAiResult | null;
}

export function estimateIngredientCompositionWithExtras(
  input: IngredientCompositionInput,
  extras?: CompositionExtras,
): IngredientCompositionResult {
  const assumptions: string[] = [
    '각 원재료는 내부 DB에 있는 대표 영양(100g 기준)으로만 기여한다고 가정합니다.',
    '실제 제품은 배합·수분·공정에 따라 동일 원재료라도 성분이 다를 수 있습니다.',
  ];
  if (extras?.aiUsed) {
    assumptions.push(
      'AI가 제안한 역할·함량 범위는 soft constraint로만 반영했으며, 최종 비율은 수식 최적화로만 결정했습니다.',
    );
  }
  const warnings: string[] = [];
  const ingredients = input.ingredients.map((s) => s.trim()).filter(Boolean);
  const n = ingredients.length;
  if (n === 0) {
    return {
      ingredientsEstimate: [],
      totalError: 0,
      assumptions,
      warnings: ['원재료 목록이 비어 있습니다.'],
      summary: '추정 불가',
    };
  }

  const category = (input.category || 'snack').toLowerCase();
  const normalizedKeys = ingredients.map((name) => normalizeIngredientName(name));
  const unknownCt = normalizedKeys.filter((k) => k === 'unknown').length;
  if (unknownCt > n * 0.45) warnings.push('DB에 없거나 일반화하기 어려운 원재료명이 많아 추정 불확실도가 큽니다.');

  let nutrition = { ...input.nutritionPer100g };
  if (input.servingBasis === '100ml') {
    const d = input.densityGPerMl ?? CATEGORY_DEFAULT_DENSITY[category] ?? 1;
    assumptions.push(`100ml 기준 표를 밀도 ${d.toFixed(3)} g/ml로 가정해 100g 환산 영양으로 맞춥니다.`);
    nutrition = {
      fat: nutrition.fat / d,
      carbs: nutrition.carbs / d,
      sugars: nutrition.sugars / d,
      protein: nutrition.protein / d,
    };
    warnings.push('100ml 기준 영양은 밀도 가정 없이는 g 기준과 직접 비교하기 어렵습니다.');
  } else if (input.servingBasis === 'serving') {
    warnings.push('1회 제공량 기준 영양은 본 추정기는 100g 환산 없이 입력값을 그대로 사용합니다(단위 불일치 가능).');
  }

  if (nutrition.sugars > nutrition.carbs + 0.5) warnings.push('당류가 탄수화물보다 큽니다. 라벨 오기 또는 단위 혼동 가능성을 확인하세요.');

  const profiles = normalizedKeys.map((k) => getIngredientProfile(k, category));
  const matchedProfileCount = normalizedKeys.filter((k) => k !== 'unknown').length;

  const fixed = new Map<number, number>();
  const matchedKnown: Record<string, number> = {};
  for (const [label, pct] of Object.entries(input.knownPercents || {})) {
    const labelNorm = label.replace(/\s/g, '');
    const keyFromLabel = normalizeIngredientName(label);
    let j = -1;
    for (let i = 0; i < ingredients.length; i++) {
      const ingNorm = ingredients[i].replace(/\s/g, '');
      if (ingNorm === labelNorm) {
        j = i;
        break;
      }
    }
    if (j < 0) {
      j = normalizedKeys.findIndex((k) => k === keyFromLabel);
    }
    if (j >= 0 && pct >= 0) {
      fixed.set(j, clamp(pct, 0, 100));
      matchedKnown[ingredients[j]] = fixed.get(j)!;
    }
  }

  let fixedSum = 0;
  fixed.forEach((v) => {
    fixedSum += v;
  });
  if (fixedSum > 100.5) warnings.push('표기 함량 합이 100%를 초과하여 비율을 축소했습니다.');

  const pInit = generateInitialEstimates(
    n,
    category,
    fixed,
    normalizedKeys,
    extras?.typicalHints,
  );
  const relaxOrder = input.relaxOrder === true || fixed.size > 0;
  let pOpt = optimizeIngredientPercents(pInit, profiles, nutrition, fixed, {
    relaxOrder,
    maxIter: 400,
    aiPriors: extras?.aiPriors,
  });
  const pred = nutritionFromPercents(pOpt, profiles);
  const terr = totalNutritionError(pred, nutrition);

  let orderViolations = 0;
  for (let i = 0; i < n - 1; i++) {
    if (pOpt[i] + 0.05 < pOpt[i + 1]) orderViolations++;
  }
  if (orderViolations > 0) warnings.push('영양 오차 최소화 과정에서 라벨 순서(앞쪽이 더 많음)와 동시에 맞추기 어려운 구간이 있습니다.');

  if (terr > 8) warnings.push('영양표와 원재료 프로필 간 오차가 커서 함량 추정은 참고 수준에 그칩니다.');

  const baseConf = calculateConfidence({
    knownCount: fixed.size,
    nIngredients: n,
    unknownCount: unknownCt,
    nutritionError: terr,
    matchedProfileCount,
    orderViolations,
    servingWarning: input.servingBasis === '100ml',
  });

  const validateMult = extras?.validateResult?.confidenceMultipliers;
  const ingredientsEstimate: IngredientEstimateRow[] = [];
  for (let i = 0; i < n; i++) {
    const spread = terr / Math.max(4, n);
    let { confidence } = perItemConfidence(baseConf, normalizedKeys[i], spread);
    const mult =
      validateMult && validateMult[i] != null ? Math.max(0.45, Math.min(1, validateMult[i])) : 1;
    confidence = Math.round(confidence * mult * 100) / 100;
    const margin = clamp(4 + spread * 1.2 + (normalizedKeys[i] === 'unknown' ? 6 : 0), 2, 22);
    const est = pOpt[i];
    ingredientsEstimate.push({
      name: ingredients[i],
      estimatedPercent: Math.round(est * 10) / 10,
      minPercent: Math.round(Math.max(0, est - margin) * 10) / 10,
      maxPercent: Math.round(Math.min(100, est + margin) * 10) / 10,
      confidence,
      reasons: buildReasonsWithAi(
        i,
        n,
        normalizedKeys[i],
        pOpt,
        profiles,
        pred,
        nutrition,
        extras?.aiPriorReasonings?.[i],
      ),
    });
  }

  const aiUsed = extras?.aiUsed === true;
  const priorsConfidence = extras?.priorsConfidence;
  const adjustmentNotes: string[] = [
    ...(extras?.validateResult?.adjustmentNotes ?? []),
    ...(extras?.validateResult?.unrealisticFlags?.map((f) => `점검: ${f}`) ?? []),
  ];
  if (extras?.validateResult?.userSummary) adjustmentNotes.push(extras.validateResult.userSummary);

  let summary =
    `총 ${n}개 원재료, 영양 오차 합 약 ${terr.toFixed(1)} (지·탄·당·단백 절대차 합). ` +
    `표기 확정 함량 ${fixed.size}건. ` +
    `순서 제약 ${relaxOrder ? '완화' : '적용'} 모드. ` +
    `aiUsed=${aiUsed ? 'true' : 'false'}`;
  if (priorsConfidence != null) summary += ` priorsConfidence=${priorsConfidence.toFixed(2)}`;
  if (adjustmentNotes.length)
    summary += ` adjustmentNotes=${adjustmentNotes.length}건`;

  return {
    ingredientsEstimate,
    totalError: Math.round(terr * 100) / 100,
    assumptions,
    warnings,
    summary,
    aiUsed,
    priorsConfidence,
    adjustmentNotes: adjustmentNotes.length ? adjustmentNotes : undefined,
    _debug: { normalizedKeys, matchedKnown, nutritionTarget: nutrition },
  };
}

export function estimateIngredientComposition(input: IngredientCompositionInput): IngredientCompositionResult {
  return estimateIngredientCompositionWithExtras(input, undefined);
}


export const INGREDIENT_ESTIMATE_LIMITATIONS = [
  '실제 배합비·수분 증발·복합원재료 내부 구성은 반영하지 못합니다.',
  '원재료명이 DB와 다르면 unknown 프로필로 흡수되어 오차가 커집니다.',
  '동일 영양을 만족하는 비율 조합은 수학적으로 여럿일 수 있어 해가 유일하지 않습니다.',
  '법적 표시·검역·성분 분석을 대체할 수 없습니다.',
];
