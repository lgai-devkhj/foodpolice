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

  const unwrapEntry = (v: unknown): Record<string, unknown> | null => {
    const o = toObj(v);
    if (!o) return null;
    const nested = [
      o.product,
      o.item,
      o.value,
      o.data,
      o.payload,
      o.result,
      o.analysis,
      o.details,
      o.food,
    ];
    for (const n of nested) {
      const nn = toObj(n);
      if (nn) return nn;
    }
    return o;
  };

  const direct = tryPair(parsed.productA, parsed.productB);
  if (direct) return direct;

  const snake = tryPair(parsed.product_a, parsed.product_b);
  if (snake) return snake;

  const pascal = tryPair(parsed.ProductA, parsed.ProductB);
  if (pascal) return pascal;

  const ab = tryPair(parsed.A, parsed.B);
  if (ab) return ab;

  const abLower = tryPair(parsed.a, parsed.b);
  if (abLower) return abLower;

  const oneTwo = tryPair(parsed.product1, parsed.product2);
  if (oneTwo) return oneTwo;

  const firstSecond = tryPair(parsed.first, parsed.second);
  if (firstSecond) return firstSecond;

  const leftRight = tryPair(parsed.left, parsed.right);
  if (leftRight) return leftRight;

  const korean = tryPair(parsed['제품A'], parsed['제품B']) ?? tryPair(parsed['상품A'], parsed['상품B']);
  if (korean) return korean;

  const tryArrayPair = (arr: unknown) => {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const p = tryPair(unwrapEntry(arr[0]), unwrapEntry(arr[1]));
    if (p) return p;
    // name/label이 A/B인 형태 복구
    const norm = (x: unknown): string =>
      String(x ?? '')
        .trim()
        .toUpperCase();
    let aObj: Record<string, unknown> | null = null;
    let bObj: Record<string, unknown> | null = null;
    for (const e of arr) {
      const eo = toObj(e);
      if (!eo) continue;
      const tag = norm(eo.name ?? eo.label ?? eo.id ?? eo.key ?? eo.title);
      if (!aObj && (tag === 'A' || tag === 'PRODUCTA' || tag === '제품A' || tag === '상품A')) {
        aObj = unwrapEntry(eo);
      }
      if (!bObj && (tag === 'B' || tag === 'PRODUCTB' || tag === '제품B' || tag === '상품B')) {
        bObj = unwrapEntry(eo);
      }
    }
    return aObj && bObj ? tryPair(aObj, bObj) : null;
  };

  const items = parsed.items;
  if (Array.isArray(items) && items.length >= 2) {
    const p = tryArrayPair(items);
    if (p) return p;
  }

  const products = parsed.products;
  if (Array.isArray(products) && products.length >= 2) {
    const p = tryArrayPair(products);
    if (p) return p;
  }

  const results = parsed.results;
  if (Array.isArray(results) && results.length >= 2) {
    const p = tryArrayPair(results);
    if (p) return p;
  }

  const entries = parsed.entries;
  if (Array.isArray(entries) && entries.length >= 2) {
    const p = tryArrayPair(entries);
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
