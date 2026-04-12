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
        personalSummary: '내용은 같고 강도만 낮춘다.'
      };
    case 'normal':
      return {
        adviceTone: 'general',
        riskPriority: '핵심 포인트(당류·나트륨·포화지방·초가공성)는 동일하게 본다.',
        evaluationBias: '판단 기준은 바꾸지 않고, 경고 강도만 일반 톤으로 유지한다.',
        leniencyRule: '과도한 경고를 피하고 확인 중심으로 짧게 쓴다.',
        adviceStyle: '일반 강도 톤으로 간결하게 쓴다.',
        summaryStyle: '동일한 핵심 요소를 차분하게 요약한다.',
        personalSummary: '내용은 같고 강도만 낮춘다.'
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
        personalSummary: '내용은 같고 강도만 높인다.'
      };
  }
}

/**
 * 맞춤 참고(consumptionAdvice): 프로필 유무와 관계없이 항상 프롬프트에 포함.
 * 사용자가 “어떻게 먹으면 조금 더 나을지”를 직관적으로 얻도록 한다.
 */
export function getConsumptionAdviceUniversalBlock(): string {
  return (
    '[consumptionAdvice — 맞춤 참고(필수)]\n' +
    '- 역할: 이 제품 라벨(영양표·원재료·NOVA)을 바탕으로 **조금 더 건강하게 즐기는 방법**을 알려 주세요.\n' +
    '- **정확히 2문장**.\n' +
    '- 1문장: 표·원재료에서 드러나는 특징을 사실대로 짚는다(당·나트륨·포화지방·초가공 등, 최소 1가지).\n' +
    '- 2문장: 1문장과 연결되는 **생활 속 섭취 팁** — 곁들임·순서·조합을 **부드러운 권유체**로 쓴다.\n' +
    '  톤 예: "당류가 높으면 우유나 견과와 함께 나눠 드시면 혈당이 덜 급해질 수 있어요.", "나트륨이 높으면 채소·과일을 함께 두면 균형에 도움이 될 수 있어요.", "단순 당이 많으면 단백질·섬유질 있는 음식과 함께 드시면 좋아요."\n' +
    '- 톤: 친절한 구어체, "~하면 좋아요", "~해 보세요", "~할 수 있어요", "~와 함께 드시면", "~나눠 드시면". 딱딱한 보고서체·명령조만 이어지는 문장은 피한다.\n' +
    '- 팁은 **일반 영양 상식** 수준이어야 하며, 라벨에 없는 특정 브랜드·제품명을 지어내지 않는다.\n' +
    '- Group IV(초가공)이면 2문장 안에서 **초가공 또는 가공 정도**를 최소 한 번 짚는다.\n' +
    '- 금지: 질병 진단·치료·약 복용 지시, "반드시", "절대", 공포 조장, 의학적 단정.\n' +
    '- 금지: 하루 n번·주 n회·n개만 같은 **숫자로 된 섭취 규칙**.\n' +
    '- 금지: 식감·촉감만으로 내용을 채우기.\n\n'
  );
}

/** 사용자에게 보이는 JSON 문장 — 토스 앱 수준의 친근한 존댓말 */
export function getTossUserFacingToneBlock(): string {
  return (
    '[사용자 화면 문장 — 토스 말투]\n' +
    '- 사용자에게 보이는 한국어는 **토스 앱처럼** 짧고 읽기 쉬운 존댓말(-요)로 쓴다.\n' +
    '- 적용 필드: briefDescription, judgmentReason, concernIngredients.explanation, consumptionAdvice, koreanReclassificationNote.\n' +
    '- 기본 어미: "~이에요/예요", "~해요", "~해 보세요", "~할 수 있어요", "~면 좋아요". 딱딱한 "~입니다"만 반복하거나 보고서체·명령조(해라/하십시오) 위주 문장은 피한다.\n' +
    '- 비교 응답이면 comparisonSummary, recommendationLine도 같은 톤으로 쓴다.\n\n'
  );
}

