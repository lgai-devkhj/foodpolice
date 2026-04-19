import { NextRequest, NextResponse } from 'next/server';
import {
  getCompareFourImagesPrompt,
  type BmiTier,
  type PersonalizationInput,
} from '@/lib/gemini-prompts';
import { DAILY_QUEST_ANALYZE_LABELS } from '@/lib/daily-quests';
import { computeBmiServer } from '@/lib/nutrition-daily';
import { buildAnalysisResultFromGeminiObject } from '@/lib/gemini-product-from-json';
import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
import type { AnalysisResult } from '@/lib/store';
import { formatGeminiHttpError, geminiErrorCodeFromBody } from '@/lib/gemini-http-error';
import { apiErrorBody } from '@/lib/read-api-json';
import {
  getGeminiCandidateText,
  getGeminiPromptBlockReason,
  hasGeminiCandidates,
} from '@/lib/gemini-response-envelope';
import { generationConfigJsonMode, inlineDataPart, textPart } from '@/lib/gemini-rest-body';
import { fetchGeminiGenerateContentWithFlashFallback } from '@/lib/gemini-fetch-with-fallback';
import {
  COMPARE_GEMINI_MODEL,
  COMPARE_MAX_OUTPUT_TOKENS,
  isGemini3FamilyModelId,
} from '@/lib/gemini-models';
import { extractCompareProductPair } from '@/lib/compare-response-shape';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface CompareBody {
  clientId: string;
  aRawImageBase64: string;
  aRawMimeType?: string;
  aNutritionImageBase64: string;
  aNutritionMimeType?: string;
  bRawImageBase64: string;
  bRawMimeType?: string;
  bNutritionImageBase64: string;
  bNutritionMimeType?: string;
  profile?: {
    heightCm?: number;
    weightKg?: number;
    birthYear?: number | null;
    birthDate?: string | null;
    gender?: string | null;
  };
  /** 오늘 일일 미션 식품(8종 중 하나). 있으면 A·B 중 하나라도 일치 시 dailyQuestProductMatch */
  dailyQuestTarget?: string;
}

function profileToPersonalization(
  profile?: CompareBody['profile']
): PersonalizationInput | null {
  const h = profile?.heightCm;
  const w = profile?.weightKg;
  if (h == null || w == null || Number(h) <= 0 || Number(w) <= 0) return null;
  const bmi = computeBmiServer(Number(h), Number(w));
  if (bmi == null) return null;
  let bmiTier: BmiTier =
    bmi < 18.5 ? 'underweight' : bmi <= 22.9 ? 'normal' : bmi <= 24.9 ? 'overweight' : 'obese';
  return { bmiValue: bmi, bmiTier };
}

function normalizeBetterChoice(v: unknown): 'A' | 'B' | 'similar' {
  const s = v != null ? String(v).trim().toUpperCase() : '';
  if (s === 'A' || s === 'B') return s;
  if (s === 'SIMILAR' || s === 'TIE' || s === '동일' || s === '같음') return 'similar';
  return 'similar';
}

