import { ANALYSIS_GEMINI_MODEL } from '@/lib/gemini-models';

export const GEMINI_MODEL = ANALYSIS_GEMINI_MODEL;

export type BmiTier = 'underweight' | 'normal' | 'overweight' | 'obese';

export type PersonalizationInput = {
  bmiValue: number | null;
  bmiTier: BmiTier | null;
};

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

function getPersonalizationFocus(tier: BmiTier): {
  adviceTone: 'general' | 'careful';
  riskPriority: string;
  evaluationBias: string;
  leniencyRule: string;
  adviceStyle: string;
  summaryStyle: string;
  personalSummary: string;
} {
  switch (tier) {
    case 'underweight':
      return {
        adviceTone: 'general',
        riskPriority: '핵심 포인트(당류·나트륨·포화지방·초가공성)는 동일하게 본다.',
        evaluationBias: '판단 기준은 바꾸지 않고, 경고 강도만 일반 톤으로 유지한다.',
        leniencyRule: '과도한 경고를 피하고 확인 중심으로 짧게 쓴다.',
        adviceStyle: '일반 강도 톤으로 간결하게 쓴다.',
        summaryStyle: '동일한 핵심 요소를 차분하게 요약한다.',
        personalSummary: '내용은 같고 강도만 낮춘다.',
      };
    case 'normal':
      return {
        adviceTone: 'general',
        riskPriority: '핵심 포인트(당류·나트륨·포화지방·초가공성)는 동일하게 본다.',
        evaluationBias: '판단 기준은 바꾸지 않고, 경고 강도만 일반 톤으로 유지한다.',
        leniencyRule: '과도한 경고를 피하고 확인 중심으로 짧게 쓴다.',
        adviceStyle: '일반 강도 톤으로 간결하게 쓴다.',
        summaryStyle: '동일한 핵심 요소를 차분하게 요약한다.',
        personalSummary: '내용은 같고 강도만 낮춘다.',
      };
    case 'overweight':
    case 'obese':
      return {
        adviceTone: 'careful',
        riskPriority: '핵심 포인트(당류·나트륨·포화지방·초가공성)는 동일하게 본다.',
        evaluationBias: '판단 기준은 바꾸지 않고, 경고 강도만 주의 톤으로 올린다.',
        leniencyRule: '완화 표현을 줄이고 주의 톤을 분명하게 쓴다.',
        adviceStyle: '주의 강도 톤으로 간결하게 쓴다.',
        summaryStyle: '동일한 핵심 요소를 더 신중한 톤으로 요약한다.',
        personalSummary: '내용은 같고 강도만 높인다.',
      };
  }
}

function getConsumptionAdviceUniversalBlock(): string {
  return (
    '[consumptionAdvice]\n' +
    '- 정확히 2문장.\n' +
    '- 1문장: 라벨에서 드러나는 특징을 사실대로 짚는다(당류·나트륨·포화지방·초가공 등 최소 1개).\n' +
    '- 2문장: 1문장과 연결되는 생활 속 섭취 팁을 부드러운 권유체로 쓴다.\n' +
    '- Group IV면 2문장 안에서 초가공 또는 가공 정도를 최소 한 번 짚는다.\n' +
    '- 일반 영양 상식 수준으로만 쓴다.\n' +
    '- 브랜드·제품명 지어내기 금지.\n' +
    '- 질병 진단·치료·약 복용 지시·공포 조장 금지.\n' +
    '- 하루 n번, 주 n회, n개 같은 숫자 섭취 규칙 금지.\n'
  );
}

function getTossToneBlock(): string {
  return (
    '[말투]\n' +
    '- 사용자에게 보이는 한국어는 짧고 읽기 쉬운 존댓말(-요체)로 쓴다.\n' +
    '- 적용 필드: briefDescription, judgmentReason, concernIngredients.explanation, consumptionAdvice, koreanReclassificationNote, comparisonSummary, recommendationLine.\n' +
    '- 보고서체·명령조·과장·공포 표현은 피한다.\n'
  );
}

