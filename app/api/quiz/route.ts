import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_MODEL, getDailyOxQuizPrompt } from '@/lib/gemini-prompts';
import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
import { hashStringFnv, toLocalYmd } from '@/lib/daily-quests';
import { quizApiErrorFromGeminiUpstream } from '@/lib/gemini-http-error';
import { apiErrorBody } from '@/lib/read-api-json';
import {
  getGeminiCandidateText,
  getGeminiPromptBlockReason,
  hasGeminiCandidates,
} from '@/lib/gemini-response-envelope';
import { generationConfigJsonMode, textPart } from '@/lib/gemini-rest-body';
import { fetchGeminiGenerateContentWithFlashFallback } from '@/lib/gemini-fetch-with-fallback';
import { isGemini3FamilyModelId } from '@/lib/gemini-models';

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

type OxQuizGenResult =
  | { kind: 'ok'; quiz: QuizJson }
  | { kind: 'upstream'; status: number; bodyText: string }
  | { kind: 'bad_response' };

/** Gemini HTTP 실패 시 상태·본문을 넘겨 사용자 메시지 구분에 사용 */
async function geminiOxQuizGenerate(
  questionType: 1 | 2 | 3,
  requireAnswerX: boolean,
  apiKey: string,
): Promise<OxQuizGenResult> {
  const prompt = getDailyOxQuizPrompt(questionType, { requireAnswerX });
  const requestBody = {
    contents: [{ parts: [textPart(prompt)] }],
    generationConfig: generationConfigJsonMode({
      maxOutputTokens: 1024,
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      ...(isGemini3FamilyModelId(GEMINI_MODEL) ? { thinkingLevel: 'minimal' as const } : {}),
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
      return { kind: 'upstream', status: upstream.status, bodyText: text };
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { kind: 'bad_response' };
    }
    if (getGeminiPromptBlockReason(data) || !hasGeminiCandidates(data)) return { kind: 'bad_response' };
    const raw = getGeminiCandidateText(data);
    if (!raw || typeof raw !== 'string') return { kind: 'bad_response' };
    const parsed = parseGeminiModelObject(raw);
    if (!parsed) return { kind: 'bad_response' };
    const quiz = clampQuizFromGemini(parsed, questionType);
    if (!quiz) return { kind: 'bad_response' };
    return { kind: 'ok', quiz };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/quiz] Gemini', e);
    }
    return { kind: 'bad_response' };
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
    /** 날짜·기기별로 정답 O / X 요청을 번갈아 O 편향 완화 */
    const requireAnswerX =
      (Math.abs(hashStringFnv(`${clientId}|${ymd}|oxquizx`)) % 2) === 1;

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('퀴즈를 만들려면 서버에 AI 키가 설정돼 있어야 해요.', 'NO_GEMINI_KEY'),
        { status: 503 },
      );
    }

    let gen = await geminiOxQuizGenerate(questionType, requireAnswerX, key);
    if (
      gen.kind === 'ok' &&
      ((requireAnswerX && gen.quiz.correctAnswer !== 'X') ||
        (!requireAnswerX && gen.quiz.correctAnswer !== 'O'))
    ) {
      gen = await geminiOxQuizGenerate(questionType, requireAnswerX, key);
    }
    if (gen.kind === 'ok') {
      return NextResponse.json(gen.quiz);
    }
    if (gen.kind === 'upstream') {
      const err = quizApiErrorFromGeminiUpstream(gen.status, gen.bodyText);
      return NextResponse.json(apiErrorBody(err.message, err.errorCode), { status: err.httpStatus });
    }

    return NextResponse.json(
      apiErrorBody('문제를 만들지 못했어요. 잠시 뒤 다시 시도해요.', 'QUIZ_GENERATION_FAILED'),
      { status: 502 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해요.';
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/quiz] SERVER', e);
    }
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
