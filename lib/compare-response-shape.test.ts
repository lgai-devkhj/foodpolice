import { describe, it, expect } from 'vitest';
import { extractCompareProductPair } from './compare-response-shape';

describe('extractCompareProductPair', () => {
  it('camelCase productA/B', () => {
    const r = extractCompareProductPair({
      productA: { x: 1 },
      productB: { y: 2 },
    });
    expect(r?.productA).toEqual({ x: 1 });
    expect(r?.productB).toEqual({ y: 2 });
  });

  it('snake_case', () => {
    const r = extractCompareProductPair({
      product_a: { a: 1 },
      product_b: { b: 2 },
    });
    expect(r?.productA).toEqual({ a: 1 });
    expect(r?.productB).toEqual({ b: 2 });
  });

  it('products 배열', () => {
    const r = extractCompareProductPair({
      products: [{ n: 1 }, { n: 2 }],
    });
    expect(r?.productA).toEqual({ n: 1 });
    expect(r?.productB).toEqual({ n: 2 });
  });

  it('data 중첩', () => {
    const r = extractCompareProductPair({
      data: { productA: { k: 1 }, productB: { k: 2 } },
    });
    expect(r?.productA).toEqual({ k: 1 });
    expect(r?.productB).toEqual({ k: 2 });
  });
});