/** 키·몸무게로 BMI가 있을 때만: 맞춤 참고(consumptionAdvice) 톤 조절 */
export function getPersonalizationBlock(profile?: PersonalizationInput | null): string {
  if (!profile || profile.bmiValue == null || !profile.bmiTier) return '';

  const bmiText = formatBmiValue(profile.bmiValue);
  const bmiTierLabel = getBmiTierLabel(profile.bmiTier);
  const focus = getPersonalizationFocus(profile.bmiTier);

  return (
    '[맞춤 참고 — BMI 반영]\n' +
    `- BMI: ${bmiText}, 체형 구간: ${bmiTierLabel}, 설명 톤: ${focus.adviceTone}\n` +
    '- consumptionAdvice 2문장에 반영: 위 [consumptionAdvice — 맞춤 참고(필수)]를 유지하되, **특히 2문장째**에서 체형에 맞게 부담을 짚는 강도를 조절한다.\n' +
    '- 과체중·비만: 당·열량 밀도·초가공·체중 맥락을 2문장째 팁에서 한 번 더 의식할 수 있게 쓴다(치료·감량 약속·의학적 단정 금지).\n' +
    '- 정상·저체중: 같은 팁을 덜 겁주는 톤으로 쓴다.\n' +
    '- NOVA 등급은 BMI로 바꾸지 않는다.\n\n'
  );
}

export function getFoodPoliceHolisticEvaluationIntro(profile?: PersonalizationInput | null): string {
  return (
    '당신은 식품 분석 앱 FoodPolice를 돕는 AI예요.\n' +
    '열량만 보지 않고 영양성분, 원재료, 가공 정도를 함께 살펴봐요.\n' +
    '열량만으로 좋다/나쁘다를 가르지 않아요.\n\n' +
    getConsumptionAdviceUniversalBlock() +
    getPersonalizationBlock(profile) +
    '[판단 순서]\n' +
    '1. 영양성분: 당류, 나트륨, 포화지방이 많은지 본다.\n' +
    '2. 원재료: 정제 재료, 인공첨가물, 초가공 특징을 본다.\n' +
    '3. 가공 정도: 한국형 NOVA 기준으로 Group 1~4를 판단한다.\n' +
    '4. 최종 종합: 영양성분과 가공 정도를 우선하고, 열량은 보조로만 반영한다.\n\n' +
    '[개인화 적용 원칙]\n' +
    '- 개인화는 식품 자체 분류를 바꾸는 용도가 아니다.\n' +
    '- 개인화는 문장 강도(일반/주의 톤)만 조정하는 용도다.\n' +
    '- 같은 식품이라도 사용자 상태에 따라 더 주의 깊게 봐야 할 요소를 다르게 짚을 수 있다.\n' +
    '- 과체중/비만일 경우: 같은 내용을 더 주의 톤으로 쓴다.\n' +
    '- 정상/저체중일 경우: 같은 내용을 일반 톤으로 쓴다.\n' +
    '- 섭취 허용 횟수, 감량 효과, 건강 개선 효과를 임의 계산하지 않는다.\n' +
    '- 숫자, 횟수, 기간을 넣은 섭취 규칙은 만들지 않는다.\n\n' +
    '[출력 원칙]\n' +
    '- briefDescription: 전체 평가를 한 문장으로, 45자 이내.\n' +
    '- briefDescription은 영양성분, 원재료 특성, 가공 정도 중 최소 2가지를 반영한다.\n' +
    '- briefDescription은 열량만으로 요약한 문장을 금지한다.\n' +
    '- briefDescription은 BMI 구간에 따라 강도만 달라져야 한다.\n' +
    '- concernIngredients: 원재료명 또는 첨가물명만 최대 3개. 영양성분명은 금지.\n' +
    '- concernIngredients.name에는 원재료 표기에 실제로 보이는 명칭만 넣는다. 일반화·추측 금지.\n' +
    '- concernIngredients.name에 나트륨, 당류, 탄수화물, 지방, 포화지방, 열량 같은 영양성분표 항목명은 넣지 않는다.\n' +
    '- concernIngredients.explanation은 BMI 구간에 따라 강도만 조정한다.\n' +
    '- judgmentReason: K-NOVA 판단 근거를 한 문장으로 쓴다.\n' +
    '- consumptionAdvice: 위 [consumptionAdvice — 맞춤 참고(필수)]와 BMI 블록을 따른다. **정확히 2문장**. 곁들임·조합 제안 허용.\n' +
    '- 의료적 진단, 치료, 단정 표현은 금지한다.\n' +
    getTossUserFacingToneBlock()
  );
}

