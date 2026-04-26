import { describe, expect, it } from 'vitest';
import {
  estimateIngredientComposition,
  normalizeIngredientName,
  predictNutritionFromEstimates,
  getIngredientProfile,
  generateInitialEstimates,
  optimizeIngredientPercents,
} from './ingredient-composition-estimate';
import { sampleIcecreamInput, sampleDrinkInput, sampleSnackInput } from './ingredient-composition-estimate.samples';

describe('normalizeIngredientName', () => {
  it('maps Korean aliases', () => {
    expect(normalizeIngredientName('유크림')).toBe('cream');
    expect(normalizeIngredientName('백설탕')).toBe('sugar');
    expect(normalizeIngredientName('탈지우유분말')).toBe('skim_milk_powder');
  });
});

describe('getIngredientProfile', () => {
  it('returns category-specific profile', () => {
    const p = getIngredientProfile('cream', 'icecream');
    expect(p.fat).toBeGreaterThan(30);
  });
});

describe('estimateIngredientComposition', () => {
  it('sums to ~100% and matches icecream sample shape', () => {
    const r = estimateIngredientComposition(sampleIcecreamInput);
    const s = r.ingredientsEstimate.reduce((a, x) => a + x.estimatedPercent, 0);
    expect(s).toBeGreaterThan(99);
    expect(s).toBeLessThan(101);
    expect(r.ingredientsEstimate.length).toBe(4);
  });

  it('100ml drink returns estimate rows', () => {
    const r = estimateIngredientComposition(sampleDrinkInput);
    expect(r.ingredientsEstimate.length).toBe(sampleDrinkInput.ingredients.length);
  });

  it('knownPercents fix listed items', () => {
    const r = estimateIngredientComposition(sampleSnackInput);
    const choc = r.ingredientsEstimate.find((x) => x.name.includes('초코'));
    const straw = r.ingredientsEstimate.find((x) => x.name.includes('딸기'));
    expect(choc?.estimatedPercent).toBeCloseTo(8, 0);
    expect(straw?.estimatedPercent).toBeCloseTo(12, 0);
  });
});

describe('predictNutritionFromEstimates', () => {
  it('linear blend', () => {
    const profiles = [getIngredientProfile('sugar', 'icecream'), getIngredientProfile('water', 'icecream')];
    const n = predictNutritionFromEstimates([50, 50], profiles);
    expect(n.carbs).toBeCloseTo(50, 5);
  });
});

describe('optimizeIngredientPercents', () => {
  it('respects fixed indices', () => {
    const profiles = [
      getIngredientProfile('cream', 'icecream'),
      getIngredientProfile('sugar', 'icecream'),
    ];
    const fixed = new Map<number, number>([[0, 40]]);
    const p0 = generateInitialEstimates(2, 'icecream', fixed, ['cream', 'sugar']);
    const out = optimizeIngredientPercents(
      p0,
      profiles,
      { fat: 20, carbs: 25, sugars: 22, protein: 3 },
      fixed,
    );
    expect(out[0]).toBeCloseTo(40, 1);
  });
});