function getPersonalizationCompactBlock(profile?: PersonalizationInput | null): string {
  if (!profile || profile.bmiValue == null || !profile.bmiTier) return '';
  const bmiText = formatBmiValue(profile.bmiValue);
  const bmiTierLabel = getBmiTierLabel(profile.bmiTier);
  const focus = getPersonalizationFocus(profile.bmiTier);

  return (
    '[BMI 반영]\n' +
    `- BMI: ${bmiText}, 체형: ${bmiTierLabel}, 톤: ${focus.adviceTone}\n` +
    `- ${focus.riskPriority}\n` +
    `- ${focus.evaluationBias}\n` +
    `- ${focus.leniencyRule}\n` +
    '- novaGroup, novaSubgroup는 BMI로 바꾸지 않는다.\n' +
    '- briefDescription, concernIngredients.explanation, consumptionAdvice는 BMI에 따라 강도만 조절한다.\n' +
    '- 과체중·비만이면 같은 내용을 더 주의 톤으로, 정상·저체중이면 덜 겁주는 톤으로 쓴다.\n'
  );
}

function getNutritionRulesCore(): string {
  return (
    '[영양표 규칙]\n' +
    '- nutrition 표가 보이면 숫자 필드와 tableRows를 채운다. 없거나 판독 불가면 null.\n' +
    '- tableRows는 표 본문 줄을 위에서 아래 순서대로 한 줄도 빠짐없이 넣는다.\n' +
    '- name은 표기 그대로, amount도 숫자·단위·%를 보이는 그대로 넣는다.\n' +
    '- 표 제목, 1회 제공량 안내 등 영양항목이 아닌 줄은 제외 가능하다.\n' +
    '- 0kcal, 제로칼로리, 열량 0이면 caloriesKcal는 숫자 0이다.\n' +
    '- 콜레스테롤 행이 있으면 cholesterolMg에 숫자(0 포함)를 넣고, 없으면 null이다.\n' +
    '- 나트륨·콜레스테롤은 mg 숫자, 탄수화물·당류·단백질·지방·포화지방·트랜스지방·식이섬유는 g 숫자다.\n' +
    '- servingSizeText는 가능한 그대로 보존한다.\n' +
    '- basisIsPerServing은 1회 제공량 기준이면 true, 100g/100ml 기준이면 false다.\n' +
    '- 낱개 수나 포장 개수를 임의 추정하지 않는다.\n' +
    '- 캔디·껌·목캔디·정제형·작은 알갱이 간식은 특히 포장 개수 추정을 금지한다.\n'
  );
}

function getFoodCategoryBlock(): string {
  return (
    '[foodCategory]\n' +
    '- 아래 중 정확히 하나만 출력한다.\n' +
    '- "음료"\n' +
    '- "달콤한 간식"\n' +
    '- "짭짤한 간식"\n' +
    '- "간편한 한 끼"\n' +
    '- "빵·시리얼류"\n' +
    '- "유제품·디저트"\n' +
    '- 과자, 젤리, 초콜릿, 스낵 등 소량 간식은 "달콤한 간식" 또는 "짭짤한 간식"이다.\n' +
    '- 우유, 요거트, 푸딩, 아이스크림은 "유제품·디저트"다.\n' +
    '- 컵라면, 즉석도시락, 햄버거, 샌드위치 등 끼니 대체형은 "간편한 한 끼"다.\n' +
    '- 식빵, 시리얼, 베이글은 "빵·시리얼류"다.\n' +
    '- 마시는 것만 "음료"다.\n'
  );
}

function getOcrCorrectionBlock(): string {
  return (
    '[OCR 보정]\n' +
    '- productName, rawMaterials, concernIngredients.name에서 OCR로 보이는 철자 깨짐이 있으면 의미가 바뀌지 않는 범위에서만 표준 표기로 정정한다.\n' +
    '- 없는 원재료를 새로 추정하거나 의미가 달라지는 변경은 금지한다.\n' +
    '- 라벨 원문에서 식품군을 식별하는 핵심 키워드가 함께 보일 때 그 키워드의 철자만 정정하는 방식으로 보정한다.\n'
  );
}

