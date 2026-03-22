/** 이미지 입력·K-NOVA 통합 판정 (단일 프롬프트·단일 호출) */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

/** 영양표·섭취 안내용 — 맞춤 참고 로직과 동일 원칙 */
export function getNutritionTableRowsRulesBlock(): string {
  return (
    '- **tableRows**(영양표가 보일 때 **필수**): 표에 적힌 **모든** 영양항목을 **위에서 아래 순서**대로 배열. 각 원소는 `{"name":"표의 항목명","amount":"숫자·단위·% 등 라벨 그대로"}`. 열량·나트륨·탄수화물·당류·지방·포화·트랜스·콜레스테롤·단백질·식이섬유뿐 아니라 **칼슘·철·비타민A·비타민D·비타민C 등** 표에 있는 줄은 **전부** 넣는다. `caloriesKcal` 등 숫자 필드와 **내용이 겹쳐도** tableRows에 한 줄씩 반드시 포함한다. 표가 없거나 판독 불가면 nutrition은 null( tableRows 없음).\n'
  );
}

export function getNutritionServingUnitRulesBlock(): string {
  return (
    '[섭취·포장 단위 — 반드시 준수]\n' +
    '포장 단위와 섭취 단위가 다를 수 있다. 낱개 수나 1회 제공량이 불명확하면 포장 개수로 추정하지 말고 총 내용량 또는 중량 기준으로 계산하라.\n' +
    '- **통·봉지·박스·(액체의) 병·캔**은 판매 단위일 수 있다. **1통=1회 섭취**로 가정하지 말 것. 캔디·껌·목캔디·정제형·작은 알갱이 간식은 특히 금지.\n' +
    '- servingSizeText에는 **1회 제공량·개당 중량·총 내용량(g/ml)** 등 표기를 가능한 그대로 넣고, 표 숫자 기준은 basisIsPerServing로 정확히 구분할 것.\n' +
    '- consumptionAdvice에서 **내부 개수 확인 없이** "하루 몇 통·몇 봉지·몇 박스" 식으로 구체적 허용 개수를 쓰지 말 것. 애매하면 중량·1회 제공량 확인을 권하는 보수적 문장만 쓸 것.\n'
  );
}

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
    '[Group IV 세분화 — novaGroup이 4일 때만. novaSubgroup은 **4A·4B·4C 중 정확히 하나**만 출력]\n' +
    '[필수] 판단이 애매할 경우 4B가 아니라 **4A**로 분류한다.\n' +
    '[judgmentReason] Group IV일 때 **한 문장**으로, **원재료 구조(유지·소실)**와 **기능성 재구성 여부**만 짚는다.\n\n' +
    '[강제 우선순위 — 이 순서만 따른다. **4B를 중간 기본값으로 쓰지 않는다**]\n' +
    '① **재료 기반 음식인가?** 설탕·밀가루·견과·우유·코코아·버터·코코아버터 등 **일반 식품 재료**가 본질이고, 이를 섞어 만든 **음식 형태**(덩어리·반죽·덮음 등)가 유지되는가? 첨가가 레시틴·바닐린 등 **소수**(대략 품질·형태 보조 수준)에 가깝다면 **YES → 4A** (여기서 확정. 4B로 넘어가지 않음).\n' +
    '② ①이 **NO**일 때만: **기능성 재구성 식품**인가? 단맛·저칼로리·단백질 강화 등 **특정 기능**을 위해 성분이 **의도적으로 재구성**되었고, 원재료 **형태·정체성이 사실상 사라졌으며**, 감미료·분리단백·대체당 등 **기능성 성분이 제품의 핵심**이고 **일반 재료 조합만으로는 설명되지 않는가?** → **YES → 4B 후보** (아래 [4B 필수 4조건]을 **모두** 만족할 때만 최종 4B).\n' +
    '③ ①②에 걸리지 않거나 ②가 애매한데, **첨가물이 복잡**하고 **자극적 맛·과식 유도 구조**가 라벨상 뚜렷한가? → **YES → 4C**.\n' +
    '④ 어느 단계에도 명확히 걸리지 않으면 → **4A**.\n\n' +
    '[4B 확정 — **기능성 재구성 식품만** 4B. 아래 **네 가지를 모두** 만족할 때만 4B. **하나라도 부족하면 4B 금지**(4A 또는 4C로 재판단)]\n' +
    '(1) 원재료의 **형태·정체성이 완전히 사라짐**\n' +
    '(2) **특정 기능**(단맛·저칼로리·단백 강화 등)을 위해 성분이 **재구성**됨\n' +
    '(3) **일반적인 “음식 재료 조합”**만으로는 설명되지 않음\n' +
    '(4) **감미료·분리단백·대체당** 등 **기능성 성분이 핵심 구성**임\n\n' +
    '[4A 우선 — 다음에 해당하면 **무조건 4A 우선**(초콜릿·빵·일반 가공식품 기본 4A)]\n' +
    '- 설탕·밀가루·견과·우유·코코아 등 **일반 식품 재료**가 중심이고 **음식 형태**가 남아 있음\n' +
    '- 첨가가 **1~2개 수준**(예: 레시틴) 또는 품질 보조에 그침\n\n' +
    '[대표 예시 — 기준 학습용. 실제 라벨이 다르면 라벨 우선]\n' +
    '- **4A**: 초콜릿, 프랄린(견과·설탕·초콜릿 조합 등 **재료 기반**)\n' +
    '- **4B**: 자일리톨 캔디, 제로·저칼로리가 **본질**인 음료(대체당·감미료 **기능 중심**)\n' +
    '- **4C**: 라면(복합 조미·향·지방), **강한 조미·복합 첨가·과식 유도**가 뚜렷한 과자류\n\n' +
    '[균형] 4A·4B·4C가 한쪽으로 쏠리지 않게 하되, **4B는 위 [4B 필수 4조건]을 통과한 기능성 재구성만**. 애매하면 **4A**.\n\n' +
    '[주의 원재료 선정]\n' +
    '- 최대 3개만 표시. 문제가 될 수 있는 **원재료명/첨가물명**만 선택한다.\n' +
    '- 선정 기준: 초가공 판단 참고 성분(인공 감미료, 색소, 향료·MSG, 유화제, 보존료, 가공전분·고과당옥수수시럽 등).\n' +
    '- **중요: 영양성분명은 금지**(예: 나트륨, 당류, 열량, 탄수화물, 단백질, 지방, 포화지방, 트랜스지방). 이런 항목은 concernIngredients에 넣지 않는다.\n' +
    '- 없으면 0개 또는 1개만 표시하고, 억지로 3개 채우지 않는다.\n' +
    '- 각 성분마다 한 줄 설명. 짧고 쉬운 한국어. "~에 주의가 필요합니다", "~가 많을 수 있습니다"처럼 중립적으로. "위험", "독성", "절대 먹지 말아야 한다" 등 과장·공포 표현 금지.\n\n' +
    '[말투 규칙 — 토스 스타일]\n' +
    '- 짧고 분명하게 말한다. 한 문장은 10~30자 내외를 권장한다.\n' +
    '- 쉬운 생활어를 사용한다. 딱딱한 보고서체·의학전문용어 남발을 피한다.\n' +
    '- 과장·단정·공포 표현을 피하고, 차분하고 친절한 톤을 유지한다.\n' +
    '- judgmentReason: Group IV일 때는 위 [Group IV 세분화]의 **한 문장·원재료/기능성** 규칙을 반드시 따른다. briefDescription/consumptionAdvice/concernIngredients.explanation은 같은 톤으로 쓴다.'
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
    getNutritionServingUnitRulesBlock() +
    '\n' +
    getNutritionTableRowsRulesBlock() +
    '- 영양정보 표가 보이면 nutrition에 숫자 필드와 tableRows를 채웁니다. 없거나 판독 불가면 nutrition은 null로 둡니다.\n' +
    '- 표에 **0kcal·제로칼로리·열량 0** 등으로 나오면 caloriesKcal는 **반드시 숫자 0**(null·빈 문자열 금지).\n' +
    '- **콜레스테롤** 행이 있으면 cholesterolMg에 mg 숫자(0 포함)를 넣습니다. 표에 없으면 null.\n' +
    '- consumptionAdvice: 라벨에 보이는 것만, **짧게 한 문장**(보관·섭취·당·나트륨 중 눈에 띄는 것 하나). 열량만 길게 설명하지 말 것. kcal를 못 읽으면 추측하지 말 것.\n\n' +
    '[2단계 — JSON만 출력]\n' +
    '- productName: 제품명. **완전히 정확한 이름이 명시되지 않았으면 반드시 공란 \"\".** 추측·유추 금지.\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 \"\"\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄, 쉼표 구분. 없으면 \"\"\n' +
    '- novaGroup: 1~4 (한국형 NOVA 순서)\n' +
    '- novaSubgroup: **novaGroup이 4일 때만** \"4A\" | \"4B\" | \"4C\". 그 외는 \"\". **기능성 재구성 식품만 4B**. 애매하면 **4A**. 4C는 복합 첨가·자극 구조가 뚜렷할 때만.\n' +
    '- judgmentReason: **반드시 한 문장**. Group IV면 **원재료 구조(유지·소실)**와 **기능성 여부**만으로 4A/4B/4C 근거를 쓴다.\n' +
    '- concernIngredients: 주의 원재료 최대 3개. [{\"name\":\"\",\"explanation\":\"\"}]. 없으면 []\n' +
    '- briefDescription: 이 식품에 대한 간단한 설명 (한 문장)\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 \"\"\n' +
    '- consumptionAdvice: 라벨 기반 섭취/보관 조언. 한두 문장. 없으면 \"\"\n' +
    '- foodCategory: 위 목록 중 하나\n' +
    '- nutrition: 객체 또는 null. 필드: caloriesKcal, sodiumMg, carbsG, sugarG, proteinG, fatG, saturatedFatG, transFatG, cholesterolMg, dietaryFiberG (식이섬유·g, 없으면 null), servingSizeText, basisIsPerServing, tableRows(위 규칙)\n' +
    '[foodCategory 구분]\n' +
    '- **간식**: 과자·젤리·초콜릿·스낵 등 소량으로 먹는 것 → "달콤한 간식" 또는 "짭짤한 간식". 우유·요거트·푸딩·아이스크림 → "유제품·디저트".\n' +
    '- **한 끼·식사에 가까움**: 컵라면·즉석 도시락·햄버거·샌드위치 등 끼니를 대체하기 쉬운 것 → "간편한 한 끼". 식빵·시리얼·베이글 → "빵·시리얼류".\n' +
    '- **마시는 음료**만 → "음료". 간식과 한 끼를 혼동하지 않는다.\n' +
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
    getNutritionServingUnitRulesBlock() +
    '\n' +
    getNutritionTableRowsRulesBlock() +
    '- 이미지에 영양정보 표가 보이면 숫자 필드와 tableRows를 nutrition에 넣는다. 없거나 판독 불가면 nutrition은 null.\n' +
    '- caloriesKcal: 1회 제공량(또는 표기 기준) 기준 **열량(kcal)**. "약", "~"이 있으면 대표값 하나. **0kcal·제로칼로리·열량 0**이면 **0**을 넣는다(null 금지).\n' +
    '- 나트륨·콜레스테롤은 mg, 탄수화물·당류·단백질·지방·포화지방·트랜스지방·식이섬유는 g 단위로 숫자만.\n' +
    '- servingSizeText: 가능하면 제품 표기 그대로. 예) "1병(355ml)", "1캔(250ml)", "총 내용량 500ml 중 100ml", "1회 30g".\n' +
    '- basisIsPerServing: 표의 숫자가 **1회 제공량(1회 섭취 참고량)** 기준이면 true, 100g/100ml 기준이면 false.\n\n' +
    '[foodCategory]\n' +
    '아래 중 **정확히 하나**의 문자열: "음료", "달콤한 간식", "짭짤한 간식", "간편한 한 끼", "빵·시리얼류", "유제품·디저트".\n' +
    '- **간식**: 과자·젤리·초콜릿·스낵 등 소량 → "달콤한 간식"/"짭짤한 간식". 우유·요거트·푸딩 → "유제품·디저트".\n' +
    '- **한 끼에 가까움**: 컵라·도시락·햄버거·샌드위치 등 → "간편한 한 끼". 식빵·시리얼 → "빵·시리얼류". 마시는 것만 "음료". 간식과 한 끼를 헷갈리지 않는다.\n\n' +
    '[2단계 — JSON만 출력]\n' +
    '- productName: 제품명. **완전히 정확한 이름이 명시되지 않았으면 반드시 공란 "".** 추측·유추 금지.\n' +
    '- companyName: 제조사·수입자. 정확히 보이지 않으면 ""\n' +
    '- rawMaterials: 원재료 표기 전체 한 줄, 쉼표 구분. 없으면 ""\n' +
    '- novaGroup: 1~4 (한국형 NOVA 순서)\n' +
    '- novaSubgroup: **novaGroup이 4일 때만** "4A" | "4B" | "4C". 그 외는 "". **기능성 재구성 식품만 4B**. 애매하면 **4A**. 4C는 복합 첨가·자극 구조가 뚜렷할 때만.\n' +
    '- judgmentReason: **반드시 한 문장**. Group IV면 **원재료 구조·기능성 여부**만으로 4A/4B/4C 근거를 쓴다.\n' +
    '- concernIngredients: 주의 원재료 최대 3개. [{"name":"","explanation":""}]. 없으면 []\n' +
    '- briefDescription: 이 식품에 대한 간단한 설명 (한 문장)\n' +
    '- koreanReclassificationNote: 한국 전통 식품 예외 적용 시 한 줄. 해당 없으면 ""\n' +
    '- consumptionAdvice: 라벨에 보이는 것만 **한 문장**. 열량만 길게 쓰지 말 것. 없으면 ""\n' +
    '- foodCategory: 위 목록 중 하나\n' +
    '- nutrition: 객체 또는 null. 필드: caloriesKcal, sodiumMg, carbsG, sugarG, proteinG, fatG, saturatedFatG, transFatG, cholesterolMg, dietaryFiberG (식이섬유·g, 없으면 null), servingSizeText, basisIsPerServing, tableRows(위 규칙)\n' +
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
