export const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

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

function getRiskMode(tier: BmiTier | null): 'general' | 'strict' {
  return tier === 'overweight' || tier === 'obese' ? 'strict' : 'general';
}

export function getPersonalizationBlock(profile?: PersonalizationInput | null): string {
  if (!profile || profile.bmiValue == null || !profile.bmiTier) return '';

  const bmiText = formatBmiValue(profile.bmiValue);
  const bmiTierLabel = getBmiTierLabel(profile.bmiTier);
  const riskMode = getRiskMode(profile.bmiTier);
  const rule =
    riskMode === 'strict'
      ? '당류·포화지방·초가공 식품은 더 엄격하게 본다.'
      : '개인화는 참고만 하고 일반 기준으로 평가한다.';

  return (
    '[맞춤 참고]\n' +
    `- BMI: ${bmiText}\n` +
    `- 체형 구간: ${bmiTierLabel}\n` +
    `- 평가 모드: ${riskMode}\n` +
    `- 적용 원칙: ${rule}\n` +
    '- 이 정보는 novaGroup·novaSubgroup을 바꾸지 않는다.\n' +
    '- 이 정보는 briefDescription, concernIngredients.explanation, consumptionAdvice의 엄격도 조정에만 사용한다.\n\n'
  );
}

export function getFoodPoliceHolisticEvaluationIntro(profile?: PersonalizationInput | null): string {
  return (
    '당신은 식품 분석 앱 FoodPolice의 AI입니다.\n' +
    '식품을 열량 하나가 아니라 영양성분, 원재료, 가공 정도를 함께 보고 평가합니다.\n' +
    '열량만으로 좋다/나쁘다를 결정하지 마세요.\n\n' +
    getPersonalizationBlock(profile) +
    '[판단 순서]\n' +
    '1. 영양성분: 당류, 나트륨, 포화지방이 많은지 본다.\n' +
    '2. 원재료: 정제 재료, 인공첨가물, 초가공 특징을 본다.\n' +
    '3. 가공 정도: 한국형 NOVA 기준으로 Group 1~4를 판단한다.\n' +
    '4. 최종 종합: 영양성분과 가공 정도를 우선하고, 열량은 보조로만 반영한다.\n\n' +
    '[출력 원칙]\n' +
    '- briefDescription: 전체 평가를 한 문장으로, 45자 이내.\n' +
    '- briefDescription은 다음 3가지 중 최소 2가지를 반영한다: 영양성분, 원재료 특성, 가공 정도.\n' +
    '- briefDescription은 열량만으로 요약한 문장을 금지한다.\n' +
    '- concernIngredients: 원재료명 또는 첨가물명만 최대 3개. 영양성분명은 금지.\n' +
    '- concernIngredients.name에는 원재료명 또는 첨가물명만 넣는다.\n' +
    '- concernIngredients.name은 원재료 표기에 실제로 보이는 명칭만 사용한다. 일반화·추측 금지.\n' +
    '- concernIngredients.name에 영양성분표 항목명(나트륨, 당류, 탄수화물, 지방, 포화지방, 열량 등)은 절대 넣지 않는다.\n' +
    '- judgmentReason: K-NOVA 판단 근거를 한 문장으로 쓴다.\n' +
    '- consumptionAdvice: 라벨에 보이는 정보만 바탕으로 짧게 쓴다.\n' +
    '- 의료적 진단, 치료, 단정 표현은 금지한다.\n\n'
  );
}

export function getNutritionTableRowsRulesBlock(): string {
  return (
    '- tableRows(영양표가 보일 때 필수): 표에 보이는 줄을 위→아래 그대로 한 줄도 빠짐없이 배열.\n' +
    '- name은 라벨에 적힌 문자·표기 그대로 넣는다. 정해진 항목 목록 없이 어떤 항목명이든 생략·통합·대체 금지.\n' +
    '- amount는 숫자·단위·%를 화면에 보이는 그대로 넣는다.\n' +
    '- 위쪽 표 제목, 1회 제공량 안내 등 영양항목이 아닌 줄은 제외해도 되지만, 성분 표 본문 줄은 전부 넣는다.\n' +
    '- JSON의 caloriesKcal 등과 겹쳐도 tableRows에는 표 시각 그대로 반드시 한 줄씩 넣는다.\n' +
    '- 표가 없거나 판독 불가면 nutrition은 null.\n'
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
    '- consumptionAdvice에서는 내부 개수 확인 없이 하루 몇 통, 몇 봉지, 몇 박스 같은 구체적 허용 개수를 쓰지 않는다.\n' +
    '- 애매하면 중량 또는 1회 제공량 확인을 권하는 보수적 문장만 쓴다.\n'
  );
}

