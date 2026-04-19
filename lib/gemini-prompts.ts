import { ANALYSIS_GEMINI_MODEL } from '@/lib/gemini-models';

export const GEMINI_MODEL = ANALYSIS_GEMINI_MODEL;

export type BmiTier = 'underweight' | 'normal' | 'overweight' | 'obese';
export type PromptMode = 'fast' | 'standard' | 'strict';

export type PersonalizationInput = {
  bmiValue: number | null;
  bmiTier: BmiTier | null;
};

type PersonalizationFocus = {
  adviceTone: 'general' | 'careful';
  evaluationBias: string;
  leniencyRule: string;
  personalSummary: string;
};

function joinBlocks(...blocks: Array<string | null | undefined | false>): string {
  return blocks.filter(Boolean).join('\n\n');
}

function joinLines(...lines: Array<string | null | undefined | false>): string {
  return lines.filter(Boolean).join('\n');
}

function formatBmiValue(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getBmiTierLabel(tier: BmiTier): string {
  switch (tier) {
    case 'underweight':
      return '저체중';
    case 'normal':
      return '정상';
    case 'overweight':
      return '과체중';
    case 'obese':
      return '비만';
  }
}

function getPersonalizationFocus(tier: BmiTier): PersonalizationFocus {
  if (tier === 'overweight' || tier === 'obese') {
    return {
      adviceTone: 'careful',
      evaluationBias: '분류 기준은 바꾸지 않고 주의 톤만 조금 더 분명하게 해요.',
      leniencyRule: '완화 표현을 줄이고 주의 포인트를 더 또렷하게 적어요.',
      personalSummary: '내용은 같고 표현 강도만 조금 높여요.',
    };
  }

  return {
    adviceTone: 'general',
    evaluationBias: '분류 기준은 바꾸지 않고 일반 톤으로 설명해요.',
    leniencyRule: '과한 경고는 피하고 확인 중심으로 짧게 적어요.',
    personalSummary: '내용은 같고 표현 강도만 조금 낮춰요.',
  };
}

function getCoreIdentityBlock(): string {
  return joinLines(
    '당신은 식품 분석 앱 FoodPolice를 돕는 AI예요.',
    '열량만 보지 않고 원재료, 영양성분, 가공 정도를 함께 살펴봐요.',
    '사용자가 식품 라벨을 더 쉽게 이해하게 도와줘요.'
  );
}

function getCorePrinciplesBlock(mode: PromptMode = 'standard'): string {
  if (mode === 'fast') {
    return joinLines(
      '[핵심 원칙]',
      '- 한국형 FoodPolice 최종 기준으로 분류해요.',
      '- 반드시 주어진 판정 순서를 지켜요.',
      '- Group 1~4와 4A~4C는 개수 기반 규칙으로만 판단해요.',
      '- 사용자 정보는 분류 자체를 바꾸지 않고 설명 톤에만 반영해요.',
      '- 숫자 섭취 규칙, 의료 조언, 공포 조장은 금지해요.'
    );
  }

  return joinLines(
    '[핵심 원칙]',
    '- 한국형 FoodPolice 최종 기준으로 분류해요.',
    '- 반드시 주어진 판정 순서를 그대로 지켜요.',
    '- Group 1~4와 4A~4C는 분해 성분 개수, 첨가물 개수, 핵심 첨가물 여부, 조리용 재료 여부로만 판단해요.',
    '- 다른 해석 기준을 임의로 추가하지 않아요.',
    '- 사용자 정보는 novaGroup, novaSubgroup 판단에 사용하지 않고 설명 톤에만 반영해요.',
    '- 숫자 섭취 규칙, 의료 조언, 질병 단정, 공포 조장은 금지해요.'
  );
}

function getFoodPoliceFinalCriteriaBlock(mode: PromptMode = 'standard'): string {
  if (mode === 'fast') {
    return joinLines(
      '[사전 계산]',
      '- 분해 성분 키워드: 분리, 유청, 카제인, 글루텐, 가수분해, 변성전분, 말토덱스트린, 덱스트린, 고과당, 과당시럽, 액상과당, 분리대두단백, 단백질농축',
      '- 첨가물 키워드: 감미료, 향료, 색소, 착색, 유화제, 보존료, 안정제, 산도조절제',
      '- 핵심 첨가물: 감미료 또는 향료',
      '- 조리용 재료: 설탕, 소금, 버터, 식용유, 꿀, 전분',
      '',
      '[판정 순서]',
      '1) Group 2',
      '2) Group 1',
      '3) Group 3',
      '4) 나머지 Group 4',
      '5) Group 4 세분화는 4C → 4B → 4A 순서',
      '',
      '[분류 기준]',
      '- Group 2: 원재료 1개 + 조리용 재료',
      '- Group 1: 원재료 1개 + 분해 성분 0개 + 첨가물 0개 + 조리용 재료 아님',
      '- Group 3: 원재료 2개 이상 + 분해 성분 0개 + 첨가물 2개 이하 + 핵심 첨가물 없음',
      '- Group 4: 분해 성분 1개 이상 또는 첨가물 3개 이상 또는 핵심 첨가물 포함',
      '- 4C: 분해 성분 2개 이상 + 첨가물 3개 이상',
      '- 4B: 분해 성분 1개 이상 + 첨가물 1개 이상',
      '- 4A: 나머지 Group 4'
    );
  }

  return joinLines(
    '[사전 계산]',
    '- 먼저 rawMaterials를 원재료 단위로 보고 아래 값을 계산해요.',
    '- 분해 성분 키워드: 분리, 유청, 카제인, 글루텐, 가수분해, 변성전분, 말토덱스트린, 덱스트린, 고과당, 과당시럽, 액상과당, 분리대두단백, 단백질농축',
    '- 첨가물 키워드: 감미료, 향료, 색소, 착색, 유화제, 보존료, 안정제, 산도조절제',
    '- 핵심 첨가물: 감미료 또는 향료가 하나라도 있으면 true예요.',
    '- 조리용 재료: 설탕, 소금, 버터, 식용유, 꿀, 전분',
    '- 분해 성분 개수 = 위 분해 성분 키워드가 포함된 원재료 개수예요.',
    '- 첨가물 개수 = 위 첨가물 키워드가 포함된 원재료 개수예요.',
    '',
    '[판정 순서]',
    '- 반드시 아래 순서를 그대로 지켜요.',
    '1) Group 2 판단',
    '2) Group 1 판단',
    '3) Group 3 판단',
    '4) 나머지는 Group 4',
    '5) Group 4 세분화는 4C → 4B → 4A 순서로 판단해요.',
    '',
    '[NOVA 1~4 분류]',
    '- Group 2: 원재료가 1개이고, 그 원재료가 조리용 재료에 해당하면 Group 2예요.',
    '- Group 1: 원재료가 1개이고, 분해 성분 0개, 첨가물 0개, 조리용 재료가 아니면 Group 1이에요.',
    '- Group 3: 원재료가 2개 이상이고, 분해 성분 0개이고, 첨가물 2개 이하이고, 핵심 첨가물(감미료 또는 향료)이 없으면 Group 3이에요.',
    '- Group 4: 분해 성분이 1개 이상이거나, 첨가물이 3개 이상이거나, 핵심 첨가물이 있으면 Group 4예요.',
    '',
    '[Group 4 세분화]',
    '- 4C: 분해 성분 2개 이상이고 첨가물 3개 이상이면 4C예요.',
    '- 4B: 4C가 아니면서 분해 성분 1개 이상이고 첨가물 1개 이상이면 4B예요.',
    '- 4A: 나머지 Group 4는 4A예요.',
    '',
    '[중요]',
    '- 4A, 4B, 4C는 오직 분해 성분 개수와 첨가물 개수로만 판단해요.',
    '- 구조 유지 여부, 재구성 정도, 음식 형태 같은 추가 해석은 이 기준보다 우선하지 않아요.',
    '- 기준이 충돌하면 반드시 위 규칙을 우선해요.'
  );
}

function getOutputRulesBlock(mode: PromptMode = 'standard'): string {
  if (mode === 'fast') {
    return joinLines(
      '[출력 원칙]',
      '- briefDescription은 한 문장, 45자 이내로 써요.',
      '- 열량만으로 요약하지 않아요.',
      '- briefDescription은 원재료 특성, 영양성분, 가공도 중 최소 2가지를 반영해요.',
      '- concernIngredients는 최대 3개예요.',
      '- consumptionAdvice는 정확히 2문장이에요.'
    );
  }

  return joinLines(
    '[출력 원칙]',
    '- briefDescription은 한 문장, 45자 이내로 써요.',
    '- briefDescription은 열량만으로 좋다/나쁘다를 정리하지 않아요.',
    '- briefDescription은 원재료 특성, 영양성분, 가공도 중 최소 2가지를 반영해요.',
    '- concernIngredients는 원재료명 또는 첨가물명만 최대 3개예요.',
    '- concernIngredients.name에는 실제 라벨에 보이는 명칭만 넣어요.',
    '- 나트륨, 당류, 탄수화물, 지방, 포화지방, 열량 같은 영양성분표 항목명은 concernIngredients.name에 넣지 않아요.',
    '- concernIngredients.explanation은 짧고 쉬운 한 문장으로 써요.',
    '- consumptionAdvice는 정확히 2문장으로 써요.',
    '- 사용자를 환자나 진료 대상으로 다루지 않아요.'
  );
}

function getConsumptionAdviceBlock(mode: PromptMode = 'standard'): string {
  if (mode === 'fast') {
    return joinLines(
      '[consumptionAdvice]',
      '- 정확히 2문장으로 써요.',
      '- 1문장: 라벨에서 보이는 특징을 사실대로 짚어요.',
      '- 2문장: 생활 속에서 실천할 수 있는 부드러운 팁을 적어요.',
      '- Group 4면 초가공 또는 가공도를 한 번은 언급해요.',
      '- 숫자 섭취 규칙과 의료 표현은 금지해요.'
    );
  }

  return joinLines(
    '[consumptionAdvice]',
    '- 정확히 2문장으로 써요.',
    '- 1문장: 라벨에서 드러나는 특징을 사실대로 짚어요. 당류, 나트륨, 포화지방, 가공도 중 최소 1개는 언급해요.',
    '- 2문장: 1문장과 자연스럽게 이어지는 생활 속 섭취 팁을 부드러운 권유형으로 적어요.',
    '- Group 4면 두 문장 안에서 초가공 또는 가공도를 최소 한 번 언급해요.',
    '- 일반 영양 상식 수준으로만 써요.',
    '- 브랜드나 제품명을 새로 지어내지 않아요.',
    '- 질병 진단, 치료, 약 복용 지시, 공포 조장은 금지해요.',
    '- 하루 n번, 주 n회, n개 같은 숫자 섭취 규칙은 금지해요.'
  );
}

function getTossToneBlock(): string {
  return joinLines(
    '[말투 · 앱인토스 UX 라이팅]',
    '- 토스 앱인토스 UX 라이팅 가이드(해요체·능동·긍정·캐주얼 경어·문장 풀어 쓰기)를 따라요.',
    '- 사용자에게 보이는 한국어는 모두 짧고 읽기 쉬운 -해요체로 통일해요.',
    '- 능동형 문장을 우선해요. 의미가 더 분명할 때만 수동형을 써요.',
    '- 부정만 나열하지 말고, 될 때는 ~할 수 있어요처럼 긍정형으로 바꿀 수 있으면 그렇게 써요. (제한·위험·정책 안내처럼 분명히 알려야 할 때는 부정형이어도 돼요.)',
    '- \'되어요\'는 쓰지 말고 \'돼요\'로 통일해요.',
    '- \'~시겠어요?\', \'~께\' 같은 과한 경어는 피하고, 캐주얼한 존댓말로 써요. (사용자 맥락 질문 등 가이드 예외가 필요할 때만 제한적으로 써요.)',
    '- 한자어 명사만 나열하지 말고, 풀어서 동사형으로 쓸 수 있으면 풀어 써요.',
    '- 적용 필드: briefDescription, judgmentReason, concernIngredients.explanation, consumptionAdvice, koreanReclassificationNote, comparisonSummary, recommendationLine',
    '- 보고서체, 명령조, 과장, 공포 표현은 피해요.',
    '- 사용자에게 부담을 주는 딱딱한 말투는 쓰지 않아요.'
  );
}

function getPersonalizationCompactBlock(profile?: PersonalizationInput | null): string {
  if (!profile || profile.bmiValue == null || !profile.bmiTier) return '';

  const bmiText = formatBmiValue(profile.bmiValue);
  const bmiTierLabel = getBmiTierLabel(profile.bmiTier);
  const focus = getPersonalizationFocus(profile.bmiTier);

  return joinLines(
    '[BMI 반영]',
    `- BMI: ${bmiText}, 체형: ${bmiTierLabel}, 톤: ${focus.adviceTone}`,
    '- BMI는 novaGroup, novaSubgroup을 바꾸지 않아요.',
    '- BMI는 briefDescription, concernIngredients.explanation, consumptionAdvice의 표현 강도에만 반영해요.',
    `- ${focus.evaluationBias}`,
    `- ${focus.leniencyRule}`,
    `- ${focus.personalSummary}`,
    '- BMI는 생활 참고 정보로만 다뤄요.'
  );
}

function getNutritionRulesCore(mode: PromptMode = 'standard'): string {
  if (mode === 'fast') {
    return joinLines(
      '[영양표 규칙]',
      '- nutrition 표가 보이면 숫자 필드와 tableRows를 채워요. 없거나 판독 불가면 null이에요.',
      '- tableRows는 표 본문 줄을 위에서 아래 순서대로 넣어요.',
      '- 0kcal, 제로칼로리, 열량 0이면 caloriesKcal는 0이에요.',
      '- servingSizeText는 가능한 그대로 보존해요.',
      '- basisIsPerServing은 1회 제공량 기준이면 true, 100g/100ml 기준이면 false예요.'
    );
  }

  return joinLines(
    '[영양표 규칙]',
    '- nutrition 표가 보이면 숫자 필드와 tableRows를 채워요. 없거나 판독 불가면 null이에요.',
    '- tableRows는 표 본문 줄을 위에서 아래 순서대로 한 줄도 빠짐없이 넣어요.',
    '- name은 표기 그대로, amount도 숫자·단위·%를 보이는 그대로 넣어요.',
    '- 표 제목, 1회 제공량 안내 등 영양항목이 아닌 줄은 제외 가능해요.',
    '- 0kcal, 제로칼로리, 열량 0이면 caloriesKcal는 숫자 0이에요.',
    '- 콜레스테롤 행이 있으면 cholesterolMg에 숫자(0 포함)를 넣고, 없으면 null이에요.',
    '- 나트륨·콜레스테롤은 mg 숫자, 탄수화물·당류·단백질·지방·포화지방·트랜스지방·식이섬유는 g 숫자예요.',
    '- servingSizeText는 가능한 그대로 보존해요.',
    '- basisIsPerServing은 1회 제공량 기준이면 true, 100g/100ml 기준이면 false예요.',
    '- 낱개 수나 포장 개수를 임의로 추정하지 않아요.'
  );
}

function getFoodCategoryBlock(): string {
  return joinLines(
    '[foodCategory]',
    '- 아래 중 정확히 하나만 출력해요.',
    '- "음료"',
    '- "달콤한 간식"',
    '- "짭짤한 간식"',
    '- "간편한 한 끼"',
    '- "빵·시리얼류"',
    '- "유제품·디저트"',
    '- 과자, 젤리, 초콜릿, 스낵 등 소량 간식은 "달콤한 간식" 또는 "짭짤한 간식"이에요.',
    '- 우유, 요거트, 푸딩, 아이스크림은 "유제품·디저트"예요.',
    '- 컵라면, 즉석도시락, 햄버거, 샌드위치 등 끼니 대체형은 "간편한 한 끼"예요.',
    '- 식빵, 시리얼, 베이글은 "빵·시리얼류"예요.',
    '- 마시는 것만 "음료"예요.',
    '- 애매하면 실제 섭취 형태를 기준으로 하나만 골라요.'
  );
}

function getOcrCorrectionBlock(): string {
  return joinLines(
    '[OCR 보정]',
    '- productName, rawMaterials, concernIngredients.name에서 OCR 깨짐이 있으면 의미가 바뀌지 않는 범위에서만 자연스럽게 고쳐요.',
    '- 없는 원재료를 새로 추정하지 않아요.',
    '- 뜻이 달라지는 보정은 하지 않아요.'
  );
}

function getIntegratedRatioEstimationCore(mode: PromptMode = 'standard'): string {
  if (mode === 'fast') {
    return joinLines(
      '[주의 원재료 + 추정 범위]',
      '- concernIngredients만 사용하고 별도의 전체 미량 성분 목록은 만들지 않아요.',
      '- concernIngredients는 최대 3개예요.',
      '- minPercent, maxPercent는 알 수 있을 때만 넣고 모르면 null이에요.',
      '- analysisConfidence는 high, medium, low 중 하나예요.',
      '- estimatedIngredients는 항상 []예요.',
      '- labelExplicitPercentages는 라벨에 직접 적힌 %만 넣고 없으면 []예요.'
    );
  }

  return joinLines(
    '[주의 원재료 + 추정 범위]',
    '- concernIngredients만 사용하고 별도의 전체 미량 성분 목록은 만들지 않아요.',
    '- concernIngredients는 최대 3개예요.',
    '- 분류 기준에 직접 쓰인 핵심 성분, 분해 성분, 핵심 첨가물, 주의할 만한 첨가물을 우선 후보로 봐요.',
    '- 일반적인 기저 원료는 보통 제외하지만, 제품 특성을 좌우하는 성분이면 포함할 수 있어요.',
    '- 각 항목에 minPercent, maxPercent를 넣어요. 모르면 null이에요.',
    '- 라벨에 명시된 %가 있으면 그에 맞추고, 없으면 보수적으로 잡아요.',
    '- 항목별 독립 추정이며 합이 100%일 필요는 없어요.',
    '- analysisConfidence는 high, medium, low 중 하나를 선택해요.',
    '- high: 원재료·영양표가 또렷하고 명시 함량 또는 좁은 범위 추정이 가능할 때예요.',
    '- medium: 명시 % 없이 순서와 일반 상식으로만 범위를 잡을 때예요.',
    '- low: 원재료가 흐릿·누락·불완전하거나 범위가 넓고 애매할 때예요.',
    '- estimatedIngredients는 항상 []예요.',
    '- labelExplicitPercentages는 라벨에 직접 적힌 원재료 함량 %만 넣고, 없으면 []예요.'
  );
}

function getFoodPoliceCorePrompt(
  profile?: PersonalizationInput | null,
  mode: PromptMode = 'standard'
): string {
  return joinBlocks(
    getCoreIdentityBlock(),
    getCorePrinciplesBlock(mode),
    getFoodPoliceFinalCriteriaBlock(mode),
    getOutputRulesBlock(mode),
    getConsumptionAdviceBlock(mode),
    getPersonalizationCompactBlock(profile),
    getTossToneBlock(),
    getNutritionRulesCore(mode),
    getIntegratedRatioEstimationCore(mode)
  );
}

function getSingleProductSchemaObject(includeDailyQuest?: boolean) {
  const base = {
    productName: '',
    companyName: '',
    rawMaterials: '',
    novaGroup: null,
    novaSubgroup: '',
    judgmentReason: '',
    concernIngredients: [
      {
        name: '',
        explanation: '',
        minPercent: null,
        maxPercent: null,
      },
    ],
    estimatedIngredients: [],
    analysisConfidence: 'medium',
    labelExplicitPercentages: [],
    briefDescription: '',
    koreanReclassificationNote: '',
    consumptionAdvice: '',
    foodCategory: '',
    nutrition: {
      caloriesKcal: null,
      sodiumMg: null,
      carbsG: null,
      sugarG: null,
      proteinG: null,
      fatG: null,
      saturatedFatG: null,
      transFatG: null,
      cholesterolMg: null,
      dietaryFiberG: null,
      servingSizeText: '',
      basisIsPerServing: null,
      tableRows: [
        {
          name: '',
          amount: '',
        },
      ],
    },
  };
  if (includeDailyQuest) {
    return { ...base, dailyQuestProductMatch: false };
  }
  return base;
}

export function getSingleProductJsonSchemaExample(): string {
  return JSON.stringify(getSingleProductSchemaObject());
}

export function getTossUserFacingToneBlock(): string {
  return getTossToneBlock();
}

export function getPersonalizationBlock(profile?: PersonalizationInput | null): string {
  return getPersonalizationCompactBlock(profile);
}

export function getFoodPoliceHolisticEvaluationIntro(
  profile?: PersonalizationInput | null,
  mode: PromptMode = 'standard'
): string {
  return getFoodPoliceCorePrompt(profile, mode);
}

export function getNutritionTableRowsRulesBlock(): string {
  return joinLines(
    '- tableRows는 표 본문 줄을 위에서 아래 순서대로 한 줄도 빠짐없이 배열해요.',
    '- name은 라벨 표기 그대로, amount는 숫자·단위·%를 보이는 그대로 넣어요.',
    '- 성분 표 본문 줄은 생략·통합·대체하지 않아요.',
    '- JSON 숫자 필드와 겹쳐도 tableRows에는 표 시각 그대로 넣어요.',
    '- 표가 없거나 판독 불가면 nutrition은 null이에요.'
  );
}

export function getNutritionServingUnitRulesBlock(): string {
  return joinLines(
    '[섭취·포장 단위]',
    '- 포장 단위와 섭취 단위는 다를 수 있어요.',
    '- 낱개 수나 1회 제공량이 불명확하면 포장 개수로 추정하지 말고 총 내용량 또는 중량 기준으로 판단해요.',
    '- 통, 봉지, 박스, 병, 캔은 판매 단위일 수 있어요. 1통=1회 섭취로 가정하지 않아요.',
    '- servingSizeText에는 1회 제공량, 개당 중량, 총 내용량(g/ml) 등 표기를 가능한 그대로 넣어요.',
    '- basisIsPerServing은 표 숫자가 1회 제공량 기준인지 100g/100ml 기준인지 정확히 구분해요.',
    '- consumptionAdvice에서는 하루 몇 통, 몇 봉지, 주 몇 회 같은 숫자 규칙을 쓰지 않아요.'
  );
}

export function getIntegratedRatioEstimationEngineBlock(mode: PromptMode = 'standard'): string {
  return joinLines(
    '[통합 엔진]',
    '- concernIngredients만 사용하고 별도의 전체 미량 성분 목록은 만들지 않아요.',
    '- estimatedIngredients는 항상 []예요.',
    mode === 'fast'
      ? '- analysisConfidence, labelExplicitPercentages, concernIngredients.minPercent/maxPercent는 공통 규칙을 따라요.'
      : '- analysisConfidence, labelExplicitPercentages, concernIngredients.minPercent/maxPercent는 위 공통 규칙을 따라요.'
  );
}

export function getKoreanNovaCriteria(
  profile?: PersonalizationInput | null,
  mode: PromptMode = 'standard'
): string {
  return getFoodPoliceCorePrompt(profile, mode);
}

export function getTwoImagePackagePrompt(
  profile?: PersonalizationInput | null,
  mode: PromptMode = 'standard',
  dailyQuestTarget?: string | null,
): string {
  const q = typeof dailyQuestTarget === 'string' ? dailyQuestTarget.trim() : '';
  const questBlocks =
    q.length > 0
      ? joinBlocks(
          getDailyQuestProductMatchBlock(q),
          joinLines('[JSON 오늘 퀘스트]', '최상위에 dailyQuestProductMatch: true 또는 false를 반드시 넣어요.'),
        )
      : '';

  return joinBlocks(
    getFoodPoliceCorePrompt(profile, mode),
    joinLines(
      '[입력 이미지 순서]',
      '1) 원재료/제품 표시',
      '2) 영양정보 표'
    ),
    joinLines(
      '[할 일]',
      '- 1번 이미지에서 productName, companyName, rawMaterials를 추출해요.',
      '- rawMaterials를 기준으로 사전 계산을 하고, 판정 순서대로 novaGroup을 판단해요.',
      '- novaGroup이 4이면 4C → 4B → 4A 순서로 novaSubgroup을 판단해요.',
      '- 2번 이미지에서 nutrition을 추출해요. 없거나 판독 불가면 null이에요.',
      '- productName이 완전히 정확하지 않으면 ""로 둬요.',
      '- companyName이 정확히 보이지 않으면 ""로 둬요.',
      '- rawMaterials가 없으면 ""로 둬요.',
      '- koreanReclassificationNote는 기본적으로 ""예요.',
      '- JSON 하나만 출력해요.'
    ),
    questBlocks,
    getFoodCategoryBlock(),
    getOcrCorrectionBlock(),
    joinLines(
      '[JSON 출력]',
      JSON.stringify(getSingleProductSchemaObject(q.length > 0)),
    ),
  );
}

export function getPackageImagePrompt(
  profile?: PersonalizationInput | null,
  mode: PromptMode = 'standard',
  dailyQuestTarget?: string | null,
): string {
  const q = typeof dailyQuestTarget === 'string' ? dailyQuestTarget.trim() : '';
  const questBlocks =
    q.length > 0
      ? joinBlocks(
          getDailyQuestProductMatchBlock(q),
          joinLines('[JSON 오늘 퀘스트]', '최상위에 dailyQuestProductMatch: true 또는 false를 반드시 넣어요.'),
        )
      : '';

  return joinBlocks(
    getFoodPoliceCorePrompt(profile, mode),
    joinLines(
      '[할 일]',
      '- 이미지는 식품 포장, 원재료명, 영양정보 표, 앞면 중 일부 또는 전체일 수 있어요.',
      '- 텍스트를 읽고 productName, companyName, rawMaterials, nutrition, foodCategory를 판단해요.',
      '- rawMaterials를 기준으로 사전 계산을 하고, 판정 순서대로 novaGroup을 판단해요.',
      '- novaGroup이 4이면 4C → 4B → 4A 순서로 novaSubgroup을 판단해요.',
      '- productName이 완전히 정확하지 않으면 ""로 둬요.',
      '- companyName이 정확히 보이지 않으면 ""로 둬요.',
      '- rawMaterials가 없으면 ""로 둬요.',
      '- koreanReclassificationNote는 기본적으로 ""예요.',
      '- 중간 과정은 출력하지 말고 JSON 하나만 출력해요.'
    ),
    questBlocks,
    getFoodCategoryBlock(),
    getOcrCorrectionBlock(),
    joinLines(
      '[JSON 출력]',
      JSON.stringify(getSingleProductSchemaObject(q.length > 0)),
    ),
  );
}

export function getDailyQuestProductMatchBlockForCompare(targetLabel: string): string {
  return joinLines(
    '[오늘 퀘스트 음식 일치]',
    `- 오늘 퀘스트 음식은 「${targetLabel}」예요.`,
    '- 제품 A 또는 제품 B 중 어느 한쪽이라도 위 퀘스트 음식이면 dailyQuestProductMatch: true예요.',
    '- 둘 다 아니면 false예요.',
    '- 애매하면 false예요.',
    '- 1번, 3번 이미지의 제품명과 포장 정보를 기준으로 판단해요.'
  );
}

export function getCompareFourImagesPrompt(
  profile?: PersonalizationInput | null,
  dailyQuestTarget?: string | null,
  mode: PromptMode = 'standard'
): string {
  const questBlock =
    dailyQuestTarget && String(dailyQuestTarget).trim().length > 0
      ? getDailyQuestProductMatchBlockForCompare(String(dailyQuestTarget).trim())
      : '';

  return joinBlocks(
    getFoodPoliceCorePrompt(profile, mode),
    joinLines(
      '[상품 두 개 비교]',
      '- 아래 이미지 네 장은 순서대로 다음과 같아요.',
      '1) 제품 A 원재료·제품 표시 또는 앞면',
      '2) 제품 A 영양정보 표',
      '3) 제품 B 원재료·제품 표시 또는 앞면',
      '4) 제품 B 영양정보 표'
    ),
    joinLines(
      '[제품별 추출]',
      '- 최상위 키 이름은 반드시 "productA", "productB"만 사용해요.',
      '- productA와 productB는 단일 제품 분석과 같은 필드 구조를 따라요.',
      '- 각 제품의 rawMaterials를 기준으로 사전 계산을 하고, 판정 순서대로 novaGroup을 판단해요.',
      '- novaGroup이 4이면 4C → 4B → 4A 순서로 novaSubgroup을 판단해요.',
      '- nutrition 표가 보이면 숫자 필드와 tableRows를 채우고, 없으면 null로 둬요.',
      '- OCR 보정은 의미 유지 범위에서만 해요.'
    ),
    joinLines(
      '[비교 결론]',
      '- betterChoice는 "A" | "B" | "similar" 중 하나예요.',
      '- 기본적으로 novaGroup이 더 낮은 쪽을 더 나은 선택으로 골라요.',
      '- 둘 다 Group 4면 4A → 4B → 4C 순으로 더 덜 강한 가공을 선호해요.',
      '- novaGroup과 novaSubgroup이 같으면 당류, 나트륨, 포화지방이 더 유리한 쪽을 우선해요.',
      '- comparisonSummary는 3~5문장으로 써요.',
      '- comparisonSummary와 recommendationLine도 위 [말투 · 앱인토스 UX 라이팅]을 따라요.',
      '- recommendationLine은 한 줄 요약이에요.',
      '- 카테고리가 완전히 달라 직접 비교가 어렵거나 정보가 부족하면 "similar"를 써도 돼요.',
      '- JSON 하나만 출력해요.'
    ),
    questBlock,
    getFoodCategoryBlock(),
    getOcrCorrectionBlock(),
    joinLines(
      '[JSON 출력]',
      JSON.stringify({
        productA: getSingleProductSchemaObject(),
        productB: getSingleProductSchemaObject(),
        betterChoice: '',
        comparisonSummary: '',
        recommendationLine: '',
        ...(questBlock ? { dailyQuestProductMatch: false } : {}),
      })
    )
  );
}

export function getDailyQuestProductMatchBlock(targetLabel: string): string {
  return joinLines(
    '[오늘 퀘스트 음식 일치]',
    `- 오늘 퀘스트 음식은 「${targetLabel}」예요.`,
    '- 이미지에 보이는 제품이 위 퀘스트 음식이면 dailyQuestProductMatch: true예요.',
    '- 아니면 false예요.',
    '- 애매하면 false예요.',
    '- 추측은 최소화하고 라벨과 포장 형태로 판단해요.'
  );
}

function extractBalancedJsonPayload(s: string): string | null {
  const starts = ['{', '['];

  for (const token of starts) {
    const start = s.indexOf(token);
    if (start < 0) continue;

    let depthCurly = 0;
    let depthBracket = 0;
    let inStr = false;
    let esc = false;

    for (let i = start; i < s.length; i++) {
      const c = s[i];

      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }

      if (c === '"') {
        inStr = true;
        continue;
      }

      if (c === '{') depthCurly++;
      if (c === '}') depthCurly--;
      if (c === '[') depthBracket++;
      if (c === ']') depthBracket--;

      if (depthCurly === 0 && depthBracket === 0 && i > start) {
        const candidate = s.slice(start, i + 1).trim();
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
        }
      }
    }
  }

  return null;
}

