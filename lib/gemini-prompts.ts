/** 이미지 입력 지원을 위해 gemini-3.1-flash-lite-preview 모델 사용 */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

export function getKoreanNovaCriteria(): string {
  return (
    '당신은 **한국형 NOVA(Korean NOVA)** 분류 기준에 따라 식품을 분석합니다.\n\n' +
    '[핵심 원칙]\n' +
    '- 첨가물 개수만으로 분류하지 않는다.\n' +
    '- 식품의 **가공 방식**과 **원재료 구조 유지 여부**로 판단한다.\n' +
    '- 한국 전통 식품(장류, 김치, 젓갈 등) 특성을 반영한다.\n\n' +
    '[분류 순서 — 반드시 이 순서로 판단]\n' +
    '1) 원재료 그대로인가? → YES → Group I\n' +
    '2) 원재료에서 특정 성분만 추출한 조리 재료인가? → YES → Group II\n' +
    '3) Group I + Group II 재료의 단순 조합이고, 원재료 특성이 유지되는가? → YES → Group III\n' +
    '4) 원재료 구조가 사라지고 산업적으로 재구성된 식품인가? → YES → Group IV\n\n' +
    '[중요] 첨가물이 있다고 무조건 Group IV로 분류하지 않는다. 성분 개수만으로 Group IV를 판정하지 않는다. **원재료 특성 유지 여부**를 우선 판단한다.\n\n' +
    '[한국 식품 예외] 다음은 기본적으로 Group III로 분류한다: 김, 김자반, 된장, 간장, 고추장, 젓갈, 절임식품, 반찬류. 전통 가공 식품이므로 초가공으로 분류하지 않는다.\n\n' +
    '[Group IV 세분화 — novaGroup이 4일 때만 적용]\n' +
    '먼저 아래 분기를 적용한다.\n\n' +
    'Q6. 이 식품이 "고당·고지·고염 + 저영양 구조"인가?\n' +
    '→ YES → Q7로\n' +
    '→ NO → 4A (경계형 초가공)\n\n' +
    'Q7. 이 식품이 "과소비(과식)"를 유도하도록 설계되었는가?\n' +
    '→ YES → Q8로\n' +
    '→ NO → 4A (경계형 초가공)\n\n' +
    'Q8. 이 식품이 원래 먹어야 할 자연식 대신 소비되기 쉬운 구조인가?\n' +
    '→ YES → 4C (고도 초가공)\n' +
    '→ NO → 4B\n\n' +
    '보조 YES/NO 체크(4A 경향): Q1 당/지방/염분이 과도하지 않은가, Q2 첨가물이 맛 조작이 아닌 보존/안정 목적인가, Q3 원재료 기반이 쉽게 추측되는가 → YES 2개 이상이면 4A 후보.\n' +
    '보조 YES/NO 체크(4B 경향): Q1 단맛/짠맛/지방이 눈에 띄게 강화되었는가, Q2 향료/감미료/유화제 등 맛 조작 첨가물이 있는가, Q3 원재료보다 제품 느낌이 강한가 → YES 2개 이상이면 4B 후보.\n' +
    '보조 YES/NO 체크(4C 경향): Q1 당/지방/염분이 매우 높은가, Q2 첨가물이 복합적으로 다수인가, Q3 강한 자극적 맛으로 계속 먹게 되는가, Q4 원재료 기반을 거의 알 수 없는가 → YES 3개 이상이면 4C 후보.\n' +
    '[균형 규칙] 4B/4C는 "강한 근거가 명시적으로 보일 때만" 선택한다. 근거가 약하거나 애매하면 4A를 우선한다.\n' +
    '위 분기(Q6~Q8)와 보조 체크를 종합해 **하나**만 선택: 4A, 4B, 4C.\n\n' +
    '[주의 원재료 선정]\n' +
    '- 최대 3개만 표시. 문제가 될 수 있는 **원재료명/첨가물명**만 선택한다.\n' +
    '- 선정 기준: 초가공 판단 참고 성분(인공 감미료, 색소, 향료·MSG, 유화제, 보존료, 가공전분·고과당옥수수시럽 등).\n' +
    '- **중요: 영양성분명은 금지**(예: 나트륨, 당류, 열량, 탄수화물, 단백질, 지방, 포화지방, 트랜스지방). 이런 항목은 concernIngredients에 넣지 않는다.\n' +
    '- 없으면 0개 또는 1개만 표시하고, 억지로 3개 채우지 않는다.\n' +
    '- 각 성분마다 한 줄 설명. 짧고 쉬운 한국어. "~에 주의가 필요합니다", "~가 많을 수 있습니다"처럼 중립적으로. "위험", "독성", "절대 먹지 말아야 한다" 등 과장·공포 표현 금지.'
  );
}

