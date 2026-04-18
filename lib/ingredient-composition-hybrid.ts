/**
 * 수식 최적화 + AI priors·검증 하이브리드 (AI는 비율 직접 산출 안 함).
 */

import {
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
  /** true면 AI 호출 없이 수식만 */
  disableAi?: boolean;
  apiKey?: string;
  signal?: AbortSignal;
  /** priors 호출 타임아웃(ms) */
  priorsTimeoutMs?: number;
  /** 검증 호출 타임아웃(ms) */
  validateTimeoutMs?: number;
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

/**
 * 1) 라벨 입력 — 2) AI priors — 3) 수식 최적화 — 4) AI 검증·설명
 * API 키 없거나 실패 시 수식 전용으로 폴백합니다.
 */
export async function estimateIngredientCompositionHybrid(
  input: IngredientCompositionInput,
  options?: HybridOptions,
): Promise<IngredientCompositionResult> {
  if (options?.disableAi) {
    return estimateIngredientCompositionWithExtras(input, undefined);
  }

  const ingredients = input.ingredients.map((s) => s.trim()).filter(Boolean);
  if (ingredients.length === 0) {
    return estimateIngredientCompositionWithExtras(input, undefined);
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
  if (priorsOk && priors) {
    extras = {
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
  const nutritionForValidate = base._debug?.nutritionTarget ?? input.nutritionPer100g;
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
