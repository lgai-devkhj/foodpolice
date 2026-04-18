import { NextRequest, NextResponse } from 'next/server';
import {
  GEMINI_MODEL,
  getDailyOxQuizPrompt,
} from '@/lib/gemini-prompts';
import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
import { hashStringFnv, toLocalYmd } from '@/lib/daily-quests';
import { formatGeminiHttpError, geminiErrorCodeFromBody } from '@/lib/gemini-http-error';
import { apiErrorBody } from '@/lib/read-api-json';
import {
  getGeminiCandidateText,
  getGeminiPromptBlockReason,
  hasGeminiCandidates,
} from '@/lib/gemini-response-envelope';
import { generationConfigJsonMode, textPart } from '@/lib/gemini-rest-body';

export const runtime = 'nodejs';
export const maxDuration = 45;

function requireClientId(clientId: string): void {
  if (!clientId || String(clientId).trim().length < 8) {
    throw new Error('잠깐만요, 이 기기 정보가 없어요.');
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: { clientId?: string };
    try {
      body = (await request.json()) as { clientId?: string };
    } catch {
      return NextResponse.json(
        apiErrorBody('요청 본문을 읽을 수 없어요.', 'BODY_JSON'),
        { status: 400 }
      );
    }
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
        contents: [{ parts: [textPart(prompt)] }],
        generationConfig: generationConfigJsonMode({
          maxOutputTokens: 1024,
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        }),
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

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return NextResponse.json(apiErrorBody('응답을 읽지 못했어요.', 'ENVELOPE_JSON'), { status: 500 });
    }
    const blockReason = getGeminiPromptBlockReason(data);
    if (blockReason) {
      return NextResponse.json(
        apiErrorBody(
          '퀴즈를 만들 수 없는 요청이에요. 잠시 뒤에 다시 시도해 주세요.',
          `PROMPT_BLOCKED:${blockReason}`
        ),
        { status: 400 }
      );
    }
    if (!hasGeminiCandidates(data)) {
      return NextResponse.json(
        apiErrorBody('퀴즈 응답이 비어 있어요. 잠시 뒤 다시 시도해 주세요.', 'NO_CANDIDATES'),
        { status: 502 }
      );
    }
    const raw = getGeminiCandidateText(data);
    if (!raw || typeof raw !== 'string') {
      return NextResponse.json(apiErrorBody('퀴즈를 받지 못했어요.', 'NO_MODEL_TEXT'), { status: 500 });
    }

    const parsed = parseGeminiModelObject(raw);
    if (!parsed) {
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
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/quiz] SERVER', e);
    }
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
