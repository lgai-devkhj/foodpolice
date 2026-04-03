import { describe, expect, it } from 'vitest';
import {
  inferFoodType,
  isDuplicateOrSameProduct,
  runRecommendationPipeline,
  type RecommendationEngineInput,
} from '@/lib/alternative-recommendation-engine';

const honeyBase: RecommendationEngineInput = {
  productName: '오리온 달콤왕 꿀땅콩',
  companyName: '오리온',
  foodCategory: '달콤한 간식',
  novaGroup: 4,
  novaSubgroup: '4C',
  rawMaterials: '땅콩, 설탕, 물엿, 식물성유지, 꿀, 혼합분유, 식염 등',
  briefDescription: '코팅 견과 스낵',
  nutrition: { sugarG: 12, sodiumMg: 120 },
  concernIngredients: [{ name: '물엿' }, { name: '설탕' }],
  bmiTier: 'normal',
};

describe('inferFoodType', () => {
  it('classifies honey peanut snack', () => {
    expect(inferFoodType(honeyBase)).toBe('sweet_nut_snack');
  });

  it('classifies cola', () => {
    expect(
      inferFoodType({
        productName: '코카콜라 500ml',
        foodCategory: '음료',
        novaGroup: 4,
        novaSubgroup: '4B',
        rawMaterials: '물, 설탕, 이산화탄소',
        nutrition: { sugarG: 52 },
      })
    ).toBe('sweet_carbonated_drink');
  });
});

describe('isDuplicateOrSameProduct', () => {
  it('flags another brand honey peanut as duplicate', () => {
    expect(
      isDuplicateOrSameProduct(
        { productName: '꿀땅콩', rawMaterials: '땅콩, 꿀' },
        { name: '롯데 꿀땅콩 스낵' }
      )
    ).toBe(true);
  });

  it('does not flag plain roasted peanut line as honey duplicate', () => {
    expect(
      isDuplicateOrSameProduct(
        { productName: '오리온 꿀땅콩', rawMaterials: '땅콩, 꿀' },
        { name: '소금 적은 볶음 땅콩(꿀·코팅 없음)' }
      )
    ).toBe(false);
  });
});

describe('runRecommendationPipeline — 꿀땅콩', () => {
  it('never recommends honey or brand-honey peanut; suggests nut-forward alternatives', () => {
    const recs = runRecommendationPipeline(honeyBase);
    expect(recs.length).toBeGreaterThanOrEqual(1);
    for (const r of recs) {
      expect(r.name).not.toMatch(/꿀땅콩|허니땅콩/i);
      expect(r.name.toLowerCase()).not.toMatch(/honey\s*peanut|honey\s*roast/i);
    }
    const joined = recs.map((r) => r.name).join(' ');
    expect(joined).toMatch(/무가당|견과|아몬드|믹스|볶음|저당|소금|산과천|커클랜드|오뚜기|땅콩|볶음땅콩/);
  });
});

describe('runRecommendationPipeline — 콜라', () => {
  it('avoids 일반 설탕 콜라만 추천; 제로·탄산수·무가당 음료·실제 제품명 위주', () => {
    const recs = runRecommendationPipeline({
      productName: '코카콜라',
      foodCategory: '음료',
      novaGroup: 4,
      novaSubgroup: '4C',
      rawMaterials: '물, 설탕, …',
      nutrition: { sugarG: 27, sodiumMg: 20 },
    });
    expect(recs.length).toBeGreaterThanOrEqual(1);
    for (const r of recs) {
      expect(r.name).not.toMatch(/^콜라$/i);
      if (/(코카콜라|펩시콜라|펩시\s*콜라)(?!.*제로)/i.test(r.name)) {
        expect(r.name).toMatch(/제로|무가당|zero|제로슈거/i);
      }
    }
    const joined = recs.map((r) => r.name).join(' ');
    expect(joined).toMatch(/제로|탄산|무가당|사이다|초정|보리|옥수수|트레비|밀키스|나랑드/);
  });
});