export function getNutritionTableRowsRulesBlock(): string {
  return (
    '- tableRows(영양표가 보일 때 필수): 표에 보이는 줄을 위→아래 그대로 한 줄도 빠짐없이 배열.\n' +
    '- name은 라벨에 적힌 문자·표기 그대로 넣는다. 정해진 항목 목록 없이 어떤 항목명이든 생략·통합·대체 금지.\n' +
    '- amount는 숫자·단위·%를 화면에 보이는 그대로 넣는다.\n' +
    '- 표 제목, 1회 제공량 안내 등 영양항목이 아닌 줄은 제외해도 되지만, 성분 표 본문 줄은 전부 넣는다.\n' +
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
    '- consumptionAdvice에서는 하루 몇 통, 몇 봉지, 주 몇 회 같은 **숫자로 된 섭취 빈도·개수 규칙**을 쓰지 않는다.\n' +
    '- consumptionAdvice에서는 "하루 1개만", "주 3회만"처럼 **구체적 양·횟수를 숫자로 규정**하는 문장은 쓰지 않는다. 다만 "~와 함께 드시면 좋아요" 같은 곁들임·조합은 허용한다.\n' +
    '- 애매하면 중량 또는 1회 제공량을 확인해 보시라는 보수적 문장을 쓸 수 있다.\n'
  );
}

export function getKoreanNovaCriteria(profile?: PersonalizationInput | null): string {
  return (
    getFoodPoliceHolisticEvaluationIntro(profile) +
    '**한국형 NOVA(Korean NOVA)** 분류 기준에 따라 식품을 분석합니다.\n\n' +
    '[사용자에게 보여줄 Group IV 세부 뜻]\n' +
    '- 4A: 재료 기반 음식 형태가 남아 있는 경계형 초가공\n' +
    '- 4B: 특정 기능(제로·고단백 등) 중심으로 재구성된 초가공\n' +
    '- 4C: 복합 첨가·자극적 구조가 강한 고도 초가공\n' +
    '- 위 뜻은 결과 설명(novaSubgroup, judgmentReason, briefDescription)에서 일관되게 반영한다.\n\n' +
    '[참고 체계: SIGA]\n' +
    '- SIGA는 초가공 식품을 A/B/C 형태로 세분해서 보는 프레임이다.\n' +
    '- 이 분석은 한국형 NOVA를 기본으로 하되, Group IV 세분화(4A/4B/4C)를 설명할 때 SIGA의 취지(가공 강도 차이)를 참고해 일관되게 쓴다.\n' +
    '- 단, 최종 분류 키는 novaGroup/novaSubgroup(한국형 NOVA)만 사용하고 SIGA 등급을 별도 필드로 출력하지 않는다.\n\n' +
    '[핵심 원칙]\n' +
    '- 첨가물 개수만으로 분류하지 않는다.\n' +
    '- 식품의 가공 방식과 원재료 구조 유지 여부로 판단한다.\n' +
    '- 한국 전통 식품(장류, 김치, 젓갈 등) 특성을 반영한다.\n' +
    '- 사용자 맞춤 정보는 novaGroup, novaSubgroup 판단에 사용하지 않는다.\n' +
    '- 사용자 맞춤 정보는 briefDescription, concernIngredients.explanation, consumptionAdvice의 초점 조정에만 사용한다.\n\n' +
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
    '- 과장·공포 표현은 금지한다.\n' +
    '- BMI 구간에 따라 explanation의 강조점은 달라질 수 있다.\n\n' +
    '[말투 규칙 — 사용자 노출]\n' +
    '- 위 [사용자 화면 문장 — 토스 말투]를 우선한다.\n' +
    '- 짧고 분명하게, 쉬운 생활어로 쓴다. 의학 전문용어는 남발하지 않는다.\n' +
    '- 과장·단정·공포 표현은 피하고 차분하게 말한다.\n' +
    '- judgmentReason은 Group IV일 때 원재료 구조와 기능성 여부만으로 한 문장.\n' +
    '- briefDescription은 종합 한 문장 45자 이내.\n' +
    '- concernIngredients.explanation은 한 문장으로 짧게.\n' +
    '- consumptionAdvice는 [consumptionAdvice — 맞춤 참고(필수)]를 따른다.\n'
  );
}