export function getTwoImagePackagePrompt(): string {
  return (
    getKoreanNovaCriteria() +
    '\n\n' +
    '당신에게 할 일: 아래 **두 장의 이미지**가 순서대로 제공됩니다.\n\n' +
    '[이미지 A: 원재료/제품 표시]\n' +
    '- 원재료(원재료 표기 전체 한 줄), 제품명(productName), 제조사(companyName)를 이미지에서 읽어 추출합니다.\n' +
    '- rawMaterials를 기준으로 한국형 NOVA 분류(novaGroup)를 판단합니다. Group IV이면 novaSubgroup(4A/4B/4C)도 판단합니다.\n\n' +
    '[이미지 B: 영양정보 표]\n' +
    '- 영양정보 표가 보이면 nutrition에 숫자를 채웁니다. 없거나 판독 불가면 nutrition은 null로 둡니다.\n' +
    '- 표에 **0kcal·제로칼로리·열량 0** 등으로 나오면 caloriesKcal는 **반드시 숫자 0**(null·빈 문자열 금지).\n' +
    '- consumptionAdvice는 “일일 권장 섭취량 안내”가 아니라, 라벨에 적힌 일반 조언(예: 음료는 보관/개봉 후 섭취 등)을 한두 문장으로 정리합니다. kcal 판독이 불가하면 과도한 추측을 하지 않습니다.\n\n' +
    '[2단계 — JSON만 출력]\n' +
    '- productName: 제품명. **완전히 정확한 이름이 명시되지 않았으면 반드시 공란 \"\".** 추측·유추 금지.\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 \"\"\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄, 쉼표 구분. 없으면 \"\"\n' +
    '- novaGroup: 1~4 (한국형 NOVA 순서)\n' +
    '- novaSubgroup: **novaGroup이 4일 때만** \"4A\" | \"4B\" | \"4C\". 그 외는 빈 문자열 \"\".\n' +
    '- judgmentReason: 해당 그룹 판단 이유 (한 문장)\n' +
    '- concernIngredients: 주의 원재료 최대 3개. [{\"name\":\"\",\"explanation\":\"\"}]. 없으면 []\n' +
    '- briefDescription: 이 식품에 대한 간단한 설명 (한 문장)\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 \"\"\n' +
    '- consumptionAdvice: 라벨 기반 섭취/보관 조언. 한두 문장. 없으면 \"\"\n' +
    '- foodCategory: 위 목록 중 하나\n' +
    '- nutrition: 객체 또는 null. 필드: caloriesKcal, sodiumMg, carbsG, sugarG, proteinG, fatG, saturatedFatG, transFatG (없으면 null), servingSizeText, basisIsPerServing\n' +
    '응답은 아래 JSON 하나만 출력하세요. 다른 말 없이.\n' +
    '{"productName":"","companyName":"","rawMaterials":"","novaGroup":4,"novaSubgroup":"","judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":"","foodCategory":"","nutrition":null}'
  );
}

export function getPackageImagePrompt(): string {
  return (
    getKoreanNovaCriteria() +
    '\n\n' +
    '당신에게 할 일: **이미지는 식품 포장(원재료명, 영양정보 표, 앞면 등)일 수 있습니다. 텍스트를 읽고 전처리한 뒤, 제품 정보·한국형 NOVA·Group IV 세분화·영양표(있을 때)·카테고리를 판단하세요.** 중간 과정은 출력하지 말고, 최종 결과만 아래 JSON 형식으로 한 개만 출력하세요.\n\n' +
    '[영양정보 표]\n' +
    '- 이미지에 영양정보 표가 보이면 숫자를 읽어 nutrition에 넣는다. 없거나 판독 불가면 nutrition은 null.\n' +
    '- caloriesKcal: 1회 제공량(또는 표기 기준) 기준 **열량(kcal)**. "약", "~"이 있으면 대표값 하나. **0kcal·제로칼로리·열량 0**이면 **0**을 넣는다(null 금지).\n' +
    '- 나트륨은 mg, 탄수화물·당류·단백질·지방·포화지방·트랜스지방은 g 단위로 숫자만.\n' +
    '- servingSizeText: 가능하면 제품 표기 그대로. 예) "1병(355ml)", "1캔(250ml)", "총 내용량 500ml 중 100ml", "1회 30g".\n' +
    '- basisIsPerServing: 표의 숫자가 **1회 제공량(1회 섭취 참고량)** 기준이면 true, 100g/100ml 기준이면 false.\n\n' +
    '[foodCategory]\n' +
    '아래 중 **정확히 하나**의 문자열: "음료", "달콤한 간식", "짭짤한 간식", "간편한 한 끼", "빵·시리얼류", "유제품·디저트".\n\n' +
    '[2단계 — JSON만 출력]\n' +
    '- productName: 제품명. **완전히 정확한 이름이 명시되지 않았으면 반드시 공란 "".** 추측·유추 금지.\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 ""\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄, 쉼표 구분. 없으면 ""\n' +
    '- novaGroup: 1~4 (한국형 NOVA 순서)\n' +
    '- novaSubgroup: **novaGroup이 4일 때만** "4A" | "4B" | "4C". 그 외는 빈 문자열 "".\n' +
    '- judgmentReason: 해당 그룹(및 4 세분화 근거를 한 문장 포함 가능) 판단 이유\n' +
    '- concernIngredients: 주의 원재료 최대 3개. [{"name":"","explanation":""}]. 없으면 []\n' +
    '- briefDescription: 이 식품에 대한 간단한 설명 (한 문장)\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 ""\n' +
    '- consumptionAdvice: 섭취 방법 조언. 한두 문장. 없으면 ""\n' +
    '- foodCategory: 위 목록 중 하나\n' +
    '- nutrition: 객체 또는 null. 필드: caloriesKcal, sodiumMg, carbsG, sugarG, proteinG, fatG, saturatedFatG, transFatG (없으면 null), servingSizeText, basisIsPerServing\n' +
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
