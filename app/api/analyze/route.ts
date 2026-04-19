import { NextRequest, NextResponse } from 'next/server';
import { apiErrorBody } from '@/lib/read-api-json';
import { runFastAnalysisPipeline } from '@/lib/fast-analysis-pipeline';

/** 시연용 빠른 분석 — 단일 Gemini 호출, 최소 JSON → `AnalysisResult` */
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
  profile?: {
    heightCm?: number;
    weightKg?: number;
    birthYear?: number | null;
    birthDate?: string | null;
    gender?: string | null;
  };
  dailyQuestTarget?: string;
}

export async function POST(request: NextRequest) {
  try {
    let body: AnalyzeBody;
    try {
      body = (await request.json()) as AnalyzeBody;
    } catch {
      return NextResponse.json(
        apiErrorBody('요청 본문을 읽을 수 없어요. 사진을 줄이거나 다시 시도해요.', 'BODY_JSON'),
        { status: 400 },
      );
    }
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      rawImageBase64,
      rawMimeType = 'image/jpeg',
      nutritionImageBase64,
      nutritionMimeType = 'image/jpeg',
    } = body;
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId || clientId.length < 8) {
      return NextResponse.json(
        apiErrorBody('잠깐만요, 이 기기 정보가 없어요.', 'BAD_CLIENT_ID'),
        { status: 400 },
      );
    }

    const hasTwoImages = !!rawImageBase64 && !!nutritionImageBase64;
    if (!imageBase64 && !hasTwoImages) {
      return NextResponse.json(apiErrorBody('사진을 먼저 올려요.', 'NO_IMAGE'), { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('AI 키가 서버에 설정돼 있지 않아요. 관리자에게 문의해요.', 'NO_API_KEY'),
        { status: 500 },
      );
    }

    const images = hasTwoImages
      ? [
          { mimeType: rawMimeType, base64: rawImageBase64 || '' },
          { mimeType: nutritionMimeType, base64: nutritionImageBase64 || '' },
        ]
      : [{ mimeType: mimeType, base64: imageBase64 || '' }];

    const out = await runFastAnalysisPipeline(key, hasTwoImages, images);

    if ('error' in out) {
      return NextResponse.json(apiErrorBody(out.error.message, out.error.code), {
        status: out.error.status,
      });
    }

    return NextResponse.json(out.result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해요.';
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/analyze] SERVER', e);
    }
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
