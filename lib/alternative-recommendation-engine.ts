import type { AlternativeFoodJsonItem, AlternativeFoodJsonRoot } from '@/lib/alternative-food-json';
import type { BmiTier } from '@/lib/gemini-prompts';

export type { BmiTier };

export type ImprovementTargets = {
  lowerProcessing: boolean;
  lowerSugar: boolean;
  lowerSodium: boolean;
  simplerIngredients: boolean;
  avoidOverconsumptionTriggers: boolean;
  maintainSatiety: boolean;
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
};

export type CandidateSearchPort = {
  resolveLabels: (labels: string[], foodType: string) => Promise<{ label: string; url?: string }[]>;
};

export const RECOMMENDATION_ENGINE_INTEGRATION_NOTES = `
1) Gemini / Perplexity 연결: CandidateSearchPort로 추상화된 뒤, Perplexity는 foodType·labelKo만 넣어 상품 URL을 수집하고, Gemini는 상세페이지 HTML/구조화 텍스트에서 원재료를 한 번 더 정리해 NOVA 추정에 쓸 수 있음.
2) 검색 결과 정규화: 호스트 화이트리스트, 상품명 코어 키워드 추출(productIdentityCore), 중량·개입 제거 후 동일 SKU 병합, foodType 불일치 시 폐기.
3) 로그: inferFoodType 결과, generateCandidates 크기, isDuplicateOrSameProduct 탈락 사유 코드, evaluateCandidate 부분점수, 최종 점수 분포를 구조화 JSON으로 남김.
4) 잘못된 추천 방지: 동일 제품 키워드 차단, 허용 foodType 화이트리스트, 점수 임계 미만 제외, BMI·당·나트륨 목표와 모순 후보 감점, 외부 검색 결과는 반드시 foodType 호환 검사.
`.trim();

const FOOD_TYPE_ALLOWED_TARGETS: Record<string, Set<string>> = {
  sweet_nut_snack: new Set([
    'unsalted_mixed_nuts',
    'dry_roasted_almonds',
    'plain_roasted_peanuts',
    'low_sugar_nut_snack',
    'lightly_salted_mixed_nuts',
  ]),
  salty_crispy_snack: new Set([
    'baked_vegetable_crisp',
    'air_popped_popcorn_plain',
    'lightly_salted_rice_cake_chip',
    'baked_grain_crisp',
  ]),
  sweet_carbonated_drink: new Set([
    'zero_carbonated_drink',
    'sparkling_water_unsweetened',
    'unsweetened_iced_tea',
  ]),
  sweet_snack_bar: new Set([
    'nut_dominant_bar_low_sugar',
    'whole_food_energy_bar',
    'dried_fruit_bar_unsweetened',
  ]),
  instant_meal: new Set([
    'lower_sodium_instant_noodle',
    'frozen_grain_bowl_plain',
    'ready_rice_with_vegetable',
  ]),
  instant_noodle_cup: new Set([
    'lower_sodium_instant_noodle',
    'non_fried_noodle_cup',
    'plain_rice_noodle_soup_kit',
  ]),
  flavored_milk_drink: new Set([
    'plain_milk',
    'unsweetened_soy_milk',
    'low_sugar_yogurt_drink',
  ]),
  generic_sweet_snack: new Set([
    'dried_fruit_unsweetened',
    'plain_rice_cracker',
    'dark_chocolate_high_cocoa',
  ]),
  generic_salty_snack: new Set([
    'lightly_salted_seaweed',
    'plain_rice_cake_snack',
    'roasted_chickpea_plain',
  ]),
  generic_beverage: new Set([
    'zero_carbonated_drink',
    'sparkling_water_unsweetened',
    'cold_brew_unsweetened',
  ]),
  chocolate_candy: new Set([
    'dark_chocolate_high_cocoa',
    'cocoa_coated_nuts_little_added_sugar',
    'dried_fruit_unsweetened',
  ]),
  cereal_breakfast: new Set([
    'plain_oats_unsweetened',
    'low_sugar_whole_grain_cereal',
  ]),
  bread_pastry: new Set([
    'whole_grain_bread_plain',
    'rice_bread_lower_sugar',
    'plain_rice_cracker',
  ]),
  dairy_snack: new Set([
    'plain_greek_yogurt',
    'natural_cheese_portion',
  ]),
  unsweetened_tea_coffee_drink: new Set([
    'cold_brew_unsweetened',
    'sparkling_water_unsweetened',
    'unsweetened_iced_tea',
  ]),
  energy_sports_drink: new Set([
    'electrolyte_low_sugar',
    'coconut_water_plain',
  ]),
};

