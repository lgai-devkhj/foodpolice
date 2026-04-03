import type { AlternativeFoodJsonItem, AlternativeFoodJsonRoot } from '@/lib/alternative-food-json';
import type { BmiTier } from '@/lib/gemini-prompts';

export type { BmiTier };

export type BmiSegment = 'underweight' | 'general' | 'weight_care';

export type ImprovementTargets = {
  lowerProcessing: boolean;
  lowerSugar: boolean;
  lowerSodium: boolean;
  simplerIngredients: boolean;
  avoidOverconsumptionTriggers: boolean;
  maintainSatiety: boolean;
  bmiSegment: BmiSegment;
};

export type RecommendationEngineInput = {
  productName: string;
  companyName?: string | null;
  foodCategory?: string | null;
  novaGroup: number;
  novaSubgroup?: string | null;
  rawMaterials?: string | null;
  briefDescription?: string | null;
  nutrition?: {
    caloriesKcal?: number | null;
    sodiumMg?: number | null;
    sugarG?: number | null;
    saturatedFatG?: number | null;
  } | null;
  concernIngredients?: Array<{ name?: string | null }> | null;
  bmiTier?: BmiTier | null;
};

export type ConceptCandidate = {
  foodType: string;
  labelKo: string;
  processingTierExpect: number;
  sugarRelief: number;
  sodiumRelief: number;
  ingredientSimplicity: number;
  satietyPreservation: number;
  realism: number;
};

export type ProductSource = {
  productName: string;
  rawMaterials: string;
  companyName?: string | null;
};

export type SubstituteRecommendation = {
  name: string;
  score: number;
  recommendationType: 'similar' | 'balanced' | 'healthier';
  reason: string;
  shortComparison: string;
  url?: string;
};

export type CandidateSearchPort = {
  resolveLabels: (
    labels: string[],
    foodType: string
  ) => Promise<{ label: string; url?: string }[]>;
};

export type ResolvedRetailCandidate = {
  name: string;
  url?: string;
  sourceLabel: string;
  foodType: string;
};

export const RECOMMENDATION_ENGINE_INTEGRATION_NOTES = `
1) CandidateSearchPort는 실제 검색 엔진(예: Perplexity) 어댑터입니다.
2) 엔진은 concept 후보(labelKo)를 만들고, 검색 포트는 실제 유통 상품명을 찾습니다.
3) 검색 결과는 그대로 쓰지 않고 동일 제품 제거, foodType 호환성, 금지 키워드 검사를 거쳐 최종 선택합니다.
4) 검색 실패 시에만 concept labelKo를 fallback 표시명으로 사용합니다.
`.trim();

function safeString(v: unknown): string {
  return String(v ?? '').trim();
}

function compactKorean(s: string): string {
  return safeString(s)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣]/gi, '');
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function containsApproxPhrase(haystack: string, phrase: string, toleranceRatio = 0.24): boolean {
  const h = compactKorean(haystack);
  const p = compactKorean(phrase);
  if (!h || !p) return false;
  if (h.includes(p)) return true;

  const minWindow = Math.max(2, p.length - 1);
  const maxWindow = Math.min(h.length, p.length + 1);
  const allowed = Math.max(1, Math.floor(p.length * toleranceRatio));

  for (let size = minWindow; size <= maxWindow; size++) {
    for (let i = 0; i + size <= h.length; i++) {
      const chunk = h.slice(i, i + size);
      if (editDistance(chunk, p) <= allowed) return true;
    }
  }
  return false;
}

function containsApproxAny(haystack: string, phrases: string[], toleranceRatio = 0.24): boolean {
  return phrases.some((p) => containsApproxPhrase(haystack, p, toleranceRatio));
}