export function getTwoImagePackagePrompt(profile?: PersonalizationInput | null): string {
  return (
    getKoreanNovaCriteria(profile) +
    '\n' +
    '당신에게 할 일: 아래 두 장의 이미지가 순서대로 제공돼요.\n\n' +
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
    '- consumptionAdvice: 위 [consumptionAdvice — 맞춤 참고(필수)]와 BMI 블록을 따른다. **정확히 2문장**. 곁들임·조합·섭취 팁 허용. 숫자 빈도·개수 규칙만 금지.\n' +
    '- kcal 추측은 금지한다.\n\n' +
    '[JSON 출력]\n' +
    '- productName: 제품명. 완전히 정확한 이름이 명시되지 않았으면 반드시 공란 "".\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 "".\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄. 없으면 "".\n' +
    '- OCR/철자 보정: productName/rawMaterials/concernIngredients.name에 OCR로 보이는 철자 깨짐(예: 글자 1~2개 수준의 오인식)이 있으면, 의미가 바뀌지 않는 범위에서 표준 표기로 정정한다. 다만 없는 원재료를 새로 추정하거나, 의미가 달라지는 변경은 금지한다.\n' +
    '- 보정 판단 기준: 라벨 원문에서 식품군을 식별하는 핵심 키워드(예: 특정 원재료명/제품군 단어)가 함께 보이면, 그 키워드의 철자만 정정하는 방식으로 보정한다.\n' +
    '- novaGroup: 1~4.\n' +
    '- novaSubgroup: novaGroup이 4일 때만 "4A" | "4B" | "4C". 그 외는 "".\n' +
    '- judgmentReason: 반드시 한 문장.\n' +
    '- concernIngredients: 주의 원재료 최대 3개. 없으면 []. (주의: concernIngredients.name도 위 OCR/철자 보정 범위에서만 정정 허용)\n' +
    '- briefDescription: 열량만 말하지 말고, 열량·당·나트륨·가공/NOVA를 아우르는 종합 한 문장, 45자 이내.\n' +
    '- briefDescription은 BMI 구간에 따라 강조 요소가 달라져야 한다.\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 "".\n' +
    '- consumptionAdvice: 위 [consumptionAdvice — 맞춤 참고(필수)]와 BMI 블록을 따른다. **정확히 2문장**. 건강 섭취 팁·곁들임 허용. 숫자 빈도·개수 규칙만 금지. 없으면 "".\n' +
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
    '응답은 아래 JSON 하나만 출력해 주세요. 다른 말은 쓰지 않아요.\n' +
    '{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null}'
  );
}