function getIntegratedRatioEstimationCore(): string {
  return (
    '[주의 원재료 + 추정 범위]\n' +
    '- concernIngredients만 사용하고 별도의 전체 미량 성분 목록은 만들지 않는다.\n' +
    '- concernIngredients는 최대 3개다.\n' +
    '- 당류 공급원, 정제·분리 성분, 문제 소지가 있는 첨가물·감미료·향료·보존료·유화제 등만 후보로 본다.\n' +
    '- 주원료·대량 기저(밀가루·우유·설탕·물엿 등)는 concernIngredients 후보에서 제외한다.\n' +
    '- 각 항목에 minPercent, maxPercent를 넣는다. 모르면 null.\n' +
    '- 라벨에 명시된 %가 있으면 그에 맞추고, 없으면 일반적인 미량 범위로 보수적으로 잡는다.\n' +
    '- 항목별 독립 추정이며 합이 100%일 필요는 없다.\n' +
    '- 미량 비율 추정은 NOVA 직접 결정 근거로 사용하지 않는다.\n' +
    '- analysisConfidence는 high, medium, low 중 하나를 선택한다.\n' +
    '- high: 원재료·영양표가 또렷하고 명시 함량 또는 좁은 범위 추정이 가능할 때.\n' +
    '- medium: 명시 % 없이 순서와 일반 상식으로만 미량 범위를 잡을 때.\n' +
    '- low: 원재료가 흐릿·누락·불완전하거나 범위가 넓고 애매할 때.\n' +
    '- estimatedIngredients는 항상 []이다.\n' +
    '- 첨가물·감미료를 항목별로 길게 나열하지 않는다.\n' +
    '- labelExplicitPercentages는 라벨에 직접 적힌 원재료 함량 %만 넣고, 없으면 []이다.\n'
  );
}

function getFoodPoliceCorePrompt(profile?: PersonalizationInput | null): string {
  return (
    '당신은 식품 분석 앱 FoodPolice를 돕는 AI예요.\n' +
    '열량만 보지 않고 영양성분, 원재료, 가공 정도를 함께 살펴봐요.\n' +
    '열량만으로 좋다/나쁘다를 가르지 않아요.\n\n' +

    '[핵심 원칙]\n' +
    '- 한국형 NOVA 기준으로 분류한다.\n' +
    '- 첨가물 개수만으로 Group IV로 분류하지 않는다.\n' +
    '- 성분 개수만으로 Group IV를 판정하지 않는다.\n' +
    '- 식품의 가공 방식과 원재료 구조 유지 여부를 우선 판단한다.\n' +
    '- 사용자 맞춤 정보는 novaGroup, novaSubgroup 판단에 사용하지 않는다.\n' +
    '- 사용자 맞춤 정보는 briefDescription, concernIngredients.explanation, consumptionAdvice의 초점 조정에만 사용한다.\n' +
    '- 섭취 허용 횟수, 감량 효과, 건강 개선 효과를 임의 계산하지 않는다.\n' +
    '- 숫자, 횟수, 기간을 넣은 섭취 규칙은 만들지 않는다.\n\n' +

    '[한국형 NOVA 분류 순서]\n' +
    '1) 원재료 그대로인가? → YES → Group I\n' +
    '2) 원재료에서 특정 성분만 추출한 조리 재료인가? → YES → Group II\n' +
    '3) Group I + Group II 재료의 단순 조합이고, 원재료 특성이 유지되는가? → YES → Group III\n' +
    '4) 원재료 구조가 사라지고 산업적으로 재구성된 식품인가? → YES → Group IV\n\n' +

    '[한국 식품 예외]\n' +
    '- 다음은 기본적으로 Group III로 분류한다: 김, 김자반, 된장, 간장, 고추장, 젓갈, 절임식품, 반찬류.\n' +
    '- 전통 가공 식품이므로 초가공으로 분류하지 않는다.\n\n' +

    '[Group IV 세분화]\n' +
    '- novaGroup이 4일 때만 novaSubgroup은 4A, 4B, 4C 중 정확히 하나만 출력한다.\n' +
    '- 4A: 재료 기반 음식 형태가 남아 있는 경계형 초가공\n' +
    '- 4B: 특정 기능(제로·고단백 등) 중심으로 재구성된 초가공\n' +
    '- 4C: 복합 첨가·자극적 구조가 강한 고도 초가공\n' +
    '- 애매하면 4A로 분류한다.\n' +
    '- 4A 우선: 설탕, 밀가루, 견과, 우유, 코코아 등 일반 식품 재료가 중심이고 음식 형태가 남아 있으며 첨가가 소수의 품질 보조 수준이면 4A다.\n' +
    '- 4B는 아래 4조건을 모두 만족할 때만 허용한다.\n' +
    '  (1) 원재료의 형태·정체성이 완전히 사라짐\n' +
    '  (2) 특정 기능(단맛·저칼로리·단백 강화 등)을 위해 성분이 재구성됨\n' +
    '  (3) 일반적인 음식 재료 조합만으로는 설명되지 않음\n' +
    '  (4) 감미료·분리단백·대체당 등 기능성 성분이 핵심 구성임\n' +
    '- 하나라도 부족하면 4B 금지. 4A 또는 4C로 다시 판단한다.\n' +
    '- 4C는 4A·4B로 보기 어렵고 첨가물이 복잡하며 자극적 맛·과식 유도 구조가 라벨상 뚜렷할 때 쓴다.\n' +
    '- judgmentReason은 한 문장으로 쓴다.\n' +
    '- Group IV일 때 judgmentReason은 원재료 구조 유지·소실과 기능성 재구성 여부를 중심으로 쓴다.\n\n' +

    '[출력 원칙]\n' +
    '- briefDescription: 한 문장, 45자 이내.\n' +
    '- briefDescription은 열량만으로 요약하지 않는다.\n' +
    '- briefDescription은 영양성분, 원재료 특성, 가공 정도 중 최소 2가지를 반영한다.\n' +
    '- concernIngredients: 원재료명 또는 첨가물명만 최대 3개.\n' +
    '- concernIngredients.name에는 라벨에 실제로 보이는 명칭만 넣는다.\n' +
    '- concernIngredients.name에 나트륨, 당류, 탄수화물, 지방, 포화지방, 열량 같은 영양성분표 항목명은 넣지 않는다.\n' +
    '- concernIngredients.explanation은 짧은 한 문장, 쉬운 한국어로 쓴다.\n' +
    '- consumptionAdvice는 정확히 2문장이다.\n' +
    '- 의료적 진단, 치료, 단정 표현은 금지한다.\n\n' +

    getConsumptionAdviceUniversalBlock() +
    getPersonalizationCompactBlock(profile) +
    getTossToneBlock() +
    getNutritionRulesCore() +
    getIntegratedRatioEstimationCore()
  );
}