function stripPackagingUnits(s: string): string {
  return safeString(s)
    .replace(/\b\d+(\.\d+)?\s?(ml|l|g|kg|mg|개입|입|봉|봉지|팩|캔|병|정|포)\b/gi, ' ')
    .replace(/\b\d+\s?[xX]\s?\d+\b/g, ' ')
    .replace(/\b(large|small|mini|big|대용량|소포장|점보)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeName(s: string): string[] {
  return stripPackagingUnits(s)
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/i)
    .filter((t) => t.length >= 2);
}

function removeWeakBrandWords(s: string): string {
  return stripPackagingUnits(s)
    .replace(
      /\b(주식회사|유한회사|co|ltd|inc|corp|company|브랜드|brand|마트|스토어|store|official|공식)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProductIdentity(s: string): string {
  return removeWeakBrandWords(s)
    .replace(/\b(오리지널|original|classic|플레인|plain|베이직|basic|일반형|regular)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haystackOf(input: RecommendationEngineInput): string {
  return [
    safeString(input.productName),
    safeString(input.foodCategory),
    safeString(input.briefDescription),
    safeString(input.rawMaterials),
  ]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferBaseDomain(foodType: string): 'beverage' | 'snack' | 'meal' | 'dairy' | 'grain' {
  if (
    [
      'sweet_carbonated_drink',
      'generic_beverage',
      'unsweetened_tea_coffee_drink',
      'energy_sports_drink',
      'flavored_milk_drink',
    ].includes(foodType)
  ) {
    return 'beverage';
  }

  if (['instant_meal', 'instant_noodle_cup'].includes(foodType)) {
    return 'meal';
  }

  if (['dairy_snack'].includes(foodType)) {
    return 'dairy';
  }

  if (['cereal_breakfast', 'bread_pastry'].includes(foodType)) {
    return 'grain';
  }

  return 'snack';
}

const FOOD_TYPE_ALLOWED_TARGETS: Record<string, Set<string>> = {
  // 비만·과체중/저체중과 무관하게, "같은 용도(간식/음료)" 축에서 대체 후보를 뽑기 위한 허용 매핑
  sweet_nut_snack: new Set([
    'unsalted_mixed_nuts',
    'dry_roasted_almonds',
    'plain_roasted_peanuts',
    'low_sugar_nut_snack',
    'lightly_salted_mixed_nuts',
  ]),
  sweet_carbonated_drink: new Set([
    'zero_carbonated_drink',
    'sparkling_water_unsweetened',
    'unsweetened_iced_tea',
  ]),
  // 나머지는 런타임에서 fallbackCandidatesForFoodType로 처리
};

const MOCK_CANDIDATES: ConceptCandidate[] = [
  // 간식(견과류)
  {
    foodType: 'unsalted_mixed_nuts',
    labelKo: '무가당 견과류 믹스(달지 않고 볶은 타입)',
    processingTierExpect: 3,
    sugarRelief: 0.85,
    sodiumRelief: 0.4,
    ingredientSimplicity: 0.75,
    satietyPreservation: 0.9,
    realism: 0.9,
  },
  {
    foodType: 'dry_roasted_almonds',
    labelKo: '볶음 아몬드',
    processingTierExpect: 3,
    sugarRelief: 0.9,
    sodiumRelief: 0.45,
    ingredientSimplicity: 0.8,
    satietyPreservation: 0.85,
    realism: 0.92,
  },
  {
    foodType: 'plain_roasted_peanuts',
    labelKo: '고소한 볶음 땅콩(시럽·꿀 코팅 없이)',
    processingTierExpect: 3,
    sugarRelief: 0.88,
    sodiumRelief: 0.35,
    ingredientSimplicity: 0.78,
    satietyPreservation: 0.88,
    realism: 0.88,
  },
  {
    foodType: 'low_sugar_nut_snack',
    labelKo: '저당 견과 스낵',
    processingTierExpect: 4,
    sugarRelief: 0.55,
    sodiumRelief: 0.3,
    ingredientSimplicity: 0.45,
    satietyPreservation: 0.8,
    realism: 0.75,
  },
  {
    foodType: 'lightly_salted_mixed_nuts',
    labelKo: '고소한 믹스넛(저염)',
    processingTierExpect: 3,
    sugarRelief: 0.82,
    sodiumRelief: 0.6,
    ingredientSimplicity: 0.72,
    satietyPreservation: 0.87,
    realism: 0.9,
  },

  // 음료(콜라/탄산 대체)
  {
    foodType: 'zero_carbonated_drink',
    labelKo: '제로 탄산음료',
    processingTierExpect: 4,
    sugarRelief: 0.95,
    sodiumRelief: 0.2,
    ingredientSimplicity: 0.25,
    satietyPreservation: 0.1,
    realism: 0.95,
  },
  {
    foodType: 'sparkling_water_unsweetened',
    labelKo: '탄산수',
    processingTierExpect: 2,
    sugarRelief: 1,
    sodiumRelief: 0.5,
    ingredientSimplicity: 0.95,
    satietyPreservation: 0.05,
    realism: 0.98,
  },
  {
    foodType: 'unsweetened_iced_tea',
    labelKo: '무가당 냉차·보리차',
    processingTierExpect: 3,
    sugarRelief: 0.92,
    sodiumRelief: 0.25,
    ingredientSimplicity: 0.55,
    satietyPreservation: 0.1,
    realism: 0.8,
  },
];

function fallbackCandidatesForFoodType(foodType: string): ConceptCandidate[] {
  const domain = inferBaseDomain(foodType);

  if (domain === 'beverage') {
    return MOCK_CANDIDATES.filter((m) =>
      ['sparkling_water_unsweetened', 'unsweetened_iced_tea', 'cold_brew_unsweetened'].includes(m.foodType)
    );
  }

  if (domain === 'meal') {
    return MOCK_CANDIDATES.filter((m) =>
      ['plain_rice_noodle_soup_kit', 'ready_rice_with_vegetable', 'frozen_grain_bowl_plain'].includes(m.foodType)
    );
  }

  if (domain === 'dairy') {
    return MOCK_CANDIDATES.filter((m) =>
      ['plain_greek_yogurt', 'natural_cheese_portion', 'plain_milk'].includes(m.foodType)
    );
  }

  if (domain === 'grain') {
    return MOCK_CANDIDATES.filter((m) =>
      ['plain_oats_unsweetened', 'whole_grain_bread_plain', 'plain_rice_cracker'].includes(m.foodType)
    );
  }

  return MOCK_CANDIDATES.filter((m) =>
    ['plain_roasted_peanuts', 'dry_roasted_almonds', 'plain_rice_cracker', 'dried_fruit_unsweetened'].includes(
      m.foodType
    )
  );
}

export function inferFoodType(input: RecommendationEngineInput): string {
  const h = haystackOf(input);
  const cat = safeString(input.foodCategory);

  if (
    (/(컵\s*라면|컵라면|봉지\s*라면|즉석면|cup\s*noodle|라면\s*\(|^라면)/i.test(h) ||
      /(라면|우동|짜장면|쌀국수|메밀면)/i.test(h)) &&
    /(스프|분말|후레이크|건조|면)/i.test(h)
  ) {
    return 'instant_noodle_cup';
  }

  if (
    /(즉석\s*밥|즉석\s*도시락|햄버거|샌드위치|덮밥|볶음밥\s*팩|컵밥|간편식|한끼|ready\s*meal|meal\s*kit)/i.test(h) ||
    cat === '간편한 한 끼'
  ) {
    return 'instant_meal';
  }

  if (
    /(콜라|코카콜라|펩시|사이다|환타|스프라이트|탄산\s*음료|탄산음료|소다|coke|pepsi|soda)/i.test(h) &&
    !/(탄산수|스파클링\s*워터|sparkling\s*water)/i.test(h)
  ) {
    return 'sweet_carbonated_drink';
  }

  if (/(게토레이|파워에이드|이온|스포츠\s*음료|electrolyte)/i.test(h)) {
    return 'energy_sports_drink';
  }

  if (
    /(블랙\s*커피|아메리카노|콜드브루|보리차|옥수수수염차|녹차\s*음료|무가당\s*차|iced\s*tea|cold\s*brew)/i.test(h) &&
    (cat === '음료' || !/(우유|라떼|밀크)/i.test(h))
  ) {
    return 'unsweetened_tea_coffee_drink';
  }

  if (/(바나나우유|딸기우유|초코우유|요거트\s*드링크|요구르트\s*드링크|drinkable\s*yogurt)/i.test(h)) {
    return 'flavored_milk_drink';
  }

  if (/(감자칩|포카칩|포테이토\s*칩|chip|나쵸|corn\s*chip|크래커\s*칩)/i.test(h)) {
    return 'salty_crispy_snack';
  }

  if (
    containsApproxAny(h, ['꿀땅콩', '허니땅콩', 'honey peanut', 'honey roast', '코팅 땅콩'], 0.26) ||
    (/(땅콩|아몬드|호두|캐슈|피칸|견과|너트|nut)/i.test(h) &&
      /(꿀|허니|honey|시럽|코팅|캔디|카라멜)/i.test(h))
  ) {
    return 'sweet_nut_snack';
  }

  if (/(초코\s*바|에너지바|그래놀라\s*바|프로틴\s*바|snack\s*bar)/i.test(h)) {
    return 'sweet_snack_bar';
  }

  if (/(민트|mint|이클립스|자일리톨|캔디|사탕|하드캔디|드롭)/i.test(h)) {
    return 'generic_sweet_snack';
  }

  if (/(젤리|구미|gummy|말랑카우|츄잉)/i.test(h)) {
    return 'generic_sweet_snack';
  }

  if (/(초콜릿|초코렛|다크초코|초코볼)/i.test(h) && !/(우유|drink|음료)/i.test(h)) {
    return 'chocolate_candy';
  }

  if (/(시리얼|cereal|그래놀라|오트밀\s*시리얼)/i.test(h)) {
    return 'cereal_breakfast';
  }

  if (/(식빵|베이글|모닝빵|크루아상|토스트|빵|브레드)/i.test(h) || cat === '빵·시리얼류') {
    return /(시리얼|그래놀라|오트밀)/i.test(h) ? 'cereal_breakfast' : 'bread_pastry';
  }

  if (/(아이스크림|요거트|푸딩|치즈\s*스틱|그릭요거트|요구르트)/i.test(h) || cat === '유제품·디저트') {
    return 'dairy_snack';
  }

  if (cat === '음료') return 'generic_beverage';
  if (cat === '달콤한 간식') return 'generic_sweet_snack';
  if (cat === '짭짤한 간식') return 'generic_salty_snack';
  if (cat === '간편한 한 끼') return 'instant_meal';

  return 'generic_sweet_snack';
}

export function deriveImprovementTargets(input: RecommendationEngineInput): ImprovementTargets {
  const nut = input.nutrition ?? null;
  const sugar = typeof nut?.sugarG === 'number' ? nut.sugarG : null;
  const sodium = typeof nut?.sodiumMg === 'number' ? nut.sodiumMg : null;
  const sub = safeString(input.novaSubgroup).toUpperCase();
  const ng = Math.min(4, Math.max(1, input.novaGroup || 4));
  const concerns = input.concernIngredients ?? [];
  const concernCount = concerns.filter((x) => safeString(x?.name).length > 0).length;
  const tier = input.bmiTier ?? null;

  const bmiSegment: BmiSegment =
    tier === 'overweight' || tier === 'obese'
      ? 'weight_care'
      : tier === 'underweight'
        ? 'underweight'
        : 'general';

  const lowerProcessing = sub === '4B' || sub === '4C' || ng >= 4;
  const lowerSugar = bmiSegment === 'weight_care' ? true : sugar != null ? sugar >= 8 : ng >= 4;
  const lowerSodium = bmiSegment === 'weight_care' ? true : sodium != null ? sodium >= 280 : ng >= 3;
  const simplerIngredients = concernCount >= 2 || ng >= 4;
  const avoidOverconsumptionTriggers = bmiSegment === 'weight_care';
  const maintainSatiety = bmiSegment === 'underweight';

  return {
    lowerProcessing,
    lowerSugar,
    lowerSodium,
    simplerIngredients,
    avoidOverconsumptionTriggers,
    maintainSatiety,
    bmiSegment,
  };
}

export function generateCandidates(foodType: string, improvementTargets: ImprovementTargets): ConceptCandidate[] {
  const allowed = FOOD_TYPE_ALLOWED_TARGETS[foodType];

  if (!allowed || allowed.size === 0) {
    return fallbackCandidatesForFoodType(foodType);
  }

  let list = MOCK_CANDIDATES.filter((m) => allowed.has(m.foodType));

  if (improvementTargets.bmiSegment === 'weight_care') {
    list = list.filter((m) => !(foodType === 'sweet_nut_snack' && m.foodType === 'low_sugar_nut_snack'));
  }

  return list.length > 0 ? list : fallbackCandidatesForFoodType(foodType);
}

export function isCategoryCompatible(foodType: string, candidateFoodType: string): boolean {
  const allowed = FOOD_TYPE_ALLOWED_TARGETS[foodType];
  if (allowed && allowed.size > 0) return allowed.has(candidateFoodType);
  return inferBaseDomain(foodType) === inferBaseDomain(candidateFoodType);
}

function levenshtein(a: string, b: string): number {
  return editDistance(a, b);
}

function similarityRatio(a: string, b: string): number {
  const A = compactKorean(normalizeProductIdentity(a));
  const B = compactKorean(normalizeProductIdentity(b));
  if (!A.length || !B.length) return 0;
  const d = levenshtein(A, B);
  return 1 - d / Math.max(A.length, B.length);
}

function tokenSetJaccard(a: string, b: string): number {
  const ta = new Set(tokenizeName(normalizeProductIdentity(a)));
  const tb = new Set(tokenizeName(normalizeProductIdentity(b)));

  if (ta.size === 0 || tb.size === 0) return 0;

  let inter = 0;
  ta.forEach((x) => {
    if (tb.has(x)) inter++;
  });

  return inter / (ta.size + tb.size - inter);
}

function looksSameSeriesButBetterVariant(sourceName: string, candidateName: string): boolean {
  const source = normalizeProductIdentity(sourceName).toLowerCase();
  const candidate = normalizeProductIdentity(candidateName).toLowerCase();

  const colaFamily = /(코카콜라|콜라|펩시|사이다|환타|스프라이트|coke|cola|pepsi|sprite|fanta)/i;

  if (colaFamily.test(source) && colaFamily.test(candidate)) {
    const sourceZero = /(제로|zero|무가당|슈가프리|다이어트)/i.test(source);
    const candidateZero = /(제로|zero|무가당|슈가프리|다이어트)/i.test(candidate);
    if (!sourceZero && candidateZero) return true;
  }

  return false;
}

export function isDuplicateOrSameProduct(
  source: ProductSource,
  candidate: { name: string; foodType?: string }
): boolean {
  const pn = safeString(source.productName);
  const raw = safeString(source.rawMaterials);
  const cn = safeString(candidate.name);

  if (!pn || !cn) return false;
  if (looksSameSeriesButBetterVariant(pn, cn)) return false;

  if (similarityRatio(pn, cn) >= 0.88) return true;

  const pnc = compactKorean(normalizeProductIdentity(pn));
  const cnc = compactKorean(normalizeProductIdentity(cn));

  if (pnc.length >= 6 && cnc.length >= 6) {
    const sub = pnc.length <= cnc.length ? pnc : cnc;
    const sup = pnc.length > cnc.length ? pnc : cnc;
    if (sup.includes(sub) && sub.length / sup.length >= 0.78) return true;
  }

  const srcHoney = containsApproxAny(`${pn} ${raw}`, ['꿀땅콩', '허니땅콩', 'honey peanut', 'honey roast'], 0.26);
  const candHoneyRaw = containsApproxAny(cn, ['꿀땅콩', '허니땅콩', 'honey peanut', 'honey roast'], 0.26);
  const candHoneyNegated =
    /(꿀\s*없|허니\s*없|코팅\s*없|무코팅|honey\s*free|no\s*honey|unsweetened)/i.test(cn);
  const candHoney = candHoneyRaw && !candHoneyNegated;
  if (srcHoney && candHoney) return true;

  const colaPhrase = /(코카콜라|콜라|펩시|환타|사이다|콜라\s*맛|coke|cola|pepsi)/i;
  const srcCola = colaPhrase.test(pn) && !/(제로|무가당|zero|다이어트|제로슈거)/i.test(pn);
  const candCola = colaPhrase.test(cn) && !/(제로|무가당|zero|다이어트|제로슈거|탄산수|스파클링\s*워터)/i.test(cn);
  if (srcCola && candCola) return true;

  if (tokenSetJaccard(`${pn} ${raw}`, cn) >= 0.64 && similarityRatio(pn, cn) >= 0.5) return true;

  return false;
}

function sourceProcessingTier(input: RecommendationEngineInput): number {
  return Math.min(4, Math.max(1, input.novaGroup || 4));
}

function computeCategorySimilarity(sourceFoodType: string, candidateFoodType: string): number {
  if (sourceFoodType === candidateFoodType) return 0.88;
  if (inferBaseDomain(sourceFoodType) === inferBaseDomain(candidateFoodType)) return 0.76;
  return 0.58;
}

export function evaluateCandidate(
  source: RecommendationEngineInput,
  candidate: ConceptCandidate,
  improvementTargets: ImprovementTargets
): {
  categorySimilarityScore: number;
  processingImprovementScore: number;
  nutritionImprovementScore: number;
  ingredientSimplicityScore: number;
  userFitScore: number;
  realismScore: number;
  total: number;
} {
  const srcType = inferFoodType(source);

  if (!isCategoryCompatible(srcType, candidate.foodType)) {
    return {
      categorySimilarityScore: 0,
      processingImprovementScore: 0,
      nutritionImprovementScore: 0,
      ingredientSimplicityScore: 0,
      userFitScore: 0,
      realismScore: 0,
      total: 0,
    };
  }

  if (
    isDuplicateOrSameProduct(
      {
        productName: source.productName,
        rawMaterials: source.rawMaterials ?? '',
        companyName: source.companyName,
      },
      { name: candidate.labelKo, foodType: candidate.foodType }
    )
  ) {
    return {
      categorySimilarityScore: 0,
      processingImprovementScore: 0,
      nutritionImprovementScore: 0,
      ingredientSimplicityScore: 0,
      userFitScore: 0,
      realismScore: 0,
      total: 0,
    };
  }

  const srcTier = sourceProcessingTier(source);
  const categorySimilarityScore = computeCategorySimilarity(srcType, candidate.foodType);

  const processingImprovementScore = Math.max(
    0,
    Math.min(1, (srcTier - candidate.processingTierExpect + 1) / 3)
  );

  let nutritionImprovementScore =
    (improvementTargets.lowerSugar ? candidate.sugarRelief * 0.62 : candidate.sugarRelief * 0.28) +
    (improvementTargets.lowerSodium ? candidate.sodiumRelief * 0.38 : candidate.sodiumRelief * 0.18);

  nutritionImprovementScore = Math.min(1, nutritionImprovementScore);

  const ingredientSimplicityScore = candidate.ingredientSimplicity;

  let userFitScore = 0.68;
  if (improvementTargets.avoidOverconsumptionTriggers) userFitScore += 0.14 * candidate.sugarRelief;
  if (improvementTargets.maintainSatiety) userFitScore += 0.16 * candidate.satietyPreservation;
  userFitScore = Math.min(1, userFitScore);

  const realismScore = candidate.realism;

  let inner =
    categorySimilarityScore * 0.12 +
    processingImprovementScore * 0.24 +
    nutritionImprovementScore * 0.27 +
    ingredientSimplicityScore * 0.15 +
    userFitScore * 0.12 +
    realismScore * 0.1;

  if (improvementTargets.lowerProcessing && candidate.processingTierExpect >= srcTier) {
    inner -= 0.2;
  }

  if (improvementTargets.bmiSegment === 'weight_care') {
    inner += 0.08 * candidate.sugarRelief;
    inner += 0.05 * candidate.sodiumRelief;

    if (
      ['sparkling_water_unsweetened', 'zero_carbonated_drink', 'plain_roasted_peanuts', 'dry_roasted_almonds'].includes(
        candidate.foodType
      )
    ) {
      inner += 0.03;
    }
  } else if (improvementTargets.bmiSegment === 'underweight') {
    inner += 0.1 * candidate.satietyPreservation;
    inner += 0.03 * candidate.realism;
  } else {
    inner += 0.03 * candidate.realism;
  }

  const total = 100 * Math.max(0, Math.min(1, inner));

  return {
    categorySimilarityScore,
    processingImprovementScore,
    nutritionImprovementScore,
    ingredientSimplicityScore,
    userFitScore,
    realismScore,
    total: Math.round(total * 10) / 10,
  };
}

function hasMeaningfulImprovement(
  ev: ReturnType<typeof evaluateCandidate>,
  improvementTargets: ImprovementTargets
): boolean {
  if (ev.total < 24) return false;

  if (!improvementTargets.lowerProcessing && !improvementTargets.lowerSugar && !improvementTargets.lowerSodium) {
    return ev.nutritionImprovementScore >= 0.16 || ev.processingImprovementScore >= 0.18;
  }

  if (improvementTargets.lowerSugar && ev.nutritionImprovementScore < 0.14 && ev.processingImprovementScore < 0.15) {
    return false;
  }

  return true;
}

function buildReason(
  c: ConceptCandidate,
  improvementTargets: ImprovementTargets
): { reason: string; shortComparison: string } {
  if (improvementTargets.bmiSegment === 'weight_care') {
    if (c.sugarRelief >= 0.75 && c.processingTierExpect <= 3) {
      return {
        reason: '과체중·비만 기준에서 단맛 부담과 가공 부담을 함께 낮추기 쉬운 유형',
        shortComparison: '체중 관리 맞춤(당·가공 완화)',
      };
    }

    if (c.sugarRelief >= 0.7) {
      return {
        reason: '과체중·비만 기준에서 단맛 부담을 덜기 쉬운 방향의 후보',
        shortComparison: '체중 관리 맞춤(당 부담 완화)',
      };
    }

    return {
      reason: '과체중·비만 기준에서 원재료와 선택 부담을 조금 더 단순하게 보기 좋은 유형',
      shortComparison: '체중 관리 맞춤(가벼운 대체)',
    };
  }

  if (improvementTargets.bmiSegment === 'underweight') {
    if (c.satietyPreservation >= 0.8) {
      return {
        reason: '저체중 기준에서 너무 가볍기보다 포만감과 에너지감을 같이 보기 쉬운 유형',
        shortComparison: '에너지·포만감 맞춤',
      };
    }

    return {
      reason: '저체중 기준에서 부담을 크게 올리지 않으면서도 간식 대안으로 보기 쉬운 유형',
      shortComparison: '에너지 균형 맞춤',
    };
  }

  if (c.processingTierExpect <= 3 && c.ingredientSimplicity >= 0.65) {
    return {
      reason: '일반 기준에서 가공 부담을 조금 덜고 원재료 구성이 비교적 단순한 유형',
      shortComparison: '일반 맞춤(가공도 완화)',
    };
  }

  if (c.sugarRelief >= 0.7) {
    return {
      reason: '일반 기준에서 비슷한 상황에서 단맛 부담을 덜기 쉬운 유형',
      shortComparison: '일반 맞춤(당 부담 완화)',
    };
  }

  return {
    reason: '일반 기준에서 원래 먹던 흐름을 크게 벗어나지 않으면서 조금 더 가볍게 보기 좋은 유형',
    shortComparison: '일반 맞춤(무난한 대체)',
  };
}

function getRetailNameBlockPatterns(foodType: string): RegExp[] {
  if (['plain_roasted_peanuts', 'dry_roasted_almonds', 'unsalted_mixed_nuts'].includes(foodType)) {
    return [/(허니|꿀|시럽|캔디|코팅|honey|syrup|coated)/i];
  }

  if (
    ['sparkling_water_unsweetened', 'unsweetened_iced_tea', 'cold_brew_unsweetened', 'plain_milk', 'plain_greek_yogurt'].includes(
      foodType
    )
  ) {
    return [/(달콤|가당|sweet|sugar|초코|딸기|바나나|카라멜|시럽|라떼)/i];
  }

  if (foodType === 'zero_carbonated_drink') {
    return [/(오리지널|클래식)\s*(콜라|사이다|소다)/i];
  }

  return [];
}

function isRetailNameLikelyCompatible(foodType: string, name: string): boolean {
  const lowered = safeString(name).toLowerCase();
  if (!lowered) return false;

  const blocked = getRetailNameBlockPatterns(foodType);
  for (const pattern of blocked) {
    if (pattern.test(lowered)) {
      if (foodType === 'zero_carbonated_drink' && /(제로|zero|무가당|슈가프리)/i.test(lowered)) {
        continue;
      }
      return false;
    }
  }

  if (foodType === 'sparkling_water_unsweetened') {
    if (!/(탄산수|스파클링|sparkling|carbonated water)/i.test(lowered)) return false;
  }

  if (foodType === 'zero_carbonated_drink') {
    if (!/(제로|zero|무가당|슈가프리|다이어트)/i.test(lowered)) return false;
  }

  if (foodType === 'plain_roasted_peanuts') {
    if (!/(땅콩|피넛|peanut)/i.test(lowered)) return false;
  }

  if (foodType === 'dry_roasted_almonds') {
    if (!/(아몬드|almond)/i.test(lowered)) return false;
  }

  return true;
}

function dedupeResolvedRetailCandidates(
  rows: ResolvedRetailCandidate[]
): ResolvedRetailCandidate[] {
  const out: ResolvedRetailCandidate[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const key = compactKorean(normalizeProductIdentity(row.name));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

async function resolveRetailCandidatesForConcepts(
  concepts: ConceptCandidate[],
  searchPort: CandidateSearchPort
): Promise<Map<string, ResolvedRetailCandidate[]>> {
  const groups = new Map<string, ResolvedRetailCandidate[]>();

  const groupedByFoodType = new Map<string, string[]>();
  for (const concept of concepts) {
    const labels = groupedByFoodType.get(concept.foodType) ?? [];
    labels.push(concept.labelKo);
    groupedByFoodType.set(concept.foodType, labels);
  }

  // NOTE: `Map.prototype.entries()` iterator를 for-of로 순회하면 TS target(다운레벨 이터레이션) 설정에 따라 컴파일 에러가 날 수 있어요.
  // 그래서 `Array.from(...entries())` 형태로 바꿔 호환성을 확보합니다.
  for (const [foodType, labels] of Array.from(groupedByFoodType.entries())) {
    const uniqueLabels = Array.from(new Set(labels));
    let resolved: { label: string; url?: string }[] = [];

    try {
      resolved = await searchPort.resolveLabels(uniqueLabels, foodType);
    } catch {
      resolved = [];
    }

    const normalized = dedupeResolvedRetailCandidates(
      resolved
        .map((item) => ({
          name: safeString(item.label),
          url: item.url,
          sourceLabel: '',
          foodType,
        }))
        .filter((item) => item.name.length > 0)
    );

    groups.set(foodType, normalized);
  }

  return groups;
}

function scoreResolvedRetailName(
  source: RecommendationEngineInput,
  concept: ConceptCandidate,
  resolvedName: string
): number {
  let score = 0;

  const conceptTokens = tokenSetJaccard(concept.labelKo, resolvedName);
  score += conceptTokens * 0.45;

  const conceptSimilarity = similarityRatio(concept.labelKo, resolvedName);
  score += conceptSimilarity * 0.35;

  if (isRetailNameLikelyCompatible(concept.foodType, resolvedName)) score += 0.2;

  if (
    isDuplicateOrSameProduct(
      {
        productName: source.productName,
        rawMaterials: source.rawMaterials ?? '',
        companyName: source.companyName,
      },
      { name: resolvedName, foodType: concept.foodType }
    )
  ) {
    return -1;
  }

  return score;
}

function pickBestResolvedRetailCandidate(
  source: RecommendationEngineInput,
  concept: ConceptCandidate,
  resolvedRows: ResolvedRetailCandidate[],
  takenCompactNames: Set<string>
): { name: string; url?: string } | null {
  const filtered = resolvedRows
    .filter((row) => row.foodType === concept.foodType)
    .filter((row) => isRetailNameLikelyCompatible(concept.foodType, row.name))
    .filter((row) => {
      const key = compactKorean(normalizeProductIdentity(row.name));
      return key.length > 0 && !takenCompactNames.has(key);
    })
    .map((row) => ({
      row,
      fit: scoreResolvedRetailName(source, concept, row.name),
    }))
    .filter((x) => x.fit >= 0.25)
    .sort((a, b) => b.fit - a.fit);

  if (filtered.length === 0) return null;

  const picked = filtered[0]!.row;
  takenCompactNames.add(compactKorean(normalizeProductIdentity(picked.name)));

  return { name: picked.name, url: picked.url };
}

function buildTypedRecommendationsFromConcepts(
  source: RecommendationEngineInput,
  sorted: { c: ConceptCandidate; score: number }[],
  targets: ImprovementTargets,
  resolvedGroups?: Map<string, ResolvedRetailCandidate[]>
): SubstituteRecommendation[] {
  const top = sorted.slice(0, 3);
  if (top.length === 0) return [];

  const takenNames = new Set<string>();

  const buildDisplay = (concept: ConceptCandidate): { name: string; url?: string } => {
    const resolved = resolvedGroups?.get(concept.foodType) ?? [];
    const picked = pickBestResolvedRetailCandidate(source, concept, resolved, takenNames);
    if (picked) return picked;

    const fallbackName = concept.labelKo;
    takenNames.add(compactKorean(normalizeProductIdentity(fallbackName)));
    return { name: fallbackName };
  };

  if (top.length === 1) {
    const x = top[0]!;
    const b = buildReason(x.c, targets);
    const display = buildDisplay(x.c);
    return [
      {
        name: display.name,
        url: display.url,
        score: x.score,
        recommendationType: 'balanced',
        ...b,
      },
    ];
  }

  if (top.length === 2) {
    const lo = top[1]!;
    const hi = top[0]!;
    const b0 = buildReason(lo.c, targets);
    const b1 = buildReason(hi.c, targets);
    const d0 = buildDisplay(lo.c);
    const d1 = buildDisplay(hi.c);

    return [
      {
        name: d0.name,
        url: d0.url,
        score: lo.score,
        recommendationType: 'similar',
        ...b0,
      },
      {
        name: d1.name,
        url: d1.url,
        score: hi.score,
        recommendationType: 'healthier',
        ...b1,
      },
    ];
  }

  const hi = top[0]!;
  const mid = top[1]!;
  const lo = top[2]!;

  const b0 = buildReason(lo.c, targets);
  const b1 = buildReason(mid.c, targets);
  const b2 = buildReason(hi.c, targets);

  const d0 = buildDisplay(lo.c);
  const d1 = buildDisplay(mid.c);
  const d2 = buildDisplay(hi.c);

  return [
    {
      name: d0.name,
      url: d0.url,
      score: lo.score,
      recommendationType: 'similar',
      ...b0,
    },
    {
      name: d1.name,
      url: d1.url,
      score: mid.score,
      recommendationType: 'balanced',
      ...b1,
    },
    {
      name: d2.name,
      url: d2.url,
      score: hi.score,
      recommendationType: 'healthier',
      ...b2,
    },
  ];
}

export function runRecommendationPipeline(
  input: RecommendationEngineInput,
  _searchPort?: CandidateSearchPort
): SubstituteRecommendation[] {
  const foodType = inferFoodType(input);
  const targets = deriveImprovementTargets(input);
  const rawCandidates = generateCandidates(foodType, targets);

  const scored = rawCandidates
    .map((c) => {
      const ev = evaluateCandidate(input, c, targets);
      return { c, ev };
    })
    .filter(({ ev, c }) => {
      if (!isCategoryCompatible(foodType, c.foodType)) return false;

      if (
        isDuplicateOrSameProduct(
          {
            productName: input.productName,
            rawMaterials: input.rawMaterials ?? '',
            companyName: input.companyName,
          },
          { name: c.labelKo, foodType: c.foodType }
        )
      ) {
        return false;
      }

      if (!hasMeaningfulImprovement(ev, targets)) return false;
      if (ev.total < 30) return false;

      return true;
    })
    .map(({ c, ev }) => ({ c, score: ev.total }))
    .sort((a, b) => b.score - a.score);

  const dedup: { c: ConceptCandidate; score: number }[] = [];
  const seen = new Set<string>();

  for (const row of scored) {
    const key = compactKorean(row.c.foodType);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(row);
  }

  const finalConcepts = dedup.length > 0
    ? dedup.slice(0, 8)
    : rawCandidates
        .map((c) => ({ c, ev: evaluateCandidate(input, c, targets) }))
        .filter(
          ({ c, ev }) =>
            isCategoryCompatible(foodType, c.foodType) &&
            !isDuplicateOrSameProduct(
              {
                productName: input.productName,
                rawMaterials: input.rawMaterials ?? '',
                companyName: input.companyName,
              },
              { name: c.labelKo, foodType: c.foodType }
            ) &&
            ev.total > 0
        )
        .sort((a, b) => b.ev.total - a.ev.total)
        .map(({ c, ev }) => ({ c, score: ev.total }))
        .slice(0, 8);

  // NOTE: 이 엔진은 현재 기본 경로(테스트/클라이언트 폴백)에서 동기 반환만 지원합니다.
  // 검색 포트 기반의 실제 상품명 해석은 별도 비동기 파이프라인에서 처리할 수 있어요.
  return buildTypedRecommendationsFromConcepts(input, finalConcepts, targets, undefined);
}

export function engineRecommendationsToAlternativeJson(
  input: RecommendationEngineInput,
  recs: SubstituteRecommendation[]
): AlternativeFoodJsonRoot {
  const ng = Math.min(4, Math.max(1, input.novaGroup || 4));
  const sub = input.novaSubgroup ? safeString(input.novaSubgroup).toUpperCase() : '';
  const baseStage = sub && ['4A', '4B', '4C'].includes(sub) ? `Group ${ng} · ${sub}` : `Group ${ng}`;

  const tier = input.bmiTier ?? null;
  const bmiHint =
    tier === 'overweight' || tier === 'obese'
      ? ' · 맞춤: 체중 관리(과체중/비만)'
      : tier === 'underweight'
        ? ' · 맞춤: 에너지·포만감(저체중)'
        : tier === 'normal'
          ? ' · 맞춤: 일반(정상 체중)'
          : ' · 맞춤: 일반(BMI 미입력 시 기본)';

  const stage = `${baseStage}${bmiHint}`;

  const tierMap: Record<SubstituteRecommendation['recommendationType'], AlternativeFoodJsonItem['tier']> = {
    similar: 'slight',
    balanced: 'better',
    healthier: 'best',
  };

  const alternatives: AlternativeFoodJsonItem[] = recs.slice(0, 3).map((r) => ({
    tier: tierMap[r.recommendationType],
    productName: r.name,
    reason: `${r.reason} (${r.shortComparison})`,
    purchaseUrl:
      r.url ||
      'https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=' +
        encodeURIComponent(r.name),
  }));

  return {
    currentFood: safeString(input.productName),
    processingStage: stage,
    alternatives,
  };
}

export function bmiValueToTier(bmi: number): BmiTier {
  if (bmi < 18.5) return 'underweight';
  if (bmi <= 22.9) return 'normal';
  if (bmi <= 24.9) return 'overweight';
  return 'obese';
}