export function getKoreanNovaCriteria(profile?: PersonalizationInput | null): string {
  return (
    getFoodPoliceHolisticEvaluationIntro(profile) +
    '**한국형 NOVA(Korean NOVA)** 분류 기준에 따라 식품을 분석합니다.\n\n' +
    '[핵심 원칙]\n' +
    '- 첨가물 개수만으로 분류하지 않는다.\n' +
    '- 식품의 가공 방식과 원재료 구조 유지 여부로 판단한다.\n' +
    '- 한국 전통 식품(장류, 김치, 젓갈 등) 특성을 반영한다.\n' +
    '- 사용자 맞춤 정보는 novaGroup, novaSubgroup 판단에 사용하지 않는다.\n' +
    '- 사용자 맞춤 정보는 briefDescription, concernIngredients.explanation, consumptionAdvice의 엄격도 조정에만 사용한다.\n\n' +
    '[분류 순서]\n' +
    '1) 원재료 그대로인가? → YES → Group I\n' +
    '2) 원재료에서 특정 성분만 추출한 조리 재료인가? → YES → Group II\n' +
    '3) Group I + Group II 재료의 단순 조합이고, 원재료 특성이 유지되는가? → YES → Group III\n' +
    '4) 원재료 구조가 사라지고 산업적으로 재구성된 식품인가? → YES → Group IV\n\n' +
    '[중요]\n' +
    '- 첨가물이 있다고 무조건 Group IV로 분류하지 않는다.\n' +
    '- 성분 개수만으로 Group IV를 판정하지 않는다.\n' +
    '- 원재료 특성 유지 여부를 우선 판단한다.\n\n' +
    '[한국 식품 예외]\n' +
    '- 다음은 기본적으로 Group III로 분류한다: 김, 김자반, 된장, 간장, 고추장, 젓갈, 절임식품, 반찬류.\n' +
    '- 전통 가공 식품이므로 초가공으로 분류하지 않는다.\n\n' +
    '[Group IV 세분화]\n' +
    '- novaGroup이 4일 때만 novaSubgroup은 4A, 4B, 4C 중 정확히 하나만 출력한다.\n' +
    '- 판단이 애매하면 4B가 아니라 4A로 분류한다.\n' +
    '- judgmentReason은 한 문장으로 쓴다.\n' +
    '- Group IV일 때 judgmentReason은 원재료 구조(유지·소실)와 기능성 재구성 여부만 짚는다.\n\n' +
    '[강제 우선순위]\n' +
    '① 재료 기반 음식인가?\n' +
    '- 설탕, 밀가루, 견과, 우유, 코코아, 버터, 코코아버터 등 일반 식품 재료가 본질이고, 이를 섞어 만든 음식 형태가 유지되는가?\n' +
    '- 첨가가 레시틴, 바닐린 등 소수의 품질·형태 보조 수준이면 YES → 4A\n' +
    '- 여기서 확정되면 4B로 넘어가지 않는다.\n\n' +
    '② ①이 NO일 때만: 기능성 재구성 식품인가?\n' +
    '- 단맛, 저칼로리, 단백질 강화 등 특정 기능을 위해 성분이 의도적으로 재구성되었는가?\n' +
    '- 원재료 형태·정체성이 사실상 사라졌는가?\n' +
    '- 감미료, 분리단백, 대체당 등 기능성 성분이 핵심이고 일반 재료 조합만으로 설명되지 않는가?\n' +
    '- YES면 4B 후보이며, 아래 [4B 필수 4조건]을 모두 만족할 때만 최종 4B.\n\n' +
    '③ ①②에 걸리지 않거나 ②가 애매한데, 첨가물이 복잡하고 자극적 맛·과식 유도 구조가 라벨상 뚜렷한가?\n' +
    '- YES → 4C\n\n' +
    '④ 어느 단계에도 명확히 걸리지 않으면 → 4A\n\n' +
    '[4B 필수 4조건]\n' +
    '- 아래 네 가지를 모두 만족할 때만 4B로 분류한다.\n' +
    '(1) 원재료의 형태·정체성이 완전히 사라짐\n' +
    '(2) 특정 기능(단맛·저칼로리·단백 강화 등)을 위해 성분이 재구성됨\n' +
    '(3) 일반적인 음식 재료 조합만으로는 설명되지 않음\n' +
    '(4) 감미료·분리단백·대체당 등 기능성 성분이 핵심 구성임\n' +
    '- 하나라도 부족하면 4B 금지. 4A 또는 4C로 다시 판단한다.\n\n' +
    '[4A 우선]\n' +
    '- 아래에 해당하면 무조건 4A 우선으로 본다.\n' +
    '- 설탕, 밀가루, 견과, 우유, 코코아 등 일반 식품 재료가 중심이고 음식 형태가 남아 있음\n' +
    '- 첨가가 1~2개 수준이거나 품질 보조에 그침\n\n' +
    '[대표 예시]\n' +
    '- 4A: 초콜릿, 프랄린, 재료 기반 일반 가공식품\n' +
    '- 4B: 자일리톨 캔디, 제로·저칼로리가 본질인 음료\n' +
    '- 4C: 라면, 복합 조미·향·지방 구조가 강한 과자류\n\n' +
    '[균형]\n' +
    '- 4A·4B·4C가 한쪽으로 과도하게 쏠리지 않게 하되, 4B는 기능성 재구성 식품에만 제한한다.\n' +
    '- 애매하면 4A로 분류한다.\n\n' +
    '[주의 원재료 선정]\n' +
    '- 최대 3개만 표시한다.\n' +
    '- 문제가 될 수 있는 원재료명 또는 첨가물명만 선택한다.\n' +
    '- 선정 기준: 인공 감미료, 색소, 향료·MSG, 유화제, 보존료, 가공전분, 고과당옥수수시럽 등.\n' +
    '- 영양성분명(나트륨, 당류, 열량, 탄수화물, 단백질, 지방, 포화지방, 트랜스지방)은 절대 넣지 않는다.\n' +
    '- 없으면 0개 또는 1개만 표시하고 억지로 3개 채우지 않는다.\n' +
    '- explanation은 짧게 한 문장으로 쓴다.\n' +
    '- 쉬운 한국어로 쓴다.\n' +
    '- 과장·공포 표현은 금지한다.\n\n' +
    '[말투 규칙]\n' +
    '- 짧고 분명하게 말한다.\n' +
    '- 쉬운 생활어를 사용한다.\n' +
    '- 딱딱한 보고서체와 의학전문용어 남발을 피한다.\n' +
    '- 과장·단정·공포 표현을 피하고 차분하고 친절한 톤을 유지한다.\n' +
    '- judgmentReason은 Group IV일 때 원재료 구조와 기능성 여부만으로 한 문장 작성한다.\n' +
    '- briefDescription은 종합 한 문장 45자 이내로 작성한다.\n' +
    '- consumptionAdvice와 concernIngredients.explanation도 같은 톤으로 짧게 쓴다.\n'
  );
}