export function getSingleProductJsonSchemaExample(): string {
  return (
    '{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":"","minPercent":null,"maxPercent":null}],"estimatedIngredients":[],"analysisConfidence":"medium","labelExplicitPercentages":[],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null}'
  );
}

export function getTossUserFacingToneBlock(): string {
  return getTossToneBlock();
}

export function getPersonalizationBlock(profile?: PersonalizationInput | null): string {
  return getPersonalizationCompactBlock(profile);
}

export function getFoodPoliceHolisticEvaluationIntro(profile?: PersonalizationInput | null): string {
  return getFoodPoliceCorePrompt(profile);
}

export function getNutritionTableRowsRulesBlock(): string {
  return (
    '- tableRows는 표 본문 줄을 위→아래 그대로 한 줄도 빠짐없이 배열한다.\n' +
    '- name은 라벨 표기 그대로, amount는 숫자·단위·%를 보이는 그대로 넣는다.\n' +
    '- 성분 표 본문 줄은 생략·통합·대체 금지다.\n' +
    '- JSON 숫자 필드와 겹쳐도 tableRows에는 표 시각 그대로 반드시 넣는다.\n' +
    '- 표가 없거나 판독 불가면 nutrition은 null이다.\n'
  );
}

export function getNutritionServingUnitRulesBlock(): string {
  return (
    '[섭취·포장 단위]\n' +
    '- 포장 단위와 섭취 단위는 다를 수 있다.\n' +
    '- 낱개 수나 1회 제공량이 불명확하면 포장 개수로 추정하지 말고 총 내용량 또는 중량 기준으로 판단한다.\n' +
    '- 통·봉지·박스·병·캔은 판매 단위일 수 있다. 1통=1회 섭취로 가정하지 않는다.\n' +
    '- 캔디·껌·목캔디·정제형·작은 알갱이 간식은 특히 포장 개수 추정을 금지한다.\n' +
    '- servingSizeText에는 1회 제공량, 개당 중량, 총 내용량(g/ml) 등 표기를 가능한 그대로 넣는다.\n' +
    '- basisIsPerServing은 표 숫자가 1회 제공량 기준인지 100g/100ml 기준인지 정확히 구분한다.\n' +
    '- consumptionAdvice에서는 하루 몇 통, 몇 봉지, 주 몇 회 같은 숫자 규칙을 쓰지 않는다.\n'
  );
}

export function getIntegratedRatioEstimationEngineBlock(): string {
  return (
    '[통합 엔진]\n' +
    '- concernIngredients만 사용하고 별도의 전체 미량 성분 목록은 만들지 않는다.\n' +
    '- estimatedIngredients는 항상 []이다.\n' +
    '- analysisConfidence, labelExplicitPercentages, concernIngredients.minPercent/maxPercent는 위 공통 규칙을 따른다.\n'
  );
}