const MOCK_CANDIDATES: ConceptCandidate[] = [
  {
    foodType: 'unsalted_mixed_nuts',
    labelKo: '무가당 볶음 견과·믹스넛',
    processingTierExpect: 3,
    sugarRelief: 0.85,
    sodiumRelief: 0.4,
    ingredientSimplicity: 0.75,
    satietyPreservation: 0.9,
    realism: 0.9,
  },
  {
    foodType: 'dry_roasted_almonds',
    labelKo: '볶은 아몬드(무가당·저염)',
    processingTierExpect: 3,
    sugarRelief: 0.9,
    sodiumRelief: 0.45,
    ingredientSimplicity: 0.8,
    satietyPreservation: 0.85,
    realism: 0.92,
  },
  {
    foodType: 'plain_roasted_peanuts',
    labelKo: '소금 적은 볶음 땅콩(꿀·코팅 없음)',
    processingTierExpect: 3,
    sugarRelief: 0.88,
    sodiumRelief: 0.35,
    ingredientSimplicity: 0.78,
    satietyPreservation: 0.88,
    realism: 0.88,
  },
  {
    foodType: 'low_sugar_nut_snack',
    labelKo: '저당 견과 스낵(시럽·코팅 최소)',
    processingTierExpect: 4,
    sugarRelief: 0.55,
    sodiumRelief: 0.3,
    ingredientSimplicity: 0.45,
    satietyPreservation: 0.8,
    realism: 0.75,
  },
  {
    foodType: 'lightly_salted_mixed_nuts',
    labelKo: '저염 믹스넛',
    processingTierExpect: 3,
    sugarRelief: 0.82,
    sodiumRelief: 0.6,
    ingredientSimplicity: 0.72,
    satietyPreservation: 0.87,
    realism: 0.9,
  },
  {
    foodType: 'zero_carbonated_drink',
    labelKo: '제로·무가당 탄산음료',
    processingTierExpect: 4,
    sugarRelief: 0.95,
    sodiumRelief: 0.2,
    ingredientSimplicity: 0.25,
    satietyPreservation: 0.1,
    realism: 0.95,
  },
  {
    foodType: 'sparkling_water_unsweetened',
    labelKo: '플레인 탄산수',
    processingTierExpect: 2,
    sugarRelief: 1,
    sodiumRelief: 0.5,
    ingredientSimplicity: 0.95,
    satietyPreservation: 0.05,
    realism: 0.98,
  },
  {
    foodType: 'unsweetened_iced_tea',
    labelKo: '무가당 냉침 차(복숭아·레몬 향 제로)',
    processingTierExpect: 3,
    sugarRelief: 0.92,
    sodiumRelief: 0.25,
    ingredientSimplicity: 0.55,
    satietyPreservation: 0.1,
    realism: 0.8,
  },
  {
    foodType: 'baked_vegetable_crisp',
    labelKo: '구운 채소칩(기름·소금 적은 타입)',
    processingTierExpect: 3,
    sugarRelief: 0.3,
    sodiumRelief: 0.45,
    ingredientSimplicity: 0.6,
    satietyPreservation: 0.55,
    realism: 0.82,
  },
  {
    foodType: 'air_popped_popcorn_plain',
    labelKo: '에어팝 팝콘(버터·시럽 적음)',
    processingTierExpect: 3,
    sugarRelief: 0.5,
    sodiumRelief: 0.4,
    ingredientSimplicity: 0.7,
    satietyPreservation: 0.65,
    realism: 0.85,
  },
  {
    foodType: 'lightly_salted_rice_cake_chip',
    labelKo: '저염 현미·곡물 스낵',
    processingTierExpect: 3,
    sugarRelief: 0.55,
    sodiumRelief: 0.55,
    ingredientSimplicity: 0.68,
    satietyPreservation: 0.6,
    realism: 0.88,
  },
  {
    foodType: 'baked_grain_crisp',
    labelKo: '오븐 구운 곡물칩',
    processingTierExpect: 3,
    sugarRelief: 0.45,
    sodiumRelief: 0.42,
    ingredientSimplicity: 0.62,
    satietyPreservation: 0.62,
    realism: 0.84,
  },
  {
    foodType: 'nut_dominant_bar_low_sugar',
    labelKo: '견과 비중 높은 저당 에너지바',
    processingTierExpect: 4,
    sugarRelief: 0.5,
    sodiumRelief: 0.3,
    ingredientSimplicity: 0.5,
    satietyPreservation: 0.78,
    realism: 0.8,
  },
  {
    foodType: 'whole_food_energy_bar',
    labelKo: '원물 위주·첨가 적은 에너지바',
    processingTierExpect: 4,
    sugarRelief: 0.42,
    sodiumRelief: 0.35,
    ingredientSimplicity: 0.65,
    satietyPreservation: 0.8,
    realism: 0.72,
  },
  {
    foodType: 'dried_fruit_bar_unsweetened',
    labelKo: '첨가당 없는 건과일 프레스 바',
    processingTierExpect: 3,
    sugarRelief: 0.35,
    sodiumRelief: 0.2,
    ingredientSimplicity: 0.7,
    satietyPreservation: 0.55,
    realism: 0.65,
  },
  {
    foodType: 'lower_sodium_instant_noodle',
    labelKo: '나트륨 낮은 컵라면·면류',
    processingTierExpect: 4,
    sugarRelief: 0.2,
    sodiumRelief: 0.65,
    ingredientSimplicity: 0.35,
    satietyPreservation: 0.85,
    realism: 0.9,
  },
  {
    foodType: 'non_fried_noodle_cup',
    labelKo: '비·건조면 기반 컵라면',
    processingTierExpect: 4,
    sugarRelief: 0.22,
    sodiumRelief: 0.48,
    ingredientSimplicity: 0.38,
    satietyPreservation: 0.82,
    realism: 0.78,
  },
  {
    foodType: 'plain_rice_noodle_soup_kit',
    labelKo: '담백한 쌀국수·쌀면 키트',
    processingTierExpect: 3,
    sugarRelief: 0.28,
    sodiumRelief: 0.52,
    ingredientSimplicity: 0.55,
    satietyPreservation: 0.78,
    realism: 0.7,
  },
  {
    foodType: 'frozen_grain_bowl_plain',
    labelKo: '소스 따로·곡물 위주 냉동 볼',
    processingTierExpect: 3,
    sugarRelief: 0.35,
    sodiumRelief: 0.5,
    ingredientSimplicity: 0.58,
    satietyPreservation: 0.88,
    realism: 0.75,
  },
  {
    foodType: 'ready_rice_with_vegetable',
    labelKo: '야채 곁들인 즉석밥(소스 적음)',
    processingTierExpect: 3,
    sugarRelief: 0.25,
    sodiumRelief: 0.42,
    ingredientSimplicity: 0.48,
    satietyPreservation: 0.9,
    realism: 0.82,
  },
  {
    foodType: 'plain_milk',
    labelKo: '무가당 우유',
    processingTierExpect: 2,
    sugarRelief: 0.4,
    sodiumRelief: 0.15,
    ingredientSimplicity: 0.88,
    satietyPreservation: 0.7,
    realism: 0.97,
  },
  {
    foodType: 'unsweetened_soy_milk',
    labelKo: '무가당 두유',
    processingTierExpect: 3,
    sugarRelief: 0.65,
    sodiumRelief: 0.2,
    ingredientSimplicity: 0.75,
    satietyPreservation: 0.72,
    realism: 0.93,
  },
  {
    foodType: 'low_sugar_yogurt_drink',
    labelKo: '저당 요거트 드링크',
    processingTierExpect: 4,
    sugarRelief: 0.52,
    sodiumRelief: 0.18,
    ingredientSimplicity: 0.42,
    satietyPreservation: 0.6,
    realism: 0.86,
  },
  {
    foodType: 'dried_fruit_unsweetened',
    labelKo: '첨가당 없는 건과일',
    processingTierExpect: 2,
    sugarRelief: 0.25,
    sodiumRelief: 0.1,
    ingredientSimplicity: 0.85,
    satietyPreservation: 0.45,
    realism: 0.88,
  },
  {
    foodType: 'plain_rice_cracker',
    labelKo: '무가당·저염 쌀과자',
    processingTierExpect: 3,
    sugarRelief: 0.6,
    sodiumRelief: 0.52,
    ingredientSimplicity: 0.72,
    satietyPreservation: 0.58,
    realism: 0.9,
  },
  {
    foodType: 'dark_chocolate_high_cocoa',
    labelKo: '고함량 다크 초콜릿(당 적은 타입)',
    processingTierExpect: 4,
    sugarRelief: 0.45,
    sodiumRelief: 0.12,
    ingredientSimplicity: 0.48,
    satietyPreservation: 0.52,
    realism: 0.88,
  },
  {
    foodType: 'lightly_salted_seaweed',
    labelKo: '저염 김·해초 스낵',
    processingTierExpect: 3,
    sugarRelief: 0.35,
    sodiumRelief: 0.58,
    ingredientSimplicity: 0.7,
    satietyPreservation: 0.4,
    realism: 0.92,
  },
  {
    foodType: 'plain_rice_cake_snack',
    labelKo: '무가당 뻥튀기·쌀스낵',
    processingTierExpect: 3,
    sugarRelief: 0.58,
    sodiumRelief: 0.35,
    ingredientSimplicity: 0.68,
    satietyPreservation: 0.52,
    realism: 0.87,
  },
  {
    foodType: 'roasted_chickpea_plain',
    labelKo: '볶은 병아리콩 스낵',
    processingTierExpect: 2,
    sugarRelief: 0.55,
    sodiumRelief: 0.38,
    ingredientSimplicity: 0.82,
    satietyPreservation: 0.75,
    realism: 0.78,
  },
  {
    foodType: 'cold_brew_unsweetened',
    labelKo: '무가당 콜드브루·블랙커피',
    processingTierExpect: 3,
    sugarRelief: 1,
    sodiumRelief: 0.1,
    ingredientSimplicity: 0.8,
    satietyPreservation: 0.1,
    realism: 0.9,
  },
  {
    foodType: 'cocoa_coated_nuts_little_added_sugar',
    labelKo: '코코아 견과(당 첨가 적은 제품)',
    processingTierExpect: 4,
    sugarRelief: 0.35,
    sodiumRelief: 0.22,
    ingredientSimplicity: 0.4,
    satietyPreservation: 0.75,
    realism: 0.7,
  },
  {
    foodType: 'plain_oats_unsweetened',
    labelKo: '무가당 오트밀',
    processingTierExpect: 2,
    sugarRelief: 0.7,
    sodiumRelief: 0.15,
    ingredientSimplicity: 0.9,
    satietyPreservation: 0.85,
    realism: 0.92,
  },
  {
    foodType: 'low_sugar_whole_grain_cereal',
    labelKo: '저당 통곡물 시리얼',
    processingTierExpect: 4,
    sugarRelief: 0.5,
    sodiumRelief: 0.3,
    ingredientSimplicity: 0.5,
    satietyPreservation: 0.78,
    realism: 0.85,
  },
  {
    foodType: 'whole_grain_bread_plain',
    labelKo: '첨가당 적은 통곡식빵',
    processingTierExpect: 3,
    sugarRelief: 0.4,
    sodiumRelief: 0.35,
    ingredientSimplicity: 0.55,
    satietyPreservation: 0.82,
    realism: 0.88,
  },
  {
    foodType: 'rice_bread_lower_sugar',
    labelKo: '저당 쌀빵·쌀 베이글',
    processingTierExpect: 4,
    sugarRelief: 0.48,
    sodiumRelief: 0.28,
    ingredientSimplicity: 0.48,
    satietyPreservation: 0.8,
    realism: 0.74,
  },
  {
    foodType: 'plain_greek_yogurt',
    labelKo: '무가당 그릭요거트',
    processingTierExpect: 2,
    sugarRelief: 0.55,
    sodiumRelief: 0.2,
    ingredientSimplicity: 0.78,
    satietyPreservation: 0.82,
    realism: 0.94,
  },
  {
    foodType: 'natural_cheese_portion',
    labelKo: '천연 치즈 소포장',
    processingTierExpect: 3,
    sugarRelief: 0.25,
    sodiumRelief: 0.32,
    ingredientSimplicity: 0.7,
    satietyPreservation: 0.8,
    realism: 0.92,
  },
  {
    foodType: 'electrolyte_low_sugar',
    labelKo: '저당 이온음료',
    processingTierExpect: 4,
    sugarRelief: 0.45,
    sodiumRelief: 0.15,
    ingredientSimplicity: 0.22,
    satietyPreservation: 0.15,
    realism: 0.8,
  },
  {
    foodType: 'coconut_water_plain',
    labelKo: '무가당 코코넛 워터',
    processingTierExpect: 2,
    sugarRelief: 0.35,
    sodiumRelief: 0.12,
    ingredientSimplicity: 0.88,
    satietyPreservation: 0.25,
    realism: 0.78,
  },
];