export function getTwoImagePackagePrompt(profile?: PersonalizationInput | null): string {
  return (
    getKoreanNovaCriteria(profile) +
    '\n' +
    '당신에게 할 일: 아래 두 장의 이미지가 순서대로 제공됩니다.\n\n' +
    '[이미지 A: 원재료/제품 표시]\n' +
    '- 원재료 표기 전체, 제품명(productName), 제조사(companyName)를 읽어 추출한다.\n' +
    '- rawMaterials를 기준으로 한국형 NOVA 분류(novaGroup)를 판단한다.\n' +
    '- Group IV이면 novaSubgroup(4A/4B/4C)도 판단한다.\n\n' +
    '[이미지 B: 영양정보 표]\n' +
    getNutritionServingUnitRulesBlock() +
    '\n' +
    getNutritionTableRowsRulesBlock() +
    '- 영양정보 표가 보이면 nutrition에 숫자 필드와 tableRows를 채운다.\n' +
    '- 없거나 판독 불가면 nutrition은 null로 둔다.\n' +
    '- 표에 0kcal, 제로칼로리, 열량 0 등으로 나오면 caloriesKcal는 반드시 숫자 0이다.\n' +
    '- 콜레스테롤 행이 있으면 cholesterolMg에 mg 숫자(0 포함)를 넣는다. 표에 없으면 null.\n' +
    '- consumptionAdvice는 라벨에 보이는 것만 바탕으로 한 문장으로 쓴다.\n' +
    '- 보관, 섭취, 당, 나트륨 중 하나만 짚는다.\n' +
    '- kcal 추측은 금지한다.\n\n' +
    '[JSON 출력]\n' +
    '- productName: 제품명. 완전히 정확한 이름이 명시되지 않았으면 반드시 공란 "".\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 "".\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄. 없으면 "".\n' +
    '- novaGroup: 1~4.\n' +
    '- novaSubgroup: novaGroup이 4일 때만 "4A" | "4B" | "4C". 그 외는 "".\n' +
    '- judgmentReason: 반드시 한 문장.\n' +
    '- concernIngredients: 주의 원재료 최대 3개. 없으면 [].\n' +
    '- briefDescription: 열량만 말하지 말고, 열량·당·나트륨·가공/NOVA를 아우르는 종합 한 문장, 45자 이내.\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 "".\n' +
    '- consumptionAdvice: 라벨 기준 한 문장. 없으면 "".\n' +
    '- foodCategory: 아래 목록 중 정확히 하나.\n' +
    '- nutrition: 객체 또는 null.\n\n' +
    '[foodCategory]\n' +
    '- "음료"\n' +
    '- "달콤한 간식"\n' +
    '- "짭짤한 간식"\n' +
    '- "간편한 한 끼"\n' +
    '- "빵·시리얼류"\n' +
    '- "유제품·디저트"\n\n' +
    '[foodCategory 구분]\n' +
    '- 과자, 젤리, 초콜릿, 스낵 등 소량 간식 → "달콤한 간식" 또는 "짭짤한 간식"\n' +
    '- 우유, 요거트, 푸딩, 아이스크림 → "유제품·디저트"\n' +
    '- 컵라면, 즉석도시락, 햄버거, 샌드위치 등 끼니 대체형 → "간편한 한 끼"\n' +
    '- 식빵, 시리얼, 베이글 → "빵·시리얼류"\n' +
    '- 마시는 것만 → "음료"\n' +
    '- 간식과 한 끼를 혼동하지 않는다.\n\n' +
    '응답은 아래 JSON 하나만 출력한다. 다른 말은 쓰지 않는다.\n' +
    '{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null}'
  );
}

