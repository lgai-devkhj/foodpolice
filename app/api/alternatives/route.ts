import { NextRequest, NextResponse } from 'next/server';
import {
  buildAlternativeFoodWebSearchPrompt,
  DEFAULT_ALTERNATIVES_GROUNDING_MODEL,
  fetchAlternativesWithGoogleSearch,
} from '@/lib/gemini-alternative-search';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface AlternativesBody {
  productName?: string;
  companyName?: string;
  foodCategory?: string | null;
  novaGroup?: number;
  novaSubgroup?: string | null;
  briefDescription?: string | null;
  rawMaterials?: string;
}

export async function POST(request: NextRequest) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json({ error: 'Gemini API 키를 설정해 주세요.' }, { status: 500 });
    }

    const body: AlternativesBody = await request.json();
    const novaGroup = Math.min(4, Math.max(1, parseInt(String(body.novaGroup), 10) || 4));
    const ctx = {
      productName: (body.productName || '').trim(),
      companyName: (body.companyName || '').trim(),
      foodCategory: body.foodCategory ?? null,
      novaGroup,
      novaSubgroup: body.novaSubgroup ? String(body.novaSubgroup).trim().toUpperCase() : null,
      briefDescription: body.briefDescription ? String(body.briefDescription).trim() : null,
      rawMaterials: (body.rawMaterials || '').trim(),
    };

    const model =
      (process.env.GEMINI_ALTERNATIVES_GROUNDING_MODEL || '').trim() ||
      DEFAULT_ALTERNATIVES_GROUNDING_MODEL;
    const prompt = buildAlternativeFoodWebSearchPrompt(ctx);
    const alternativeFoodText = await fetchAlternativesWithGoogleSearch(key, model, prompt);

    return NextResponse.json({
      alternativeFoodText: alternativeFoodText || null,
      alternativeFoodFromWebSearch: !!alternativeFoodText,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
