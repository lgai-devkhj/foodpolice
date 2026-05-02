/**
 * 식품 분류 등 도메인 상수의 단일 정의.
 * 프롬프트·검증·클라이언트가 같은 문자열을 쓰도록 여기서만 수정하면 돼요.
 */

/** Gemini `foodCategory` 및 앱 전반에서 쓰는 정규 카테고리 (프롬프트 노출 순서와 동일). */
export const FOOD_CATEGORY_LABELS = [
  '음료',
  '달콤한 간식',
  '짭짤한 간식',
  '간편한 한 끼',
  '빵·시리얼류',
  '유제품·디저트',
] as const;

export type FoodCategoryLabel = (typeof FOOD_CATEGORY_LABELS)[number];

export const FOOD_CATEGORY_LABEL_SET = new Set<string>(FOOD_CATEGORY_LABELS);

export function isCanonicalFoodCategory(value: string): boolean {
  return FOOD_CATEGORY_LABEL_SET.has(value);
}

/** `[foodCategory]` 블록에서 카테고리 열거 다음에 붙는 안내 줄. */
export const FOOD_CATEGORY_PROMPT_GUIDANCE_LINES = [
  '- 과자, 젤리, 초콜릿, 스낵 등 소량 간식은 "달콤한 간식" 또는 "짭짤한 간식"이에요.',
  '- 우유, 요거트, 푸딩, 아이스크림은 "유제품·디저트"예요.',
  '- 컵라면, 즉석도시락, 햄버거, 샌드위치 등 끼니 대체형은 "간편한 한 끼"예요.',
  '- 식빵, 시리얼, 베이글은 "빵·시리얼류"예요.',
  '- 마시는 것만 "음료"예요.',
  '- 애매하면 실제 섭취 형태를 기준으로 하나만 골라요.',
] as const;