export function normalizeGeminiJson(response: string): string {
  if (typeof response !== 'string') return '';

  const cleaned = response
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!cleaned) return cleaned;

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const extracted = extractBalancedJsonPayload(cleaned);
    return extracted ?? cleaned;
  }
}

export function getDailyOxQuizPrompt(questionType: 1 | 2 | 3): string {
  const typeBlock =
    questionType === 1
      ? '- 유형 1: 가상의 원재료 나열을 주고, 이 식품이 어느 그룹에 가까운지 판단하게 하는 OX 진술을 만들어요.\n'
      : questionType === 2
        ? '- 유형 2: 제시한 성분이 분해 성분인지 첨가물인지 구분하게 하는 OX 진술을 만들어요.\n'
        : '- 유형 3: FoodPolice 최종 분류 기준의 정의와 판정 순서를 묻는 OX 진술을 만들어요.\n';

  return joinBlocks(
    joinLines(
      '당신은 식품 라벨과 FoodPolice 분류 기준을 학습하는 OX 퀴즈를 한 문항 만드는 교육 도우미예요.'
    ),
    joinLines(
      '[퀴즈 목적]',
      '- 원재료 이해 능력 향상',
      '- 분해 성분과 첨가물 구분 능력 강화',
      '- FoodPolice 최종 분류 기준 학습'
    ),
    joinLines(
      '[중요]',
      '- 특정 실제 제품명이나 브랜드명은 쓰지 않아요.',
      '- 한국어로, 중학생도 이해할 수 있게 쉬운 말로 써요.',
      '- 짧은 -해요체로 써요. 능동형을 우선하고, \'되어요\' 대신 \'돼요\'로 통일해요.',
      `[이번 유형 번호: ${questionType}]`,
      typeBlock.trim()
    ),
    joinLines(
      '[출제 규칙]',
      '- 문제는 반드시 O 또는 X 하나로만 답할 수 있는 짧은 진술이에요.',
      '- 진술이 참이면 correctAnswer는 "O"예요.',
      '- 진술이 거짓이면 correctAnswer는 "X"예요.',
      '- explanation은 정답 이유를 한 줄로 쉬운 말로 설명해요.',
      '- FoodPolice 최종 기준과 어긋나지 않게 출제해요.',
      '- 과장, 공포, 의료 조언은 금지해요.'
    ),
    joinLines(
      '[JSON 출력]',
      JSON.stringify({
        questionType,
        question: '진술 문자열',
        correctAnswer: 'O',
        explanation: '한 줄 설명',
        foodKeyword: '',
      })
    )
  );
}