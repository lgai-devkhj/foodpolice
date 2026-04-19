/**
 * Gemini 1차 호출: 이미지에서 텍스트만 추출 (판정 없음).
 */
export function buildFastGeminiOcrPrompt(hasTwoImages: boolean): string {
  const ctx = hasTwoImages
    ? '이미지 두 장: 첫 장은 원재료·성분, 둘째 장은 영양정보표(있으면). 보이는 글자를 순서대로 옮긴다.'
    : '식품 패키지 이미지에서 보이는 글자를 읽는다.';
  return [
    '역할: OCR만 수행한다. 가공도·추천·해석 금지.',
    ctx,
    '출력: JSON 한 객체만. 다른 텍스트·마크다운 금지.',
    '스키마: {"extractedText":"이미지에서 읽은 전체 텍스트(줄바꿈 \\n 허용)"}',
    '읽기 어렵거나 없으면 extractedText는 빈 문자열.',
  ].join('\n');
}

/**
 * Gemini 2차 호출: OCR 텍스트 보정·판정 — 입력은 텍스트 전용(이미지 없음).
 */
export function buildFastAnalysisUserPromptFromOcrText(ocrText: string, hasTwoImages: boolean): string {
  const hint = hasTwoImages
    ? '아래 텍스트는 원재료 이미지 OCR과 영양표 이미지 OCR을 이어 붙인 것이다.'
    : '아래 텍스트는 패키지 라벨 OCR 결과다.';
  return [
    '역할: 아래 OCR 텍스트는 글자가 깨지거나 오타가 있을 수 있다. 문맥·식품 라벨 상식으로 읽기 좋게 보정한 뒤, 그 내용을 바탕으로 가공도와 주의 성분을 판단한다.',
    '보정이 불가능한 부분은 원문에 가깝게 두되, 분류·flaggedIngredients 판단에는 보정된 의미를 사용한다.',
    hint,
    '--- OCR 시작 ---',
    ocrText.trim().slice(0, 24000),
    '--- OCR 끝 ---',
    '출력: JSON 한 객체만. 설명 문장·마크다운 금지.',
    '스키마:',
    '{"productName":"…","processingLevel":"…","flaggedIngredients":["…"],"correctedOcrText":"…"}',
    'productName: 라벨에서 읽은 대표 식품명(짧게, 120자 이내). 확실하지 않으면 빈 문자열 "".',
    'processingLevel: "1","2","3","4A","4B","4C" 중 하나.',
    'flaggedIngredients: 주의 성분명 최대 2개(보정된 표기로), 없으면 [].',
    'correctedOcrText 규칙:',
    '- OCR에 보이는 글자·숫자·단위(kcal, g, mg 등)를 우선 살리고, 깨진 글자·오타만 문맥상 고친다.',
    '- "[정보 불명]", "정보 없음", "불명", "해당 없음" 같은 플레이스홀더는 절대 쓰지 말 것. 읽기 어려운 줄은 생략하거나 OCR 원문을 유지한다.',
    '- 라벨을 "제품명: … 원재료명: …"처럼 양식에 맞춰 새로 짜지 말고, 실제 패키지 문구 순서에 가깝게 줄만 다듬는다.',
    '- 너무 길면 앞부분 위주. 정말 보정할 내용이 없으면 correctedOcrText는 빈 문자열 "".',
    '위 네 키만 사용하고 다른 키는 넣지 말 것.',
  ].join('\n');
}
