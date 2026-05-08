import { NextRequest, NextResponse } from 'next/server';
import type { BmiTier } from '@/lib/gemini-prompts';
import {
  engineRecommendationsToAlternativeJson,
  inferFoodType,
  runRecommendationPipeline,
  type RecommendationEngineInput,
} from '@/lib/alternative-recommendation-engine';
import {
  type AlternativesNutritionPayload,
  buildAlternativeFoodWebSearchPrompt,
  buildNutritionHintForAlternatives,
  fetchAlternativesWithPerplexity,
} from '@/lib/gemini-alternative-search';
import { apiErrorBody } from '@/lib/read-api-json';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 본문 전체 문자 수 상한 (메타데이터만 오므로 과도한 페이로드 차단). */
const ALTERNATIVES_MAX_BODY_CHARS = 300_000;
const MIN_CLIENT_ID_LEN = 8;
const ENABLE_ENGINE_FALLBACK = process.env.ALTERNATIVES_ENGINE_FALLBACK === '1';

export type AlternativeUnavailableReason = 'NO_SEARCH_KEY' | 'FETCH_FAILED' | 'NO_MATCH';

interface AlternativesBody {
  clientId?: string;
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

function bodyToInput(body: AlternativesBody): RecommendationEngineInput {
  const novaGroup = Math.min(4, Math.max(1, parseInt(String(body.novaGroup), 10) || 4));
  return {
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
}

function engineFallbackResponse(input: RecommendationEngineInput) {
  if (!ENABLE_ENGINE_FALLBACK) return null;
  const inferredFoodType = inferFoodType(input);
  const recs = runRecommendationPipeline(input);
  if (recs.length === 0) return null;
  const root = engineRecommendationsToAlternativeJson(input, recs);
  return NextResponse.json({
    alternativeFoodText: JSON.stringify(root),
    alternativeFoodFromWebSearch: false,
    alternativeFoodEngineFallback: true,
    inferredFoodType,
    alternativeUnavailableReason: null,
  });
}

export async function POST(request: NextRequest) {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json(apiErrorBody('요청 본문을 읽을 수 없어요.', 'BODY_READ'), { status: 400 });
  }

  if (raw.length > ALTERNATIVES_MAX_BODY_CHARS) {
    return NextResponse.json(
      apiErrorBody('요청이 너무 커요. 다시 시도해요.', 'PAYLOAD_TOO_LARGE'),
      { status: 413 },
    );
  }

  let body: AlternativesBody;
  try {
    body = JSON.parse(raw) as AlternativesBody;
  } catch {
    return NextResponse.json(
      apiErrorBody('요청 본문을 읽을 수 없어요.', 'BODY_JSON'),
      { status: 400 },
    );
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (!clientId || clientId.length < MIN_CLIENT_ID_LEN) {
    return NextResponse.json(
      apiErrorBody('잠깐만요, 이 기기 정보가 없어요.', 'BAD_CLIENT_ID'),
      { status: 400 },
    );
  }

  const input = bodyToInput(body);

  try {
    const inferredFoodType = inferFoodType(input);
    const perplexityKey = process.env.PERPLEXITY_API_KEY?.trim() ?? '';

    if (perplexityKey.length === 0) {
      return NextResponse.json({
        alternativeFoodText: null,
        alternativeFoodFromWebSearch: false,
        alternativeFoodEngineFallback: false,
        inferredFoodType,
        alternativeUnavailableReason: 'NO_SEARCH_KEY',
      });
    }

    const scanned = input.productName;
    const plex = await fetchAlternativesWithPerplexity(
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
      },
    );

    let payloadJson = plex.json;
    let fromWebSearch = Boolean(payloadJson);
    let engineFallback = false;
    let unavailable: AlternativeUnavailableReason | null = null;

    if (!payloadJson) {
      const recs = runRecommendationPipeline(input);
      if (ENABLE_ENGINE_FALLBACK && recs.length > 0) {
        const root = engineRecommendationsToAlternativeJson(input, recs);
        payloadJson = JSON.stringify(root);
        engineFallback = true;
        fromWebSearch = false;
      } else if (plex.perplexityTransportFailed) {
        unavailable = 'FETCH_FAILED';
      } else {
        unavailable = 'NO_MATCH';
      }
    }

    return NextResponse.json({
      alternativeFoodText: payloadJson,
      alternativeFoodFromWebSearch: fromWebSearch && !engineFallback,
      alternativeFoodEngineFallback: engineFallback,
      inferredFoodType,
      alternativeUnavailableReason: unavailable,
    });
  } catch (e) {
    const fallback = engineFallbackResponse(input);
    if (fallback) return fallback;
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해요.';
    return NextResponse.json(apiErrorBody(message, 'ALTERNATIVES_ERROR'), { status: 500 });
  }
}
