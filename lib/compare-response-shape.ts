export function extractCompareProductPair(
  parsed: Record<string, unknown>,
): { productA: Record<string, unknown>; productB: Record<string, unknown> } | null {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  const toObj = (v: unknown): Record<string, unknown> | null => {
    if (isObj(v)) return v;
    if (typeof v !== 'string') return null;
    const s = v.trim();
    if (!s) return null;
    try {
      const j = JSON.parse(s) as unknown;
      return isObj(j) ? j : null;
    } catch {
      return null;
    }
  };

  const tryPair = (a: unknown, b: unknown) => {
    const ao = toObj(a);
    const bo = toObj(b);
    if (!ao || !bo) return null;
    return { productA: ao, productB: bo };
  };

  const direct = tryPair(parsed.productA, parsed.productB);
  if (direct) return direct;

  const snake = tryPair(parsed.product_a, parsed.product_b);
  if (snake) return snake;

  const pascal = tryPair(parsed.ProductA, parsed.ProductB);
  if (pascal) return pascal;

  const ab = tryPair(parsed.A, parsed.B);
  if (ab) return ab;

  const oneTwo = tryPair(parsed.product1, parsed.product2);
  if (oneTwo) return oneTwo;

  const firstSecond = tryPair(parsed.first, parsed.second);
  if (firstSecond) return firstSecond;

  const leftRight = tryPair(parsed.left, parsed.right);
  if (leftRight) return leftRight;

  const korean = tryPair(parsed['제품A'], parsed['제품B']) ?? tryPair(parsed['상품A'], parsed['상품B']);
  if (korean) return korean;

  const items = parsed.items;
  if (Array.isArray(items) && items.length >= 2) {
    const p = tryPair(items[0], items[1]);
    if (p) return p;
  }

  const products = parsed.products;
  if (Array.isArray(products) && products.length >= 2) {
    const p = tryPair(products[0], products[1]);
    if (p) return p;
  }

  const results = parsed.results;
  if (Array.isArray(results) && results.length >= 2) {
    const p = tryPair(results[0], results[1]);
    if (p) return p;
  }

  const entries = parsed.entries;
  if (Array.isArray(entries) && entries.length >= 2) {
    const p = tryPair(entries[0], entries[1]);
    if (p) return p;
  }

  // flat 구조 복구: productNameA / rawMaterialsA / ... + productNameB / ... 형태를 쪼개기
  const aFlat: Record<string, unknown> = {};
  const bFlat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const m = /^(.*?)(?:_)?([AaBb])$/.exec(k);
    if (!m) continue;
    const base = m[1];
    if (!base) continue;
    if (m[2] === 'A' || m[2] === 'a') aFlat[base] = v;
    else bFlat[base] = v;
  }
  if (Object.keys(aFlat).length > 0 && Object.keys(bFlat).length > 0) {
    const p = tryPair(aFlat, bFlat);
    if (p) return p;
  }

  const nestedKeys = ['data', 'comparison', 'compare', 'output', 'response', 'result'];
  for (const k of nestedKeys) {
    const inner = parsed[k];
    if (isObj(inner)) {
      const sub = extractCompareProductPair(inner);
      if (sub) return sub;
    }
  }

  return null;
}
