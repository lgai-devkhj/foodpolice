export const NOVA_NAMES: Record<number, string> = {
  1: 'Group I (비가공·최소 가공)',
  2: 'Group II (조리용 가공 재료)',
  3: 'Group III (가공 식품)',
  4: 'Group IV (초가공 식품)',
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

export const PHOTO_GUIDE_EXAMPLE_URL = '/images/photo-guide-example.jpg';

export const STORE_PREFIX = 'fp_state_v1_';