function haystackOf(input: RecommendationEngineInput): string {
  const parts = [
    input.productName,
    input.rawMaterials ?? '',
    input.foodCategory ?? '',
    input.briefDescription ?? '',
    input.companyName ?? '',
  ];
  return parts
    .map((s) => String(s || '').toLowerCase())
    .join(' ')
    .replace(/\s+/g, ' ');
}

function compactKorean(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣]/gi, '');
}

export function inferFoodType(input: RecommendationEngineInput): string {
  const h = haystackOf(input);
  const c = compactKorean(h);
  const cat = String(input.foodCategory || '').trim();

  if (
    /(컵\s*라면|컵라면|봉지\s*라면|즉석면|cup\s*noodle|라면\s*\(|^라면)/i.test(h) ||
    (/라면|우동|짜장면/.test(h) && /면/.test(h) && /(스프|분말|후레이크|건조)/.test(h))
  ) {
    return 'instant_noodle_cup';
  }

  if (
    /(즉석\s*밥|즉석\s*도시락|햄버거|샌드위치|덮밥|볶음밥\s*팩|컵밥)/i.test(h) ||
    cat === '간편한 한 끼'
  ) {
    if (/(라면|면\s*류|noodle)/i.test(h) && !/(즉석밥|도시락|햄버거)/i.test(h)) return 'instant_noodle_cup';
    return 'instant_meal';
  }

  if (
    /(콜라|코카콜라|펩시|사이다|환타|스프라이트|탄산\s*음료|탄산음료|소다\s*팝|soda|coke|pepsi)/i.test(
      h
    ) ||
    (cat === '음료' && /탄산|스파클링\s*사이다|사이다/.test(h))
  ) {
    return 'sweet_carbonated_drink';
  }

  if (/(감자칩|포카칩|포테이토\s*칩|chip|치\s*즈\s*볼\s*스낵|나쵸)/i.test(h) && cat !== '음료') {
    return 'salty_crispy_snack';
  }

  if (
    /(꿀\s*땅콩|꿀땅콩|허니\s*땅콩|honey\s*peanut|honey\s*roast|코팅\s*땅콩|견과\s*류\s*스낵|믹스\s*넛|견과\s*스낵)/i.test(
      h
    ) ||
    (/(땅콩|아몬드|호두|캐슈|피칸|견과|너트|nut)/i.test(h) &&
      /(꿀|허니|honey|시럽|코팅|캔디|볶음\s*시즈닝)/i.test(h) &&
      cat !== '음료')
  ) {
    return 'sweet_nut_snack';
  }

  if (/(초코\s*바|에너지바|그래놀라\s*바|프로틴\s*바|snack\s*bar)/i.test(h)) {
    return 'sweet_snack_bar';
  }

  if (/(초콜릿|초코렛|젤리류|말랑|캔디)/i.test(h) && !/(우유|drink|음료)/i.test(h)) {
    return 'chocolate_candy';
  }

  if (/(바나나우유|딸기우유|초코우유|치즈\s*드링크|요거트\s*드링크)/i.test(h)) {
    return 'flavored_milk_drink';
  }

  if (/(시리얼|cereal|그래놀라|오트밀\s*시리얼)/i.test(h) || cat === '빵·시리얼류') {
    if (/(식빵|베이글|모닝빵|크루아상|토스트)/i.test(h)) return 'bread_pastry';
    return 'cereal_breakfast';
  }

  if (/(아이스크림|요거트|푸딩|치즈\s*스틱|요구르트)/i.test(h) && cat === '유제품·디저트') {
    return 'dairy_snack';
  }

  if (/(블랙\s*커피|아메리카노|콜드브루|녹차\s*음료|무가당\s*차)/i.test(h) && cat === '음료') {
    return 'unsweetened_tea_coffee_drink';
  }

  if (/(게토레이|파워에이드|이온|스포츠\s*음료|electrolyte)/i.test(h)) {
    return 'energy_sports_drink';
  }

  if (cat === '음료') return 'generic_beverage';
  if (cat === '달콤한 간식') return 'generic_sweet_snack';
  if (cat === '짭짤한 간식') return 'generic_salty_snack';
  if (cat === '유제품·디저트') return 'dairy_snack';
  if (cat === '빵·시리얼류') return 'bread_pastry';
  if (cat === '간편한 한 끼') return 'instant_meal';

  return 'generic_sweet_snack';
}

export function deriveImprovementTargets(input: RecommendationEngineInput): ImprovementTargets {
  const nut = input.nutrition ?? null;
  const sg = typeof nut?.sugarG === 'number' ? nut.sugarG : null;
  const na = typeof nut?.sodiumMg === 'number' ? nut.sodiumMg : null;
  const sub = String(input.novaSubgroup || '').toUpperCase();
  const ng = Math.min(4, Math.max(1, input.novaGroup || 4));
  const concerns = input.concernIngredients ?? [];
  const concernCount = concerns.filter((x) => String(x?.name || '').trim().length > 0).length;
  const tier = input.bmiTier ?? null;

  const lowerProcessing = sub === '4B' || sub === '4C';
  const lowerSugar = sg != null ? sg >= 8 : ng >= 4;
  const lowerSodium = na != null ? na >= 280 : ng >= 3;
  const simplerIngredients = concernCount >= 2 || ng >= 4;
  const avoidOverconsumptionTriggers = tier === 'overweight' || tier === 'obese';
  const maintainSatiety = tier === 'underweight';

  return {
    lowerProcessing,
    lowerSugar,
    lowerSodium,
    simplerIngredients,
    avoidOverconsumptionTriggers,
    maintainSatiety,
  };
}

export function generateCandidates(
  foodType: string,
  _improvementTargets: ImprovementTargets
): ConceptCandidate[] {
  const allowed = FOOD_TYPE_ALLOWED_TARGETS[foodType];
  if (!allowed || allowed.size === 0) {
    return MOCK_CANDIDATES.filter((m) => m.foodType === 'plain_rice_cracker' || m.foodType === 'dried_fruit_unsweetened');
  }
  return MOCK_CANDIDATES.filter((m) => allowed.has(m.foodType));
}

export function isCategoryCompatible(foodType: string, candidateFoodType: string): boolean {
  const allowed = FOOD_TYPE_ALLOWED_TARGETS[foodType];
  if (!allowed) return false;
  return allowed.has(candidateFoodType);
}

function levenshtein(a: string, b: string): number {
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

function similarityRatio(a: string, b: string): number {
  const A = compactKorean(a);
  const B = compactKorean(b);
  if (!A.length || !B.length) return 0;
  const d = levenshtein(A, B);
  return 1 - d / Math.max(A.length, B.length);
}

function tokenSetJaccard(a: string, b: string): number {
  const ta = new Set(
    String(a || '')
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/i)
      .filter((t) => t.length >= 2)
  );
  const tb = new Set(
    String(b || '')
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/i)
      .filter((t) => t.length >= 2)
  );
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((x) => {
    if (tb.has(x)) inter++;
  });
  return inter / (ta.size + tb.size - inter);
}

