import {
  estimateIngredientComposition,
  type IngredientCompositionInput,
  INGREDIENT_ESTIMATE_LIMITATIONS,
} from './ingredient-composition-estimate';

export const sampleIcecreamInput: IngredientCompositionInput = {
  ingredients: ['크림', '탈지우유', '설탕', '난황'],
  nutritionPer100g: { fat: 17, carbs: 20, sugars: 18, protein: 4 },
  knownPercents: {},
  category: 'icecream',
  servingBasis: '100g',
};

export const sampleDrinkInput: IngredientCompositionInput = {
  ingredients: ['정제수', '액상과당', '오렌지농축액', '구연산'],
  nutritionPer100g: { fat: 0, carbs: 11, sugars: 10, protein: 0 },
  knownPercents: {},
  category: 'drink',
  servingBasis: '100ml',
  densityGPerMl: 1.04,
};

export const sampleSnackInput: IngredientCompositionInput = {
  ingredients: ['밀가루', '설탕', '팜유', '코코아분말', '탈지분유', '딸기퓨레', '초코칩'],
  nutritionPer100g: { fat: 24, carbs: 62, sugars: 28, protein: 5.5 },
  knownPercents: { 딸기퓨레: 12, 초코칩: 8 },
  category: 'snack',
  servingBasis: '100g',
};

export function runSampleEstimates(): void {
  const samples: { name: string; input: IngredientCompositionInput }[] = [
    { name: 'icecream', input: sampleIcecreamInput },
    { name: 'drink_100ml', input: sampleDrinkInput },
    { name: 'snack_known', input: sampleSnackInput },
  ];
  for (const { name, input } of samples) {
    const r = estimateIngredientComposition(input);
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify({ summary: r.summary, totalError: r.totalError, warnings: r.warnings }, null, 2));
    console.log(JSON.stringify(r.ingredientsEstimate, null, 2));
  }
  console.log('\n[한계]', INGREDIENT_ESTIMATE_LIMITATIONS);
}
