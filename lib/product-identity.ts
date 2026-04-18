import { productIdentityCore } from '@/lib/alternative-food-json';

type ProductLike = {
  product?: { productName?: string; companyName?: string | null } | null;
};

/** 같은 상품 재분석·재비교 판별용(제품명 코어 + 제조사 소문자) */
export function analysisProductIdentityKey(result: ProductLike): string {
  const name = (result.product?.productName || '').trim();
  const co = (result.product?.companyName || '').trim().toLowerCase();
  const core = productIdentityCore(name);
  return `${core}|${co}`;
}

/** 비교 두 제품 쌍(순서 무관) */
export function comparePairIdentityKey(a: ProductLike, b: ProductLike): string {
  const ka = analysisProductIdentityKey(a);
  const kb = analysisProductIdentityKey(b);
  return ka <= kb ? `${ka}@@${kb}` : `${kb}@@${ka}`;
}