export async function POST(request: NextRequest) {
  try {
    let body: CompareBody;
    try {
      body = (await request.json()) as CompareBody;
    } catch {
      return NextResponse.json(
        apiErrorBody('요청 본문을 읽을 수 없어요. 사진을 줄이거나 다시 시도해 주세요.', 'BODY_JSON'),
        { status: 400 }
      );
    }
    const {
      aRawImageBase64,
      aRawMimeType = 'image/jpeg',
      aNutritionImageBase64,
      aNutritionMimeType = 'image/jpeg',
      bRawImageBase64,
      bRawMimeType = 'image/jpeg',
      bNutritionImageBase64,
      bNutritionMimeType = 'image/jpeg',
      profile,
      dailyQuestTarget,
    } = body;
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId || clientId.length < 8) {
      return NextResponse.json(
        apiErrorBody('잠깐만요, 이 기기 정보가 없어요.', 'BAD_CLIENT_ID'),
        { status: 400 }
      );
    }

    const questTargetValid = (DAILY_QUEST_ANALYZE_LABELS as readonly string[]).includes(
      String(dailyQuestTarget || '').trim(),
    );
    const questTargetForPrompt = questTargetValid ? String(dailyQuestTarget).trim() : null;

    if (!aRawImageBase64 || !aNutritionImageBase64 || !bRawImageBase64 || !bNutritionImageBase64) {
      return NextResponse.json(
        apiErrorBody('제품 A·B 각각 원재료·영양표 이미지가 필요해요.', 'NO_IMAGES'),
        { status: 400 }
      );
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('Gemini API 키를 설정해 주세요. (환경 변수 GEMINI_API_KEY)', 'NO_API_KEY'),
        { status: 500 }
      );
    }

    const prompt = getCompareFourImagesPrompt(profileToPersonalization(profile), questTargetForPrompt);

    const generationBody = {
      contents: [
        {
          parts: [
            inlineDataPart(aRawMimeType, aRawImageBase64),
            inlineDataPart(aNutritionMimeType, aNutritionImageBase64),
            inlineDataPart(bRawMimeType, bRawImageBase64),
            inlineDataPart(bNutritionMimeType, bNutritionImageBase64),
            textPart(prompt),
          ],
        },
      ],
      generationConfig: generationConfigJsonMode({
        maxOutputTokens: COMPARE_MAX_OUTPUT_TOKENS,
        temperature: 0,
        ...(isGemini3FamilyModelId(COMPARE_GEMINI_MODEL) ? { thinkingLevel: 'minimal' as const } : {}),
      }),
    };

    const upstream = await fetchGeminiGenerateContentWithFlashFallback(
      COMPARE_GEMINI_MODEL,
      key,
      generationBody,
      'api/compare',
    );
    const text = upstream.text;
    if (!upstream.ok) {
      const clientStatus = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
      const upstreamCode = geminiErrorCodeFromBody(text);
      return NextResponse.json(
        apiErrorBody(formatGeminiHttpError(upstream.status, text), upstreamCode),
        { status: clientStatus }
      );
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/compare] envelope JSON.parse failed', text.slice(0, 800));
      }
      return NextResponse.json(
        apiErrorBody('AI 응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'ENVELOPE_JSON'),
        { status: 502 }
      );
    }

    const blockReason = getGeminiPromptBlockReason(data);
    if (blockReason) {
      return NextResponse.json(
        apiErrorBody(
          '이 요청은 안전 정책으로 처리할 수 없어요. 다른 사진으로 시도해 주세요.',
          `PROMPT_BLOCKED:${blockReason}`
        ),
        { status: 400 }
      );
    }

    if (!hasGeminiCandidates(data)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/compare] empty candidates', JSON.stringify(data).slice(0, 2000));
      }
      return NextResponse.json(
        apiErrorBody('AI가 응답을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'NO_CANDIDATES'),
        { status: 502 }
      );
    }

    const cand = (data as { candidates?: Array<{ finishReason?: string }> })?.candidates?.[0];
    const finishReason = cand?.finishReason;
    const partText = getGeminiCandidateText(data);

    if (!partText || typeof partText !== 'string') {
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return NextResponse.json(
          apiErrorBody(
            '이미지를 비교할 수 없어요. 다른 사진으로 시도해 주세요.',
            finishReason || 'BLOCKED'
          ),
          { status: 500 }
        );
      }
      if (finishReason === 'MAX_TOKENS') {
        return NextResponse.json(
          apiErrorBody('비교 응답이 잘렸어요. 다시 시도해 주세요.', 'MAX_TOKENS'),
          { status: 500 }
        );
      }
      return NextResponse.json(
        apiErrorBody(
          '비교 결과를 받지 못했어요. 잠시 뒤에 다시 눌러 주세요.',
          finishReason ? String(finishReason) : 'NO_MODEL_TEXT'
        ),
        { status: 500 }
      );
    }

    const raw = partText;
    const parsed = parseGeminiModelObject(raw);
    if (!parsed) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/compare] RESULT_JSON raw head:', raw.slice(0, 2500));
      }
      return NextResponse.json(
        apiErrorBody('결과를 읽는 데 실패했어요. 다시 한번 눌러 주세요.', 'RESULT_JSON'),
        { status: 500 }
      );
    }

    const pair = extractCompareProductPair(parsed as Record<string, unknown>);
    if (!pair) {
      return NextResponse.json(
        apiErrorBody(
          '비교 응답 형식이 올바르지 않아요. 잠시 뒤 다시 시도해 주세요.',
          'COMPARE_SHAPE',
        ),
        { status: 502 },
      );
    }
    const { productA: rawA, productB: rawB } = pair;

    let productA: AnalysisResult;
    let productB: AnalysisResult;
    try {
      productA = buildAnalysisResultFromGeminiObject(rawA, {
        dailyQuestProductMatch: false,
      });
      productB = buildAnalysisResultFromGeminiObject(rawB, {
        dailyQuestProductMatch: false,
      });
    } catch (buildErr) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/compare] buildAnalysisResultFromGeminiObject', buildErr);
      }
      return NextResponse.json(
        apiErrorBody('비교 결과를 가공하는 데 실패했어요. 다시 시도해 주세요.', 'BUILD_RESULT'),
        { status: 500 }
      );
    }

    const betterChoice = normalizeBetterChoice(parsed.betterChoice);
    const comparisonSummary = (parsed.comparisonSummary != null ? String(parsed.comparisonSummary) : '').trim();
    const recommendationLine = (parsed.recommendationLine != null ? String(parsed.recommendationLine) : '').trim();
    const dailyQuestProductMatch =
      questTargetValid && parsed.dailyQuestProductMatch === true;

    return NextResponse.json({
      productA,
      productB,
      betterChoice,
      comparisonSummary,
      recommendationLine,
      dailyQuestProductMatch,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해 주세요.';
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/compare] SERVER', e);
    }
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
