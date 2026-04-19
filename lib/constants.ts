export const NOVA_NAMES: Record<number, string> = {
  1: '1단계 · 비가공·최소 가공',
  2: '2단계 · 조리용 가공 재료',
  3: '3단계 · 가공 식품',
  4: '4단계 · 초가공 식품',
};

/** 프로젝트 내 업로드 이미지 (public/images/) — 드라이브 미사용 */
export const NOVA_IMG: Record<number, string> = {
  1: '/images/nova-1.svg',
  2: '/images/nova-2.svg',
  3: '/images/nova-3.svg',
  4: '/images/nova-4.svg',
};

export const NOVA_SHORT_REASON: Record<number, string> = {
  1: '자연 상태, 원재료 구조 유지',
  2: '조리용 재료',
  3: '원재료 특성 유지',
  4: '원재료 구조 상실, 산업적 첨가물 다수 포함 등',
};

/** 4단계(초가공) 세분 (한국형 NOVA 보조 표기) */
export const NOVA_SUBGROUP_NAMES: Record<string, string> = {
  '4A': '4A · 경계형 초가공',
  '4B': '4B · 명확한 초가공',
  '4C': '4C · 고도 초가공',
};

export const NOVA_SUBGROUP_HINTS: Record<string, string> = {
  '4A': '고당·고지·고염·저영양 구조가 약하거나, 과식 유도·자연식 대체 구조가 덜한 편으로 볼 수 있어요.',
  '4B': '맛 조작 첨가물·강한 제품 느낌 등으로 초가공 특성이 분명한 편이에요.',
  '4C': '당·염·지방이 매우 높고 첨가물이 복합적이며, 자극적 맛으로 과식하기 쉬운 구조에 가까워요.',
};

/** 촬영 단계·촬영 팁 시트 — 원재료 / 영양표 예시 각 2장 (public/images/) */
export const CAPTURE_GUIDE_INGREDIENT_EXAMPLES = [
  '/images/ingredient1.png',
  '/images/ingredient2.jpg',
] as const;
export const CAPTURE_GUIDE_NUTRIENT_EXAMPLES = [
  '/images/nutrient1.png',
  '/images/nutrient2.jpg',
] as const;

/** HTML `<link rel="preload" as="image">`·클라이언트 워밍용 — 촬영 예시·NOVA·QR 등 */
export const PUBLIC_IMAGE_PRELOAD_HREFS: readonly string[] = Array.from(
  new Set<string>([
    ...Object.values(NOVA_IMG),
    ...CAPTURE_GUIDE_INGREDIENT_EXAMPLES,
    ...CAPTURE_GUIDE_NUTRIENT_EXAMPLES,
    '/images/qrcode.png',
  ]),
);

export const STORE_PREFIX = 'fp_state_v1_';
