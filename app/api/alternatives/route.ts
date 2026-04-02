import { NextRequest, NextResponse } from 'next/server';
import type { BmiTier } from '@/lib/gemini-prompts';
import {
  engineRecommendationsToAlternativeJson,
  inferFoodType,
  runRecommendationPipeline,
  type RecommendationEngineInput,
} from '@/lib/alternative-recommendation-engine';
import type { AlternativesNutritionPayload } from '@/lib/gemini-alternative-search';

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

    const recs = runRecommendationPipeline(input);
    const alternativeFoodText =
      recs.length > 0 ? JSON.stringify(engineRecommendationsToAlternativeJson(input, recs)) : null;

    return NextResponse.json({
      alternativeFoodText,
      alternativeFoodFromWebSearch: false,
      inferredFoodType: inferFoodType(input),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
