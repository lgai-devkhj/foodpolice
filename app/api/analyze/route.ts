import { NextRequest, NextResponse } from 'next/server';
import {
  getPackageImagePrompt,
  getTwoImagePackagePrompt,
  getDailyQuestProductMatchBlock,
  normalizeGeminiJson,
  GEMINI_MODEL,
} from '@/lib/gemini-prompts';
import { DAILY_QUEST_ANALYZE_LABELS } from '@/lib/daily-quests';
import { computeBmiServer, bmiCategoryKo } from '@/lib/nutrition-daily';
import { buildAnalysisResultFromGeminiObject } from '@/lib/gemini-product-from-json';
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
    throw new Error('clientId가 없습니다.');
  }
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
      return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        { error: 'Gemini API 키를 설정해 주세요. (환경 변수 GEMINI_API_KEY)' },
        { status: 500 }
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
    const basePrompt = hasTwoImages ? getTwoImagePackagePrompt() : getPackageImagePrompt();
    let profileHint = '';
    const ph = profile?.heightCm;
    const pw = profile?.weightKg;
    if (ph != null && pw != null && Number(ph) > 0 && Number(pw) > 0) {
      const bmiPre = computeBmiServer(Number(ph), Number(pw));
      if (bmiPre != null) {
        const catPre = bmiCategoryKo(bmiPre);
        profileHint =
          '[사용자 프로필 — 종합 평가 단계 5에만 반영. 의학 진단이 아님]\n' +
          `BMI 약 ${bmiPre.toFixed(1)} (${catPre}). 과체중·비만이면 당류·지방·초가공에 더 엄격히, 저체중·정상은 일반 기준으로 평가.\n\n`;
      }
    }
    const dailyQuestBlock = questTargetValid ? getDailyQuestProductMatchBlock(dailyQuestTarget) : '';
    const prompt = profileHint + basePrompt + dailyQuestBlock;

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
          maxOutputTokens: 2048,
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        const err = JSON.parse(text);
        if (err?.error?.message) msg = err.error.message;
      } catch {
        /* ignore */
      }
      return NextResponse.json({ error: 'Gemini 오류: ' + msg }, { status: res.status });
    }

    const data = JSON.parse(text);
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    if (parts.length === 0 || !parts[0].text) {
      return NextResponse.json(
        { error: 'Gemini가 응답 내용을 반환하지 않았습니다.' },
        { status: 500 }
      );
    }

    const raw = parts[0].text;
    const normalized = normalizeGeminiJson(raw);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(normalized);
    } catch {
      return NextResponse.json({ error: '응답 파싱 실패' }, { status: 500 });
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
    const message = e instanceof Error ? e.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