export function getKoreanNovaCriteria(profile?: PersonalizationInput | null): string {
  return getFoodPoliceCorePrompt(profile);
}

export function getTwoImagePackagePrompt(profile?: PersonalizationInput | null): string {
  return (
    getFoodPoliceCorePrompt(profile) +
    '\n[입력 이미지 순서]\n' +
    '1) 원재료/제품 표시\n' +
    '2) 영양정보 표\n\n' +

    '[할 일]\n' +
    '- 1번 이미지에서 productName, companyName, rawMaterials를 추출한다.\n' +
    '- rawMaterials를 기준으로 novaGroup을 판단하고, Group IV이면 novaSubgroup도 판단한다.\n' +
    '- 2번 이미지에서 nutrition을 추출한다. 없거나 판독 불가면 null이다.\n' +
    '- productName이 완전히 정확하지 않으면 "".\n' +
    '- companyName이 정확히 보이지 않으면 "".\n' +
    '- rawMaterials가 없으면 "".\n' +
    '- koreanReclassificationNote는 한국 전통 식품 예외 적용 시만 한 줄로 쓰고, 해당 없으면 "".\n' +
    '- JSON 하나만 출력한다.\n\n' +
    getFoodCategoryBlock() +
    '\n' +
    getOcrCorrectionBlock() +
    '\n[JSON 출력]\n' +
    getSingleProductJsonSchemaExample()
  );
}

export function getPackageImagePrompt(profile?: PersonalizationInput | null): string {
  return (
    getFoodPoliceCorePrompt(profile) +
    '\n[할 일]\n' +
    '- 이미지는 식품 포장(원재료명, 영양정보 표, 앞면 등)일 수 있다.\n' +
    '- 텍스트를 읽고 productName, companyName, rawMaterials, nutrition, foodCategory를 판단한다.\n' +
    '- novaGroup과 Group IV일 경우 novaSubgroup을 판단한다.\n' +
    '- productName이 완전히 정확하지 않으면 "".\n' +
    '- companyName이 정확히 보이지 않으면 "".\n' +
    '- rawMaterials가 없으면 "".\n' +
    '- koreanReclassificationNote는 한국 전통 식품 예외 적용 시만 한 줄로 쓰고, 해당 없으면 "".\n' +
    '- 중간 과정은 출력하지 말고 JSON 하나만 출력한다.\n\n' +
    getFoodCategoryBlock() +
    '\n' +
    getOcrCorrectionBlock() +
    '\n[JSON 출력]\n' +
    getSingleProductJsonSchemaExample()
  );
}

export function getDailyQuestProductMatchBlockForCompare(targetLabel: string): string {
  return (
    '[오늘 퀘스트 음식 일치]\n' +
    `- 오늘 퀘스트 음식은 「${targetLabel}」이다.\n` +
    '- 제품 A 또는 제품 B 중 어느 한 쪽이라도 위 퀘스트 음식이면 dailyQuestProductMatch: true, 둘 다 아니면 false다.\n' +
    '- 애매하면 false다.\n' +
    '- 1번·3번 이미지(각 제품의 원재료·앞면)를 기준으로 판단한다.\n'
  );
}

export function getCompareFourImagesPrompt(
  profile?: PersonalizationInput | null,
  dailyQuestTarget?: string | null,
): string {
  const questBlock =
    dailyQuestTarget && String(dailyQuestTarget).trim().length > 0
      ? '\n' + getDailyQuestProductMatchBlockForCompare(String(dailyQuestTarget).trim())
      : '';

  return (
    getFoodPoliceCorePrompt(profile) +
    '\n[상품 두 개 비교]\n' +
    '- 아래 이미지 네 장은 순서대로 다음과 같다.\n' +
    '1) 제품 A 원재료·제품 표시(또는 앞면)\n' +
    '2) 제품 A 영양정보 표\n' +
    '3) 제품 B 원재료·제품 표시(또는 앞면)\n' +
    '4) 제품 B 영양정보 표\n\n' +

    '[제품별 추출]\n' +
    '- productA와 productB는 단일 제품 분석과 동일한 필드·규칙을 따른다.\n' +
    '- 각 제품의 nutrition은 표가 보이면 숫자 필드와 tableRows를 채우고, 없으면 null이다.\n' +
    '- OCR 보정은 의미 유지 범위에서만 허용한다.\n\n' +

    '[비교 결론]\n' +
    '- betterChoice: "A" | "B" | "similar" 중 하나.\n' +
    '- 기본적으로 한국형 NOVA 단계가 더 낮은 쪽을 고른다.\n' +
    '- 같은 novaGroup이면 당류, 나트륨, 포화지방이 더 유리한 쪽을 우선한다.\n' +
    '- 둘 다 Group IV면 4A → 4B → 4C 순으로 덜 강한 가공을 선호한다.\n' +
    '- comparisonSummary: 3~5문장, 쉬운 한국어·토스 말투(-요). 두 제품의 NOVA·영양 차이와 왜 한쪽이 더 나은 선택인지 또는 비슷한지 설명한다.\n' +
    '- recommendationLine: 한 줄 요약.\n' +
    '- 카테고리가 완전히 달라 직접 비교가 어렵거나 정보가 부족하면 "similar"를 사용할 수 있다.\n' +
    '- JSON 하나만 출력한다.\n' +
    questBlock +
    '\n' +
    getFoodCategoryBlock() +
    '\n' +
    getOcrCorrectionBlock() +
    '\n[JSON 출력]\n' +
    '{"productA":' +
    getSingleProductJsonSchemaExample() +
    ',"productB":' +
    getSingleProductJsonSchemaExample() +
    ',"betterChoice":"A","comparisonSummary":"","recommendationLine":""' +
    (questBlock ? ',"dailyQuestProductMatch":false' : '') +
    '}'
  );
}

