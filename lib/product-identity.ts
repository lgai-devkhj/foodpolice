import { productIdentityCore } from '@/lib/alternative-food-json';

type ProductLike = {
  product?: { productName?: string; companyName?: string | null } | null;
};

export function analysisProductIdentityKey(result: ProductLike): string {
  const name = (result.product?.productName || '').trim();
  const co = (result.product?.companyName || '').trim().toLowerCase();
  const core = productIdentityCore(name);
  return `${core}|${co}`;
}

export function comparePairIdentityKey(a: ProductLike, b: ProductLike): string {
  const ka = analysisProductIdentityKey(a);
  const kb = analysisProductIdentityKey(b);
  return ka <= kb ? `${ka}@@${kb}` : `${kb}@@${ka}`;
}