export function getPackageImagePrompt(profile?: PersonalizationInput | null): string {
  return (
    getKoreanNovaCriteria(profile) +
    '\n' +
    '당신에게 할 일: 이미지는 식품 포장(원재료명, 영양정보 표, 앞면 등)일 수 있어요.\n' +
    '텍스트를 읽고 전처리한 뒤, 제품 정보·한국형 NOVA·Group IV 세분화·영양표·카테고리를 판단해 주세요.\n' +
    '중간 과정은 출력하지 말고 최종 결과만 아래 JSON 형식으로 한 개만 출력해 주세요.\n\n' +
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
    '[개인화 차등 적용]\n' +
    '- BMI 구간이 과체중/비만이면: 경계 수준의 단맛, 지방, 초가공성도 더 주의가 필요한 요소로 해석한다.\n' +
    '- BMI 구간이 정상/저체중이면: 경미한 수준은 과도하게 위험으로 해석하지 않는다.\n' +
    '- 같은 제품이라도 BMI 구간이 다르면 briefDescription, concernIngredients.explanation, consumptionAdvice 문장이 같지 않게 조정한다.\n\n' +
    '[JSON 출력]\n' +
    '- productName: 완전히 정확한 이름이 명시되지 않았으면 반드시 공란 "".\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 "".\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄. 없으면 "".\n' +
    '- OCR/철자 보정: productName/rawMaterials/concernIngredients.name에 OCR로 보이는 철자 깨짐(예: 글자 1~2개 수준의 오인식)이 있으면, 의미가 바뀌지 않는 범위에서 표준 표기로 정정한다. 다만 없는 원재료를 새로 추정하거나, 의미가 달라지는 변경은 금지한다.\n' +
    '- 보정 판단 기준: 라벨 원문에서 식품군을 식별하는 핵심 키워드(예: 특정 원재료명/제품군 단어)가 함께 보이면, 그 키워드의 철자만 정정하는 방식으로 보정한다.\n' +
    '- novaGroup: 1~4.\n' +
    '- novaSubgroup: novaGroup이 4일 때만 "4A" | "4B" | "4C". 그 외는 "".\n' +
    '- judgmentReason: 반드시 한 문장.\n' +
    '- concernIngredients: 최대 3개. 없으면 [].\n' +
    '- concernIngredients.name도 위 OCR/철자 보정 범위에서만 정정 허용 (의미 변경 금지)\n' +
    '- briefDescription: 열량만 말하지 말고, 열량·당·나트륨·가공/NOVA를 아우르는 종합 한 문장, 45자 이내.\n' +
    '- briefDescription은 BMI 구간에 따라 강조 요소가 달라져야 한다.\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 "".\n' +
    '- consumptionAdvice: 위 [consumptionAdvice — 맞춤 참고(필수)]와 BMI 블록을 따른다. **정확히 2문장**. 건강 섭취 팁·곁들임 허용. 숫자 빈도·개수 규칙만 금지. 없으면 "".\n' +
    '- foodCategory: 위 목록 중 하나.\n' +
    '- nutrition: 객체 또는 null.\n' +
    '- nutrition 필드: caloriesKcal, sodiumMg, carbsG, sugarG, proteinG, fatG, saturatedFatG, transFatG, cholesterolMg, dietaryFiberG, servingSizeText, basisIsPerServing, tableRows.\n\n' +
    '응답은 아래 JSON 하나만 출력해 주세요. 다른 말은 쓰지 않아요.\n' +
    '{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null}'
  );
}

/** 비교 응답 루트에 넣을 오늘 미션 식품 일치 판정(제품 A·B 중 하나라도 해당하면 true) */
export function getDailyQuestProductMatchBlockForCompare(targetLabel: string): string {
  return (
    '\n\n[오늘 퀘스트 음식 일치 — 반드시 판단]\n' +
    `오늘 퀘스트 음식은 「${targetLabel}」이에요.\n` +
    '제품 A 또는 제품 B 중 **어느 한 쪽이라도** 위 퀘스트 음식이면 dailyQuestProductMatch: true, 둘 다 아니면 false(애매하면 false).\n' +
    '1번·3번 이미지(각 제품의 원재료·앞면)를 기준으로 판단한다. 추측은 최소화하고 라벨·포장 형태로 판단한다.\n' +
    'JSON 루트에 dailyQuestProductMatch: true|false 를 넣는다.\n'
  );
}

