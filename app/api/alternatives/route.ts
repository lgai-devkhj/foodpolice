import { NextRequest, NextResponse } from 'next/server';
import type { BmiTier } from '@/lib/gemini-prompts';
import {
  inferFoodType,
  type RecommendationEngineInput,
} from '@/lib/alternative-recommendation-engine';
import {
  type AlternativesNutritionPayload,
  buildAlternativeFoodWebSearchPrompt,
  buildNutritionHintForAlternatives,
  fetchAlternativesWithPerplexity,
} from '@/lib/gemini-alternative-search';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface AlternativesBody {
  productName?: string;
  companyName?: string;
  foodCategory?: string | null;
  novaGroup?: number;
  novaSubgroup?: string | null;
  briefDescription?: string | null;
  rawMaterials?: string;
  nutrition?: AlternativesNutritionPayload | null;
  concernIngredients?: Array<{ name?: string; explanation?: string }> | null;
  bmiTier?: BmiTier | null;
}

function isBmiTier(v: unknown): v is BmiTier {
  return (
    v === 'underweight' ||
    v === 'normal' ||
    v === 'overweight' ||
    v === 'obese'
  );
}

export async function POST(request: NextRequest) {
  try {
    const body: AlternativesBody = await request.json();
    const novaGroup = Math.min(4, Math.max(1, parseInt(String(body.novaGroup), 10) || 4));

    const input: RecommendationEngineInput = {
      productName: (body.productName || '').trim(),
      companyName: body.companyName?.trim() ?? null,
      foodCategory: body.foodCategory ?? null,
      novaGroup,
      novaSubgroup: body.novaSubgroup ? String(body.novaSubgroup).trim().toUpperCase() : null,
      briefDescription: body.briefDescription ? String(body.briefDescription).trim() : null,
      rawMaterials: (body.rawMaterials || '').trim(),
      nutrition: body.nutrition ?? null,
      concernIngredients: body.concernIngredients ?? null,
      bmiTier: isBmiTier(body.bmiTier) ? body.bmiTier : null,
    };

    const inferredFoodType = inferFoodType(input);
    const perplexityKey = process.env.PERPLEXITY_API_KEY?.trim() ?? '';

    if (perplexityKey.length === 0) {
      return NextResponse.json({
        alternativeFoodText: null,
        alternativeFoodFromWebSearch: false,
        inferredFoodType,
      });
    }

    const scanned = input.productName;
    const webJson = await fetchAlternativesWithPerplexity(
      perplexityKey,
      buildAlternativeFoodWebSearchPrompt({
        productName: scanned,
        companyName: input.companyName ?? '',
        foodCategory: input.foodCategory ?? null,
        novaGroup: input.novaGroup,
        novaSubgroup: input.novaSubgroup ?? null,
        briefDescription: input.briefDescription ?? null,
        rawMaterials: input.rawMaterials ?? '',
        nutritionHint: buildNutritionHintForAlternatives(body.nutrition ?? null),
        bmiTier: input.bmiTier ?? null,
      }),
      scanned,
      {
        rawMaterials: input.rawMaterials ?? '',
        foodCategory: input.foodCategory ?? null,
      }
    );

    return NextResponse.json({
      alternativeFoodText: webJson,
      alternativeFoodFromWebSearch: Boolean(webJson),
      inferredFoodType,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해 주세요.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
