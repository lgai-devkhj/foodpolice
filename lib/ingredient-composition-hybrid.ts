
import {
  generateIngredientProfilesWithAI,
  generateIngredientPriorsWithAI,
  validateEstimatesWithAI,
  type IngredientPriorFromAI,
} from '@/lib/ingredient-composition-ai';
import {
  estimateIngredientCompositionWithExtras,
  type CompositionExtras,
  type IngredientCompositionInput,
  type IngredientCompositionResult,
  type OptimizeAiPriors,
} from '@/lib/ingredient-composition-estimate';

export interface HybridOptions {
  disableAi?: boolean;
  apiKey?: string;
  signal?: AbortSignal;
  profilesTimeoutMs?: number;
  priorsTimeoutMs?: number;
  validateTimeoutMs?: number;
}

function compositionAiFailure(message: string): never {
  throw new Error(`분석에 실패했어요. 다시 시도해 주세요. [${message}]`);
}

function priorsToExtras(
  items: IngredientPriorFromAI[],
  priorsConfidence: number,
): Pick<CompositionExtras, 'aiPriors' | 'typicalHints' | 'aiPriorReasonings' | 'priorsConfidence'> {
  const ranges = items.map((it) => it.expectedRange);
  const roles = items.map((it) => it.role);
  const aiPriors: OptimizeAiPriors = { ranges, roles };
  const typicalHints = items.map((it) => it.typical);
  const aiPriorReasonings = items.map((it) => it.reasoning);
  return { aiPriors, typicalHints, aiPriorReasonings, priorsConfidence };
}

export async function estimateIngredientCompositionHybrid(
  input: IngredientCompositionInput,
  options?: HybridOptions,
): Promise<IngredientCompositionResult> {
  if (options?.disableAi) {
    compositionAiFailure('AI_DISABLED');
  }

  const ingredients = input.ingredients.map((s) => s.trim()).filter(Boolean);
  if (ingredients.length === 0) {
    compositionAiFailure('EMPTY_INGREDIENTS');
  }

  const profiles = await generateIngredientProfilesWithAI(
    {
      ingredients,
      nutritionPer100g: input.nutritionPer100g,
      category: input.category,
    },
    {
      apiKey: options?.apiKey,
      timeoutMs: options?.profilesTimeoutMs ?? 1800,
      signal: options?.signal,
    },
  );

  const profilesOk =
    profiles != null &&
    profiles.items.length === ingredients.length &&
    !profiles.rawModelError &&
    profiles.profilesConfidence > 0.05;
  if (!profilesOk) {
    compositionAiFailure(profiles?.rawModelError || 'PROFILE_GENERATION');
  }

  let priors = await generateIngredientPriorsWithAI(
    {
      ingredients,
      nutritionPer100g: input.nutritionPer100g,
      category: input.category,
    },
    {
      apiKey: options?.apiKey,
      timeoutMs: options?.priorsTimeoutMs ?? 1800,
      signal: options?.signal,
    },
  );

  const priorsOk =
    priors != null &&
    priors.items.length === ingredients.length &&
    !priors.rawModelError &&
    priors.priorsConfidence > 0.05;

  let extras: CompositionExtras = { aiUsed: false };
  if (profilesOk && profiles) {
    extras.aiIngredientProfiles = profiles.items.map((it) => ({
      fat: it.fat,
      carbs: it.carbs,
      sugars: it.sugars,
      protein: it.protein,
      water: it.water,
    }));
    extras.aiUsed = true;
  }
  if (priorsOk && priors) {
    extras = {
      ...extras,
      aiUsed: true,
      ...priorsToExtras(priors.items, priors.priorsConfidence),
      priorsConfidence: priors.priorsConfidence,
    };
  }

  const base = estimateIngredientCompositionWithExtras(input, extras);

  if (!extras.aiUsed) {
    return base;
  }

  const p = base.ingredientsEstimate.map((r) => r.estimatedPercent);
  const nutritionForValidate = input.nutritionPer100g;
  const val = await validateEstimatesWithAI(
    ingredients,
    input.category,
    nutritionForValidate,
    p,
    {
      apiKey: options?.apiKey,
      timeoutMs: options?.validateTimeoutMs ?? 1500,
      signal: options?.signal,
    },
  );

  if (!val || val.rawModelError) {
    return base;
  }

  return estimateIngredientCompositionWithExtras(input, {
    ...extras,
    validateResult: val,
  });
}
