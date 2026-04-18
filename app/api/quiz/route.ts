import { NextRequest, NextResponse } from 'next/server';
import {
  GEMINI_MODEL,
  getDailyOxQuizPrompt,
  normalizeGeminiJson,
} from '@/lib/gemini-prompts';
import { DAILY_QUEST_ANALYZE_LABELS, hashStringFnv, toLocalYmd } from '@/lib/daily-quests';

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

    const foodLabelRaw = typeof body.foodLabel === 'string' ? body.foodLabel.trim() : '';
    const ymd = toLocalYmd(new Date());
    const h = Math.abs(hashStringFnv(`${clientId}|${ymd}|oxquiz`));
    const questionType = ((h % 3) + 1) as 1 | 2 | 3;

    const labels = DAILY_QUEST_ANALYZE_LABELS as readonly string[];
    const foodKeyword =
      foodLabelRaw && labels.includes(foodLabelRaw)
        ? foodLabelRaw
        : labels[h % labels.length] ?? labels[0] ?? '가공식품';

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        { error: 'Gemini API 키를 설정해 주세요. (환경 변수 GEMINI_API_KEY)' },
        { status: 500 },
      );
    }

    const prompt = getDailyOxQuizPrompt(foodKeyword, questionType);
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
      return NextResponse.json(
        { error: '퀴즈를 만들지 못했어요. 잠시 뒤에 다시 눌러 주세요.' },
        { status: res.status >= 400 && res.status < 500 ? res.status : 500 },
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: '응답을 읽지 못했어요.' }, { status: 500 });
    }
    const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts;
    const raw = parts?.[0]?.text;
    if (!raw || typeof raw !== 'string') {
      return NextResponse.json({ error: '퀴즈를 받지 못했어요.' }, { status: 500 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(normalizeGeminiJson(raw)) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '퀴즈 형식이 올바르지 않아요.' }, { status: 500 });
    }

    const q = typeof parsed.question === 'string' ? parsed.question.trim() : '';
    if (!q) {
      return NextResponse.json({ error: '퀴즈 문항이 비어 있어요.' }, { status: 500 });
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
      foodKeyword,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해 주세요.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