export function getDailyQuestProductMatchBlock(targetLabel: string): string {
  return (
    '[오늘 퀘스트 음식 일치]\n' +
    `- 오늘 퀘스트 음식은 「${targetLabel}」이다.\n` +
    '- 이미지에 보이는 제품이 위 퀘스트 음식이면 dailyQuestProductMatch: true, 아니면 false다.\n' +
    '- 애매하면 false다.\n' +
    '- 추측은 최소화하고 라벨·포장 형태로 판단한다.\n'
  );
}

function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function normalizeGeminiJson(response: string): string {
  if (typeof response !== 'string') return '';
  let s = response
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (!s) return s;
  try {
    JSON.parse(s);
    return s;
  } catch {
    const ext = extractBalancedJsonObject(s);
    return ext ?? s;
  }
}

/** 일일 OX 퀴즈 1문항 — `/api/quiz`에서 Gemini 호출 시 사용. */
export function getDailyOxQuizPrompt(questionType: 1 | 2 | 3): string {
  const typeBlock =
    questionType === 1
      ? '- 유형 1: 가상의 원재료 나열을 제시하고 한국형 NOVA에서 Group I·II·III·IV 중 어느 쪽에 가까운지 판단하게 하는 단일 진술을 만든다.\n'
      : questionType === 2
        ? '- 유형 2: 제시한 성분이 분해·분리 성분인지 첨가물인지 구분하게 하는 단일 진술을 만든다.\n'
        : '- 유형 3: 한국형 NOVA·초가공·가공 단계의 정의나 기준을 묻는 단일 진술을 만든다.\n';

  return (
    '당신은 식품 라벨·한국형 NOVA 학습용 OX 퀴즈를 1문항 만드는 교육 도우미예요.\n\n' +
    '[퀴즈 목적]\n' +
    '- 원재료 이해 능력 향상\n' +
    '- 초가공식품(NOVA 분류) 판단 능력 향상\n' +
    '- 분해 성분 / 첨가물 구분 능력 강화\n\n' +
    '[중요]\n' +
    '- 특정 식품·브랜드·앱의 오늘 미션 키워드에 맞출 필요가 없다.\n' +
    '- 실제 유통 제품명을 쓰지 않는다.\n' +
    `[이번 유형 번호: ${questionType}]\n` +
    typeBlock +
    '\n[출제 규칙]\n' +
    '- 문제는 반드시 O 또는 X 하나로만 답할 수 있는 한 문장 또는 두 문장 이내의 진술이다.\n' +
    '- 진술이 참이면 correctAnswer는 "O", 거짓이면 "X"다.\n' +
    '- 한국어, 중학생도 이해할 수 있는 난이도, 존댓말·차분한 톤.\n' +
    '- 과장·공포·질병 단정·의학적 조언 금지.\n' +
    '- 한국형 NOVA 기준을 틀리지 않게 출제한다.\n' +
    '- explanation은 정답 이유를 한 줄로 쓴다.\n\n' +
    '[JSON 출력]\n' +
    `{"questionType":${questionType},"question":"진술 문자열","correctAnswer":"O","explanation":"한 줄 설명","foodKeyword":""}`
  );
}