/** 제품 A·B 각각 원재료+영양표 2장씩, 총 4장 멀티모달 비교 */
export function getCompareFourImagesPrompt(
  profile?: PersonalizationInput | null,
  dailyQuestTarget?: string | null,
): string {
  const questBlock =
    dailyQuestTarget && String(dailyQuestTarget).trim().length > 0
      ? getDailyQuestProductMatchBlockForCompare(String(dailyQuestTarget).trim())
      : '';
  return (
    getKoreanNovaCriteria(profile) +
    '\n\n[상품 두 개 비교]\n' +
    '아래 이미지 네 장은 **순서대로** 다음과 같다.\n' +
    '1) 제품 A — 원재료·제품 표시(또는 앞면)\n' +
    '2) 제품 A — 영양정보 표\n' +
    '3) 제품 B — 원재료·제품 표시(또는 앞면)\n' +
    '4) 제품 B — 영양정보 표\n\n' +
    '[제품별 추출]\n' +
    '제품 A는 JSON의 productA에, 제품 B는 productB에 각각 넣는다. 각 객체는 단일 제품 분석과 **동일한 필드·규칙**을 따른다.\n' +
    getNutritionServingUnitRulesBlock() +
    '\n' +
    getNutritionTableRowsRulesBlock() +
    '- 각 제품의 영양표가 보이면 nutrition에 숫자·tableRows를 채운다. 없으면 null.\n' +
    '- OCR·철자 보정은 단일 분석과 동일(의미 유지 범위).\n\n' +
    '[비교 결론 — 반드시 포함]\n' +
    '- betterChoice: "A" | "B" | "similar" 중 하나.\n' +
    '  - 기본: 한국형 NOVA 단계가 **더 낮은**(가공이 덜한) 쪽을 고른다.\n' +
    '  - 둘 다 같은 novaGroup이면: 당·나트륨·포화지방·당류가 라벨상 유리한 쪽, Group IV면 4A→4B→4C 순으로 덜 강한 가공을 선호하는 경향을 반영한다.\n' +
    '  - 카테고리가 완전히 달라 직접 비교가 어렵거나 정보가 부족하면 "similar" 또는 더 나은 쪽을 보수적으로 적고 comparisonSummary에 한 줄 이유를 쓴다.\n' +
    '- comparisonSummary: **3~5문장**, 쉬운 한국어·토스 말투(-요). 두 제품 NOVA·영양(당·나트륨 등) 차이를 짚고, 왜 한 쪽이 더 나은 선택일 수 있는지(또는 비슷한지) 설명한다.\n' +
    '- recommendationLine: **한 줄** 요약(30자 이내 권장). 토스 말투로 짧게.\n' +
    '- 의학 진단·치료 약속·섭취 횟수/허용량 숫자 규칙은 단일 분석과 동일하게 금지한다.\n' +
    questBlock +
    '\n' +
    '응답은 JSON **한 개**만 출력해 주세요. 다른 말은 쓰지 않아요.\n' +
    '{"productA":{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null},' +
    '"productB":{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null},' +
    '"betterChoice":"A","comparisonSummary":"","recommendationLine":""' +
    (questBlock ? ',"dailyQuestProductMatch":false' : '') +
    '}'
  );
}

/** 일일 첫 퀘스트: AI가 촬영 제품이 미션 종류와 맞는지 판단하도록 프롬프트에 삽입 */
export function getDailyQuestProductMatchBlock(targetLabel: string): string {
  return (
    '\n\n[오늘 퀘스트 음식 일치 — 반드시 판단]\n' +
    `오늘 퀘스트 음식은 「${targetLabel}」이에요.\n` +
    '이미지에 보이는 제품이 위 퀘스트 음식이면 dailyQuestProductMatch: true, 아니면 false(애매하면 false).\n' +
    '추측은 최소화하고, 라벨·포장 형태로 판단한다. JSON 루트에 dailyQuestProductMatch: true|false 를 넣는다.\n'
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