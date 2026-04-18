import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_MODEL, getDailyOxQuizPrompt } from '@/lib/gemini-prompts';
import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
import { hashStringFnv, toLocalYmd } from '@/lib/daily-quests';
import { apiErrorBody } from '@/lib/read-api-json';
import {
  getGeminiCandidateText,
  getGeminiPromptBlockReason,
  hasGeminiCandidates,
} from '@/lib/gemini-response-envelope';
import { generationConfigJsonMode, textPart } from '@/lib/gemini-rest-body';
import { fetchGeminiGenerateContentWithFlashFallback } from '@/lib/gemini-fetch-with-fallback';

export const runtime = 'nodejs';
export const maxDuration = 45;

type QuizJson = {
  questionType: 1 | 2 | 3;
  question: string;
  correctAnswer: 'O' | 'X';
  explanation: string;
  foodKeyword: string;
};

function clampQuizFromGemini(
  parsed: Record<string, unknown>,
  questionType: 1 | 2 | 3,
): QuizJson | null {
  const q = typeof parsed.question === 'string' ? parsed.question.trim() : '';
  if (!q) return null;
  const ca = String(parsed.correctAnswer ?? '')
    .trim()
    .toUpperCase();
  const correctAnswer = ca === 'X' ? 'X' : 'O';
  const explanation =
    typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';
  return {
    questionType,
    question: q,
    correctAnswer,
    explanation,
    foodKeyword: typeof parsed.foodKeyword === 'string' ? parsed.foodKeyword.trim() : '',
  };
}

/** Gemini 성공 시 JSON, 실패·차단·파싱 실패 시 null */
async function geminiOxQuizOrNull(
  questionType: 1 | 2 | 3,
  apiKey: string,
): Promise<QuizJson | null> {
  const prompt = getDailyOxQuizPrompt(questionType);
  const requestBody = {
    contents: [{ parts: [textPart(prompt)] }],
    generationConfig: generationConfigJsonMode({
      maxOutputTokens: 1024,
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
    }),
  };
  try {
    const upstream = await fetchGeminiGenerateContentWithFlashFallback(
      GEMINI_MODEL,
      apiKey,
      requestBody,
      'api/quiz',
    );
    const text = upstream.text;
    if (!upstream.ok) {
      return null;
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (getGeminiPromptBlockReason(data) || !hasGeminiCandidates(data)) return null;
    const raw = getGeminiCandidateText(data);
    if (!raw || typeof raw !== 'string') return null;
    const parsed = parseGeminiModelObject(raw);
    if (!parsed) return null;
    return clampQuizFromGemini(parsed, questionType);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/quiz] Gemini', e);
    }
    return null;
  }
}

/** OX 퀴즈: Gemini로만 생성. 클라이언트는 로드 시 미리 호출해 캐시 권장. */
export async function POST(request: NextRequest) {
  try {
    let body: { clientId?: string };
    try {
      body = (await request.json()) as { clientId?: string };
    } catch {
      return NextResponse.json(
        apiErrorBody('요청 본문을 읽을 수 없어요.', 'BODY_JSON'),
        { status: 400 },
      );
    }
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId || clientId.length < 8) {
      return NextResponse.json(
        apiErrorBody('잠깐만요, 이 기기 정보가 없어요.', 'BAD_CLIENT_ID'),
        { status: 400 },
      );
    }

    const ymd = toLocalYmd(new Date());
    const h = Math.abs(hashStringFnv(`${clientId}|${ymd}|oxquiz`));
    const questionType = ((h % 3) + 1) as 1 | 2 | 3;

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('퀴즈를 만들려면 서버에 GEMINI_API_KEY가 필요해요.', 'NO_GEMINI_KEY'),
        { status: 503 },
      );
    }

    const quiz = await geminiOxQuizOrNull(questionType, key);
    if (quiz) {
      return NextResponse.json(quiz);
    }

    return NextResponse.json(
      apiErrorBody('문제를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'QUIZ_GENERATION_FAILED'),
      { status: 502 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해 주세요.';
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/quiz] SERVER', e);
    }
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
