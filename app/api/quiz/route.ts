import { NextRequest, NextResponse } from 'next/server';
import {
  GEMINI_MODEL,
  getDailyOxQuizPrompt,
  normalizeGeminiJson,
} from '@/lib/gemini-prompts';
import { hashStringFnv, toLocalYmd } from '@/lib/daily-quests';
import { formatGeminiHttpError, geminiErrorCodeFromBody } from '@/lib/gemini-http-error';
import { apiErrorBody } from '@/lib/read-api-json';

export const runtime = 'nodejs';
export const maxDuration = 45;

function requireClientId(clientId: string): void {
  if (!clientId || String(clientId).trim().length < 8) {
    throw new Error('잠깐만요, 이 기기 정보가 없어요.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientId = String(body.clientId || '').trim();
    requireClientId(clientId);

    const ymd = toLocalYmd(new Date());
    const h = Math.abs(hashStringFnv(`${clientId}|${ymd}|oxquiz`));
    const questionType = ((h % 3) + 1) as 1 | 2 | 3;

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('Gemini API 키를 설정해 주세요. (환경 변수 GEMINI_API_KEY)', 'NO_API_KEY'),
        { status: 500 },
      );
    }

    const prompt = getDailyOxQuizPrompt(questionType);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.7,
          top_p: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/quiz] Gemini HTTP', res.status, text.slice(0, 1500));
      }
      const clientStatus = res.status >= 400 && res.status < 600 ? res.status : 502;
      const upstreamCode = geminiErrorCodeFromBody(text);
      return NextResponse.json(
        apiErrorBody(formatGeminiHttpError(res.status, text), upstreamCode),
        { status: clientStatus },
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(apiErrorBody('응답을 읽지 못했어요.', 'ENVELOPE_JSON'), { status: 500 });
    }
    const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts;
    const raw = parts?.[0]?.text;
    if (!raw || typeof raw !== 'string') {
      return NextResponse.json(apiErrorBody('퀴즈를 받지 못했어요.', 'NO_MODEL_TEXT'), { status: 500 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(normalizeGeminiJson(raw)) as Record<string, unknown>;
    } catch {
      return NextResponse.json(apiErrorBody('퀴즈 형식이 올바르지 않아요.', 'QUIZ_JSON'), { status: 500 });
    }

    const q = typeof parsed.question === 'string' ? parsed.question.trim() : '';
    if (!q) {
      return NextResponse.json(apiErrorBody('퀴즈 문항이 비어 있어요.', 'EMPTY_QUESTION'), { status: 500 });
    }

    const ca = String(parsed.correctAnswer ?? '')
      .trim()
      .toUpperCase();
    const correctAnswer = ca === 'X' ? 'X' : 'O';

    const explanation =
      typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';

    return NextResponse.json({
      questionType,
      question: q,
      correctAnswer,
      explanation,
      foodKeyword: '',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해 주세요.';
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
