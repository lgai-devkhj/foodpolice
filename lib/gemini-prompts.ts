/** 이미지 입력 지원 Gemma 12B (Generative Language API) */
export const GEMINI_MODEL = 'Gemma-3-12b-it';

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
    '[주의 원재료 선정]\n' +
    '- 최대 3개만 표시. 문제가 될 수 있는 원재료만 선택한다.\n' +
    '- 선정 기준: 초가공 판단 참고 성분(인공 감미료, 색소, 향료·MSG, 유화제, 보존료, 가공전분·고과당옥수수시럽 등), 당류·나트륨 등 과다 섭취 시 주의가 필요한 성분.\n' +
    '- 없으면 0개 또는 1개만 표시하고, 억지로 3개 채우지 않는다.\n' +
    '- 각 성분마다 한 줄 설명. 짧고 쉬운 한국어. "~에 주의가 필요합니다", "~가 많을 수 있습니다"처럼 중립적으로. "위험", "독성", "절대 먹지 말아야 한다" 등 과장·공포 표현 금지.'
  );
}

export function getPackageImagePrompt(): string {
  return (
    getKoreanNovaCriteria() +
    '\n\n' +
    '당신에게 할 일은 하나입니다: **아래 이미지는 식품 포장(뒷면 또는 원재료 표시) 사진입니다. 이미지에서 텍스트를 읽고 전처리한 뒤, 제품 정보 추출과 한국형 NOVA 분류를 판단해 주세요.** 중간 과정은 출력하지 말고, 최종 판단 결과만 아래 JSON 형식으로 한 개만 출력하세요.\n\n' +
    '[1단계 — 이미지에서 텍스트 읽기·전처리 (내부적으로만 수행)]\n' +
    '- OCR 오타·깨진 글자 보정, 줄바꿈으로 끊긴 단어 연결, 무관 문구는 참고만 하고 원재료/제품명만 추출에 사용.\n\n' +
    '[2단계 — 판단 결과만 JSON으로 출력]\n' +
    '- productName: 제품명. **완전히 정확한 이름이 명시되지 않았으면 반드시 공란 "" 로 두세요.** 추측·유추 금지.\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 공란 ""\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄, 쉼표 구분\n' +
    '- novaGroup: 1~4 (위 한국형 NOVA 순서로 판단)\n' +
    '- judgmentReason: 해당 그룹으로 판단한 이유 (한두 문장)\n' +
    '- concernIngredients: 주의 원재료 최대 3개. [{"name":"","explanation":""}]. 없으면 []\n' +
    '- briefDescription: 이 식품에 대한 간단한 설명 (한 문장)\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄 이유. 해당 없으면 ""\n' +
    '- consumptionAdvice: 섭취 방법 조언. 예: 하루에 반봉지씩, 우유와 함께 드시면 좋아요. 한두 문장. 없으면 ""\n\n' +
    '응답은 아래 JSON 하나만 출력하세요. 다른 말 없이.\n' +
    '{"productName":"","companyName":"","rawMaterials":"","novaGroup":1~4,"judgmentReason":"","concernIngredients":[{"name":"","explanation":""}],"briefDescription":"","koreanReclassificationNote":"","consumptionAdvice":""}'
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
