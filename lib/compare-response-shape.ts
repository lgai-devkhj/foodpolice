/**
 * 비교 API JSON 루트에서 productA·productB 객체를 꺼낸다.
 * 모델마다 키 표기가 달라 COMPARE_SHAPE 오류가 나는 경우를 줄인다.
 */
export function extractCompareProductPair(
  parsed: Record<string, unknown>,
): { productA: Record<string, unknown>; productB: Record<string, unknown> } | null {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  const tryPair = (a: unknown, b: unknown) => {
    if (!isObj(a) || !isObj(b)) return null;
    return { productA: a, productB: b };
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
