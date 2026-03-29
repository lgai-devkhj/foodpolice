import { NextRequest, NextResponse } from 'next/server';
import {
  buildAlternativeFoodWebSearchPrompt,
  buildNutritionHintForAlternatives,
  fetchAlternativesWithGoogleSearch,
  type AlternativesNutritionPayload,
} from '@/lib/gemini-alternative-search';

export const runtime = 'nodejs';
/** 그라운딩 최대 2회(각 ~28s)까지 허용 */
export const maxDuration = 60;

interface AlternativesBody {
  productName?: string;
  companyName?: string;
  foodCategory?: string | null;
  novaGroup?: number;
  novaSubgroup?: string | null;
  briefDescription?: string | null;
  rawMaterials?: string;
  /** 분석 결과 nutrition의 숫자 필드만 전달 */
  nutrition?: AlternativesNutritionPayload | null;
}

export async function POST(request: NextRequest) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json({ error: 'Gemini API 키를 설정해 주세요.' }, { status: 500 });
    }

    const body: AlternativesBody = await request.json();
    const novaGroup = Math.min(4, Math.max(1, parseInt(String(body.novaGroup), 10) || 4));
    const nutritionHint = buildNutritionHintForAlternatives(body.nutrition ?? undefined);
    const ctx = {
      productName: (body.productName || '').trim(),
      companyName: (body.companyName || '').trim(),
      foodCategory: body.foodCategory ?? null,
      novaGroup,
      novaSubgroup: body.novaSubgroup ? String(body.novaSubgroup).trim().toUpperCase() : null,
      briefDescription: body.briefDescription ? String(body.briefDescription).trim() : null,
      rawMaterials: (body.rawMaterials || '').trim(),
      nutritionHint,
    };

    const prompt = buildAlternativeFoodWebSearchPrompt(ctx);
    const alternativeFoodText = await fetchAlternativesWithGoogleSearch(key, prompt);

    return NextResponse.json({
      alternativeFoodText: alternativeFoodText || null,
      alternativeFoodFromWebSearch: !!alternativeFoodText,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