export function isDuplicateOrSameProduct(
  source: ProductSource,
  candidate: { name: string; foodType?: string }
): boolean {
  const pn = String(source.productName || '').trim();
  const raw = String(source.rawMaterials || '').trim();
  const cn = String(candidate.name || '').trim();
  if (!pn || !cn) return false;

  if (similarityRatio(pn, cn) >= 0.86) return true;

  const pnc = compactKorean(pn);
  const cnc = compactKorean(cn);
  if (pnc.length >= 6 && cnc.length >= 6) {
    const sub = pnc.length <= cnc.length ? pnc : cnc;
    const sup = pnc.length > cnc.length ? pnc : cnc;
    if (sup.includes(sub) && sub.length / sup.length >= 0.72) return true;
  }

  const honeyPeanutPhrase =
    /(꿀땅콩|허니땅콩|허니\s*땅콩|꿀\s*땅콩|honey\s*peanut|honey\s*roast|honeyroast)/i;
  const srcHoney = honeyPeanutPhrase.test(pn) || honeyPeanutPhrase.test(raw);
  const negHoney =
    /(무가당|비코팅|꿀\s*없|허니\s*없|코팅\s*없|no\s*honey|honey\s*free|unsweetened|저당\s*볶음|볶음\s*땅콩\s*\(|소금\s*적은\s*볶음)/i.test(
      cn
    );
  let candHoney =
    honeyPeanutPhrase.test(cn) ||
    (/(꿀|허니|honey)/i.test(cn) &&
      /(땅콩|피넛|peanut)/i.test(cn) &&
      /(코팅|시럽|캔디)/i.test(cn));
  if (negHoney) candHoney = false;
  if (srcHoney && candHoney) return true;

  const colaPhrase = /(코카콜라|콜라|펩시|환타|사이다|콜라\s*맛)/i;
  const srcCola =
    colaPhrase.test(pn) && !/제로|무가당|zero|다이어트|제로슈거/i.test(pn);
  const candCola = colaPhrase.test(cn) && !/제로|무가당|zero|다이어트|제로슈거|탄산수|스파클링\s*워터/i.test(cn);
  if (srcCola && candCola) return true;

  if (tokenSetJaccard(`${pn} ${raw}`, cn) >= 0.62 && similarityRatio(pn, cn) >= 0.45) return true;

  return false;
}

function sourceProcessingTier(input: RecommendationEngineInput): number {
  return Math.min(4, Math.max(1, input.novaGroup || 4));
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

  if (isDuplicateOrSameProduct(
    {
      productName: source.productName,
      rawMaterials: source.rawMaterials ?? '',
      companyName: source.companyName,
    },
    { name: candidate.labelKo, foodType: candidate.foodType }
  )) {
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
  const categorySimilarityScore = 0.92;
  const processingImprovementScore = Math.max(
    0,
    Math.min(1, (srcTier - candidate.processingTierExpect + 1) / 3)
  );
  let nutritionImprovementScore =
    (improvementTargets.lowerSugar ? candidate.sugarRelief * 0.55 : candidate.sugarRelief * 0.25) +
    (improvementTargets.lowerSodium ? candidate.sodiumRelief * 0.45 : candidate.sodiumRelief * 0.2);
  nutritionImprovementScore = Math.min(1, nutritionImprovementScore);

  const ingredientSimplicityScore = candidate.ingredientSimplicity;
  let userFitScore = 0.72;
  if (improvementTargets.avoidOverconsumptionTriggers) userFitScore += 0.12 * candidate.sugarRelief;
  if (improvementTargets.maintainSatiety) userFitScore += 0.14 * candidate.satietyPreservation;
  userFitScore = Math.min(1, userFitScore);
  const realismScore = candidate.realism;

  let procPenalty = 0;
  if (improvementTargets.lowerProcessing && candidate.processingTierExpect >= srcTier) procPenalty = 0.25;

  const total =
    100 *
    Math.max(
      0,
      Math.min(
        1,
        categorySimilarityScore * 0.18 +
          processingImprovementScore * 0.22 +
          nutritionImprovementScore * 0.24 +
          ingredientSimplicityScore * 0.14 +
          userFitScore * 0.12 +
          realismScore * 0.1 -
          procPenalty
      )
    );

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
  if (ev.total < 22) return false;
  if (!improvementTargets.lowerProcessing && !improvementTargets.lowerSugar && !improvementTargets.lowerSodium)
    return ev.nutritionImprovementScore >= 0.18 || ev.processingImprovementScore >= 0.2;
  if (improvementTargets.lowerSugar && ev.nutritionImprovementScore < 0.12 && ev.processingImprovementScore < 0.15)
    return false;
  return true;
}

function buildReason(
  c: ConceptCandidate,
  improvementTargets: ImprovementTargets
): { reason: string; shortComparison: string } {
  const bits: string[] = [];
  if (improvementTargets.lowerSugar && c.sugarRelief >= 0.5) bits.push('당 부담을 줄인 선택');
  if (improvementTargets.lowerSodium && c.sodiumRelief >= 0.45) bits.push('나트륨 부담을 줄인 선택');
  if (improvementTargets.lowerProcessing && c.processingTierExpect <= 3) bits.push('가공 단계를 낮추기 쉬운 형태');
  if (improvementTargets.simplerIngredients && c.ingredientSimplicity >= 0.55) bits.push('원재료 구성이 단순한 편');
  if (improvementTargets.avoidOverconsumptionTriggers) bits.push('과식 유발 요소를 줄이는 방향');
  if (improvementTargets.maintainSatiety && c.satietyPreservation >= 0.65) bits.push('포만감은 비교적 유지');
  if (bits.length === 0) bits.push('같은 먹는 맥락에서 부담을 줄이는 대안');
  const reason = bits.slice(0, 2).join(' · ');
  return {
    reason,
    shortComparison: `지금 제품 대비 ${bits[0] || '부담 완화'}를 노린 유형`,
  };
}

function buildTypedRecommendations(
  sorted: { c: ConceptCandidate; score: number }[],
  targets: ImprovementTargets
): SubstituteRecommendation[] {
  const top = sorted.slice(0, 3);
  if (top.length === 0) return [];
  if (top.length === 1) {
    const x = top[0];
    const b = buildReason(x.c, targets);
    return [{ name: x.c.labelKo, score: x.score, recommendationType: 'balanced', ...b }];
  }
  if (top.length === 2) {
    const lo = top[1];
    const hi = top[0];
    const b0 = buildReason(lo.c, targets);
    const b1 = buildReason(hi.c, targets);
    return [
      { name: lo.c.labelKo, score: lo.score, recommendationType: 'similar', ...b0 },
      { name: hi.c.labelKo, score: hi.score, recommendationType: 'healthier', ...b1 },
    ];
  }
  const hi = top[0];
  const mid = top[1];
  const lo = top[2];
  const b0 = buildReason(lo.c, targets);
  const b1 = buildReason(mid.c, targets);
  const b2 = buildReason(hi.c, targets);
  return [
    { name: lo.c.labelKo, score: lo.score, recommendationType: 'similar', ...b0 },
    { name: mid.c.labelKo, score: mid.score, recommendationType: 'balanced', ...b1 },
    { name: hi.c.labelKo, score: hi.score, recommendationType: 'healthier', ...b2 },
  ];
}

export function runRecommendationPipeline(input: RecommendationEngineInput): SubstituteRecommendation[] {
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
      )
        return false;
      if (!hasMeaningfulImprovement(ev, targets)) return false;
      if (ev.total < 28) return false;
      return true;
    })
    .map(({ c, ev }) => ({ c, score: ev.total }))
    .sort((a, b) => b.score - a.score);

  const dedup: { c: ConceptCandidate; score: number }[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    const k = compactKorean(row.c.labelKo);
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(row);
  }

  if (dedup.length === 0) {
    const loose = rawCandidates
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
      .map(({ c, ev }) => ({ c, score: ev.total }));
    const seen2 = new Set<string>();
    const dedup2: { c: ConceptCandidate; score: number }[] = [];
    for (const row of loose) {
      const k = compactKorean(row.c.labelKo);
      if (seen2.has(k)) continue;
      seen2.add(k);
      dedup2.push(row);
    }
    return buildTypedRecommendations(dedup2.slice(0, 8), targets);
  }

  const sliced = dedup.slice(0, 8);
  return buildTypedRecommendations(sliced, targets);
}

export function engineRecommendationsToAlternativeJson(
  input: RecommendationEngineInput,
  recs: SubstituteRecommendation[]
): AlternativeFoodJsonRoot {
  const ng = Math.min(4, Math.max(1, input.novaGroup || 4));
  const sub = input.novaSubgroup ? String(input.novaSubgroup).trim().toUpperCase() : '';
  const stage = sub && (sub === '4A' || sub === '4B' || sub === '4C') ? `Group ${ng} · ${sub}` : `Group ${ng}`;
  const tierMap: Record<SubstituteRecommendation['recommendationType'], AlternativeFoodJsonItem['tier']> = {
    similar: 'slight',
    balanced: 'better',
    healthier: 'best',
  };
  const alternatives: AlternativeFoodJsonItem[] = recs.slice(0, 3).map((r) => ({
    tier: tierMap[r.recommendationType],
    productName: r.name,
    reason: `${r.reason} (${r.shortComparison})`,
    purchaseUrl: 'https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=' +
      encodeURIComponent(r.name),
  }));
  return {
    currentFood: String(input.productName || '').trim(),
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
