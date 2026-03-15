import { NextRequest, NextResponse } from 'next/server';
import { getPackageImagePrompt, normalizeGeminiJson, GEMINI_MODEL } from '@/lib/gemini-prompts';

/** 이미지→텍스트·NOVA 판정: Gemini Vision(멀티모달). 별도 OCR 엔진 없음. */
export const runtime = 'nodejs';
export const maxDuration = 60;

interface AnalyzeBody {
  clientId: string;
  imageBase64: string;
  mimeType?: string;
}

function requireClientId(clientId: string): void {
  if (!clientId || String(clientId).trim().length < 8) {
    throw new Error('clientId가 없습니다.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeBody = await request.json();
    const { clientId, imageBase64, mimeType = 'image/jpeg' } = body;
    requireClientId(clientId);
    if (!imageBase64) {
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
    const prompt = getPackageImagePrompt();

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
          top_p: 0.95,
          top_k: 40,
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        const err = JSON.parse(text);
        if (err?.error?.message) msg = err.error.message;
      } catch {}
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

    const product = {
      productName: (parsed.productName != null ? String(parsed.productName).trim() : '') as string,
      companyName: (parsed.companyName != null ? String(parsed.companyName).trim() : '') as string,
      rawMaterials: (parsed.rawMaterials != null ? String(parsed.rawMaterials).trim() : '') as string,
    };
    const novaGroup = Math.min(4, Math.max(1, parseInt(String(parsed.novaGroup), 10) || 4));
    const concernIngredients = Array.isArray(parsed.concernIngredients)
      ? (parsed.concernIngredients as Array<{ name?: string; explanation?: string }>)
          .slice(0, 3)
          .map((c) => ({ name: c.name || '', explanation: c.explanation || '' }))
      : [];

    const result = {
      product,
      novaGroup,
      judgmentReason: (parsed.judgmentReason && String(parsed.judgmentReason).trim()) || null,
      concernIngredients,
      briefDescription: (parsed.briefDescription && String(parsed.briefDescription).trim()) || null,
      consumptionAdvice: (parsed.consumptionAdvice && String(parsed.consumptionAdvice).trim()) || null,
    };

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
