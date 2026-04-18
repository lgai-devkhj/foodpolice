import { NextRequest, NextResponse } from 'next/server';
import {
  getPackageImagePrompt,
  getTwoImagePackagePrompt,
  getDailyQuestProductMatchBlock,
  GEMINI_MODEL,
  type BmiTier,
  type PersonalizationInput,
} from '@/lib/gemini-prompts';
import { DAILY_QUEST_ANALYZE_LABELS } from '@/lib/daily-quests';
import { computeBmiServer } from '@/lib/nutrition-daily';
import { buildAnalysisResultFromGeminiObject } from '@/lib/gemini-product-from-json';
import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
import { formatGeminiHttpError, geminiErrorCodeFromBody } from '@/lib/gemini-http-error';
import { apiErrorBody } from '@/lib/read-api-json';
/** 이미지→텍스트·K-NOVA: 단일 멀티모달 호출 (`GEMINI_MODEL`). 웹 그라운딩은 `/api/alternatives`만 사용. */
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
  /** BMI·맞춤 열량 안내용 (선택). 키·몸무게·출생연도/생년월일·성별 */
  profile?: {
    heightCm?: number;
    weightKg?: number;
    birthYear?: number | null;
    birthDate?: string | null;
    gender?: string | null;
  };
  /** 오늘 첫 퀘스트 미션 식품(8종 중 하나). 있으면 AI가 일치 여부를 판단 */
  dailyQuestTarget?: string;
}

function requireClientId(clientId: string): void {
  if (!clientId || String(clientId).trim().length < 8) {
    throw new Error('잠깐만요, 이 기기 정보가 없어요.');
  }
}

function profileToPersonalization(profile?: AnalyzeBody['profile']): PersonalizationInput | undefined {
  const h = profile?.heightCm;
  const w = profile?.weightKg;
  if (h == null || w == null || Number(h) <= 0 || Number(w) <= 0) return undefined;
  const bmi = computeBmiServer(Number(h), Number(w));
  if (bmi == null) return undefined;
  const bmiTier: BmiTier =
    bmi < 18.5 ? 'underweight' : bmi <= 22.9 ? 'normal' : bmi <= 24.9 ? 'overweight' : 'obese';
  return { bmiValue: bmi, bmiTier };
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeBody = await request.json();
    const {
      clientId,
      imageBase64,
      mimeType = 'image/jpeg',
      rawImageBase64,
      rawMimeType = 'image/jpeg',
      nutritionImageBase64,
      nutritionMimeType = 'image/jpeg',
      profile,
      dailyQuestTarget: dailyQuestTargetRaw,
    } = body;
    requireClientId(clientId);
    const dailyQuestTarget =
      typeof dailyQuestTargetRaw === 'string' ? dailyQuestTargetRaw.trim() : '';
    const questTargetValid = (DAILY_QUEST_ANALYZE_LABELS as readonly string[]).includes(
      dailyQuestTarget,
    );
    const hasTwoImages = !!rawImageBase64 && !!nutritionImageBase64;
    if (!imageBase64 && !hasTwoImages) {
      return NextResponse.json(apiErrorBody('사진을 먼저 올려 주세요.', 'NO_IMAGE'), { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('Gemini API 키를 설정해 주세요. (환경 변수 GEMINI_API_KEY)', 'NO_API_KEY'),
        { status: 500 }
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
    const personalization = profileToPersonalization(profile);
    const basePrompt = hasTwoImages
      ? getTwoImagePackagePrompt(personalization)
      : getPackageImagePrompt(personalization);
    const dailyQuestBlock = questTargetValid ? getDailyQuestProductMatchBlock(dailyQuestTarget) : '';
    const prompt = basePrompt + dailyQuestBlock;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...(hasTwoImages
                ? [
                    { inline_data: { mime_type: rawMimeType, data: rawImageBase64 || '' } },
                    {
                      inline_data: {
                        mime_type: nutritionMimeType,
                        data: nutritionImageBase64 || '',
                      },
                    },
                  ]
                : [{ inline_data: { mime_type: mimeType, data: imageBase64 || '' } }]),
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
          top_p: 0.95,
          top_k: 40,
          maxOutputTokens: 4096,
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] Gemini HTTP', res.status, text.slice(0, 1500));
      }
      const clientStatus = res.status >= 400 && res.status < 600 ? res.status : 502;
      const upstreamCode = geminiErrorCodeFromBody(text);
      return NextResponse.json(
        apiErrorBody(formatGeminiHttpError(res.status, text), upstreamCode),
        { status: clientStatus }
      );
    }

    let data: {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] envelope JSON.parse failed', text.slice(0, 800));
      }
      return NextResponse.json(
        apiErrorBody('AI 응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'ENVELOPE_JSON'),
        { status: 502 }
      );
    }

    const cand = data?.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    const finishReason = cand?.finishReason;
    const partText = parts[0]?.text;

    if (!partText || typeof partText !== 'string') {
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return NextResponse.json(
          apiErrorBody(
            '이 이미지는 분석할 수 없어요. 다른 사진으로 시도해 주세요.',
            finishReason || 'BLOCKED'
          ),
          { status: 500 }
        );
      }
      if (finishReason === 'MAX_TOKENS') {
        return NextResponse.json(
          apiErrorBody('분석 응답이 잘렸어요. 다시 시도해 주세요.', 'MAX_TOKENS'),
          { status: 500 }
        );
      }
      return NextResponse.json(
        apiErrorBody(
          '분석 결과를 받지 못했어요. 잠시 뒤에 다시 눌러 주세요.',
          finishReason ? String(finishReason) : 'NO_MODEL_TEXT'
        ),
        { status: 500 }
      );
    }

    const raw = partText;
    const parsed = parseGeminiModelObject(raw);
    if (!parsed) {
      return NextResponse.json(
        apiErrorBody('결과를 읽는 데 실패했어요. 다시 한번 눌러 주세요.', 'RESULT_JSON'),
        { status: 500 }
      );
    }

    const dailyQuestProductMatch = questTargetValid && parsed.dailyQuestProductMatch === true;

    const core = buildAnalysisResultFromGeminiObject(parsed, { dailyQuestProductMatch });

    const result = {
      ...core,
      alternativeFoodText: null,
      alternativeFoodFromWebSearch: false,
    };

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해 주세요.';
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
