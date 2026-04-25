import { NextRequest, NextResponse } from 'next/server';
import {
  getPackageImagePrompt,
  getTwoImagePackagePrompt,
  type BmiTier,
  type PersonalizationInput,
} from '@/lib/gemini-prompts';
import { DAILY_QUEST_ANALYZE_LABELS } from '@/lib/daily-quests';
import { computeBmiServer } from '@/lib/nutrition-daily';
import { buildAnalysisResultFromGeminiObject } from '@/lib/gemini-product-from-json';
import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
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
  ANALYSIS_GEMINI_MODEL,
  ANALYSIS_MAX_OUTPUT_TOKENS,
  isGemini3FamilyModelId,
} from '@/lib/gemini-models';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface AnalyzeBody {
  clientId: string;
  imageBase64?: string;
  mimeType?: string;
  rawImageBase64?: string;
  rawMimeType?: string;
  nutritionImageBase64?: string;
  nutritionMimeType?: string;
  profile?: {
    heightCm?: number;
    weightKg?: number;
    birthYear?: number | null;
    birthDate?: string | null;
    gender?: string | null;
  };
  dailyQuestTarget?: string;
}

function profileToPersonalization(profile?: AnalyzeBody['profile']): PersonalizationInput | null {
  const h = profile?.heightCm;
  const w = profile?.weightKg;
  if (h == null || w == null || Number(h) <= 0 || Number(w) <= 0) return null;
  const bmi = computeBmiServer(Number(h), Number(w));
  if (bmi == null) return null;
  const bmiTier: BmiTier =
    bmi < 18.5 ? 'underweight' : bmi <= 22.9 ? 'normal' : bmi <= 24.9 ? 'overweight' : 'obese';
  return { bmiValue: bmi, bmiTier };
}

export async function POST(request: NextRequest) {
  try {
    let body: AnalyzeBody;
    try {
      body = (await request.json()) as AnalyzeBody;
    } catch {
      return NextResponse.json(
        apiErrorBody('요청 본문을 읽을 수 없어요. 사진을 줄이거나 다시 시도해요.', 'BODY_JSON'),
        { status: 400 },
      );
    }
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      rawImageBase64,
      rawMimeType = 'image/jpeg',
      nutritionImageBase64,
      nutritionMimeType = 'image/jpeg',
      profile,
      dailyQuestTarget,
    } = body;
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId || clientId.length < 8) {
      return NextResponse.json(
        apiErrorBody('잠깐만요, 이 기기 정보가 없어요.', 'BAD_CLIENT_ID'),
        { status: 400 },
      );
    }

    const hasTwoImages = !!rawImageBase64 && !!nutritionImageBase64;
    if (!imageBase64 && !hasTwoImages) {
      return NextResponse.json(apiErrorBody('사진을 먼저 올려요.', 'NO_IMAGE'), { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('AI 키가 서버에 설정돼 있지 않아요. 관리자에게 문의해요.', 'NO_API_KEY'),
        { status: 500 },
      );
    }

    const questTargetValid = (DAILY_QUEST_ANALYZE_LABELS as readonly string[]).includes(
      String(dailyQuestTarget || '').trim(),
    );
    const questTargetForPrompt = questTargetValid ? String(dailyQuestTarget).trim() : null;

    const prompt = hasTwoImages
      ? getTwoImagePackagePrompt(profileToPersonalization(profile), 'standard', questTargetForPrompt)
      : getPackageImagePrompt(profileToPersonalization(profile), 'standard', questTargetForPrompt);

    const parts = hasTwoImages
      ? [
          inlineDataPart(rawMimeType, rawImageBase64 || ''),
          inlineDataPart(nutritionMimeType, nutritionImageBase64 || ''),
          textPart(prompt),
        ]
      : [inlineDataPart(mimeType, imageBase64 || ''), textPart(prompt)];

    const generationBody = {
      contents: [{ parts }],
      generationConfig: generationConfigJsonMode({
        maxOutputTokens: ANALYSIS_MAX_OUTPUT_TOKENS,
        temperature: 0,
        ...(isGemini3FamilyModelId(ANALYSIS_GEMINI_MODEL) ? { thinkingLevel: 'minimal' as const } : {}),
      }),
    };

    const upstream = await fetchGeminiGenerateContentWithFlashFallback(
      ANALYSIS_GEMINI_MODEL,
      key,
      generationBody,
      'api/analyze',
    );
    const text = upstream.text;
    if (!upstream.ok) {
      const clientStatus = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
      const upstreamCode = geminiErrorCodeFromBody(text);
      return NextResponse.json(
        apiErrorBody(formatGeminiHttpError(upstream.status, text), upstreamCode),
        { status: clientStatus },
      );
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] envelope JSON.parse failed', text.slice(0, 800));
      }
      return NextResponse.json(
        apiErrorBody('AI 응답을 읽지 못했어요. 잠시 뒤 다시 시도해요.', 'ENVELOPE_JSON'),
        { status: 502 },
      );
    }

    const blockReason = getGeminiPromptBlockReason(data);
    if (blockReason) {
      return NextResponse.json(
        apiErrorBody(
          '이 요청은 안전 정책으로 처리할 수 없어요. 다른 사진으로 시도해요.',
          `PROMPT_BLOCKED:${blockReason}`,
        ),
        { status: 400 },
      );
    }

    if (!hasGeminiCandidates(data)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] empty candidates', JSON.stringify(data).slice(0, 2000));
      }
      return NextResponse.json(
        apiErrorBody('AI가 응답을 만들지 못했어요. 잠시 뒤 다시 시도해요.', 'NO_CANDIDATES'),
        { status: 502 },
      );
    }

    const cand = (data as { candidates?: Array<{ finishReason?: string }> })?.candidates?.[0];
    const finishReason = cand?.finishReason;
    const partText = getGeminiCandidateText(data);

    if (!partText || typeof partText !== 'string') {
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return NextResponse.json(
          apiErrorBody('이미지를 분석할 수 없어요. 다른 사진으로 시도해요.', finishReason || 'BLOCKED'),
          { status: 500 },
        );
      }
      if (finishReason === 'MAX_TOKENS') {
        return NextResponse.json(
          apiErrorBody('분석 응답이 잘렸어요. 다시 시도해요.', 'MAX_TOKENS'),
          { status: 500 },
        );
      }
      return NextResponse.json(
        apiErrorBody(
          '분석 결과를 받지 못했어요. 잠시 뒤에 다시 눌러요.',
          finishReason ? String(finishReason) : 'NO_MODEL_TEXT',
        ),
        { status: 500 },
      );
    }

    const parsed = parseGeminiModelObject(partText);
    if (!parsed || typeof parsed !== 'object') {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] RESULT_JSON raw head:', partText.slice(0, 2500));
      }
      return NextResponse.json(
        apiErrorBody('결과를 읽는 데 실패했어요. 다시 한번 눌러요.', 'RESULT_JSON'),
        { status: 500 },
      );
    }

    const rec = parsed as Record<string, unknown>;
    const dailyQuestProductMatch =
      questTargetValid && rec.dailyQuestProductMatch === true;

    try {
      const result = buildAnalysisResultFromGeminiObject(rec, {
        dailyQuestProductMatch,
      });
      return NextResponse.json(result);
    } catch (buildErr) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] buildAnalysisResultFromGeminiObject', buildErr);
      }
      return NextResponse.json(
        apiErrorBody('분석 결과를 가공하는 데 실패했어요. 다시 시도해요.', 'BUILD_RESULT'),
        { status: 500 },
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해요.';
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/analyze] SERVER', e);
    }
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