export function getPackageImagePrompt(profile?: PersonalizationInput | null): string {
  return (
    getKoreanNovaCriteria(profile) +
    '\n' +
    '당신에게 할 일: 이미지는 식품 포장(원재료명, 영양정보 표, 앞면 등)일 수 있습니다.\n' +
    '텍스트를 읽고 전처리한 뒤, 제품 정보·한국형 NOVA·Group IV 세분화·영양표·카테고리를 판단하세요.\n' +
    '중간 과정은 출력하지 말고 최종 결과만 아래 JSON 형식으로 한 개만 출력하세요.\n\n' +
    '[영양정보 표]\n' +
    getNutritionServingUnitRulesBlock() +
    '\n' +
    getNutritionTableRowsRulesBlock() +
    '- 이미지에 영양정보 표가 보이면 숫자 필드와 tableRows를 nutrition에 넣는다.\n' +
    '- 없거나 판독 불가면 nutrition은 null.\n' +
    '- caloriesKcal: 1회 제공량 또는 표기 기준 열량(kcal) 숫자.\n' +
    '- 0kcal, 제로칼로리, 열량 0이면 반드시 0을 넣는다.\n' +
    '- 나트륨·콜레스테롤은 mg 숫자.\n' +
    '- 탄수화물·당류·단백질·지방·포화지방·트랜스지방·식이섬유는 g 숫자.\n' +
    '- servingSizeText: 제품 표기 그대로 최대한 보존한다.\n' +
    '- basisIsPerServing: 표 숫자가 1회 제공량 기준이면 true, 100g/100ml 기준이면 false.\n\n' +
    '[foodCategory]\n' +
    '아래 중 정확히 하나의 문자열만 출력한다.\n' +
    '- "음료"\n' +
    '- "달콤한 간식"\n' +
    '- "짭짤한 간식"\n' +
    '- "간편한 한 끼"\n' +
    '- "빵·시리얼류"\n' +
    '- "유제품·디저트"\n' +
    '- 과자·젤리·초콜릿·스낵 등 소량 간식은 "달콤한 간식" 또는 "짭짤한 간식"\n' +
    '- 우유·요거트·푸딩 등은 "유제품·디저트"\n' +
    '- 컵라면·도시락·햄버거·샌드위치 등은 "간편한 한 끼"\n' +
    '- 식빵·시리얼은 "빵·시리얼류"\n' +
    '- 마시는 것만 "음료"\n\n' +
    '[JSON 출력]\n' +
    '- productName: 완전히 정확한 이름이 명시되지 않았으면 반드시 공란 "".\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 "".\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄. 없으면 "".\n' +
    '- novaGroup: 1~4.\n' +
    '- novaSubgroup: novaGroup이 4일 때만 "4A" | "4B" | "4C". 그 외는 "".\n' +
    '- judgmentReason: 반드시 한 문장.\n' +
    '- concernIngredients: 최대 3개. 없으면 [].\n' +
    '- briefDescription: 열량만 말하지 말고, 열량·당·나트륨·가공/NOVA를 아우르는 종합 한 문장, 45자 이내.\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 "".\n' +
    '- consumptionAdvice: 라벨에 보이는 정보만 바탕으로 한 문장. 없으면 "".\n' +
    '- foodCategory: 위 목록 중 하나.\n' +
    '- nutrition: 객체 또는 null.\n' +
    '- nutrition 필드: caloriesKcal, sodiumMg, carbsG, sugarG, proteinG, fatG, saturatedFatG, transFatG, cholesterolMg, dietaryFiberG, servingSizeText, basisIsPerServing, tableRows.\n\n' +
    '응답은 아래 JSON 하나만 출력하세요. 다른 말 없이.\n' +
    '{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null}'
  );
}

export function normalizeGeminiJson(response: string): string {
  if (typeof response !== 'string') return '';
  return response
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}