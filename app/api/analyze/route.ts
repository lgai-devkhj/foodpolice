import { NextRequest, NextResponse } from 'next/server';
import {
  getPackageImagePrompt,
  getTwoImagePackagePrompt,
  normalizeGeminiJson,
  GEMINI_MODEL,
} from '@/lib/gemini-prompts';
import {
  buildPersonalizedIntakeNote,
  computeBmiServer,
  bmiCategoryKo,
  computeDailyPercentages,
  PERSONALIZED_INTAKE_FOOTNOTE,
  type NutritionDailyPercent,
  type NutritionFactsInput,
  type ProfileForKcalNote,
} from '@/lib/nutrition-daily';
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
  /** BMI·맞춤 열량 안내용 (선택). 키·몸무게·생년월일·성별 */
  profile?: {
    heightCm?: number;
    weightKg?: number;
    birthDate?: string | null;
    gender?: string | null;
  };
}

function requireClientId(clientId: string): void {
  if (!clientId || String(clientId).trim().length < 8) {
    throw new Error('clientId가 없습니다.');
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseNutrition(raw: unknown): NutritionFactsInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const caloriesKcal = numOrNull(o.caloriesKcal);
  const sodiumMg = numOrNull(o.sodiumMg);
  const carbsG = numOrNull(o.carbsG);
  const sugarG = numOrNull(o.sugarG);
  const proteinG = numOrNull(o.proteinG);
  const fatG = numOrNull(o.fatG);
  const saturatedFatG = numOrNull(o.saturatedFatG);
  const transFatG = numOrNull(o.transFatG);
  const servingSizeText =
    o.servingSizeText != null && String(o.servingSizeText).trim() ? String(o.servingSizeText).trim() : null;
  /* 한국 라벨은 대개 1회 제공량 기준이 많아, 미표기 시 true로 둠 */
  const basisIsPerServing = o.basisIsPerServing !== false;
  if (
    caloriesKcal == null &&
    sodiumMg == null &&
    carbsG == null &&
    sugarG == null &&
    proteinG == null &&
    fatG == null &&
    saturatedFatG == null &&
    transFatG == null &&
    !servingSizeText
  ) {
    return null;
  }
  return {
    caloriesKcal,
    sodiumMg,
    carbsG,
    sugarG,
    proteinG,
    fatG,
    saturatedFatG,
    transFatG,
    servingSizeText: servingSizeText ?? undefined,
    basisIsPerServing,
  };
}

const FOOD_CATEGORIES = [
  '음료',
  '달콤한 간식',
  '짭짤한 간식',
  '간편한 한 끼',
  '빵·시리얼류',
  '유제품·디저트',
] as const;

function normalizeFoodCategory(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (FOOD_CATEGORIES.includes(s as (typeof FOOD_CATEGORIES)[number])) return s;
  return s.length > 0 ? s : null;
}

function normalizeNovaSubgroup(novaGroup: number, v: unknown): string | null {
  if (novaGroup !== 4) return null;
  const s = v != null ? String(v).trim().toUpperCase() : '';
  if (s === '4A' || s === '4B' || s === '4C') return s;
  return null;
}

function isNutritionLabelLike(name: string): boolean {
  const n = (name || '').trim().toLowerCase();
  if (!n) return true;
  return /(?:나트륨|당류|열량|칼로리|kcal|탄수화물|단백질|지방|포화지방|트랜스지방|콜레스테롤|식이섬유|탄수|당|protein|fat|carb|sodium|calorie)/i.test(
    n
  );
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
    } = body;
    requireClientId(clientId);
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
    const prompt = hasTwoImages ? getTwoImagePackagePrompt() : getPackageImagePrompt();

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

    const product = {
      productName: (parsed.productName != null ? String(parsed.productName).trim() : '') as string,
      companyName: (parsed.companyName != null ? String(parsed.companyName).trim() : '') as string,
      rawMaterials: (parsed.rawMaterials != null ? String(parsed.rawMaterials).trim() : '') as string,
    };
    const novaGroup = Math.min(4, Math.max(1, parseInt(String(parsed.novaGroup), 10) || 4));
    const concernIngredients = Array.isArray(parsed.concernIngredients)
      ? (parsed.concernIngredients as Array<{ name?: string; explanation?: string }>)
          .map((c) => ({ name: (c.name || '').trim(), explanation: (c.explanation || '').trim() }))
          .filter((c) => c.name.length > 0 && !isNutritionLabelLike(c.name))
          .slice(0, 3)
      : [];

    const nutritionParsed = parseNutrition(parsed.nutrition);
    const nutritionDailyPercent: NutritionDailyPercent | null = nutritionParsed
      ? computeDailyPercentages(nutritionParsed)
      : null;

    let bmi: number | null = null;
    let bmiCategory: string | null = null;
    const h = profile?.heightCm;
    const w = profile?.weightKg;
    if (h != null && w != null) {
      bmi = computeBmiServer(Number(h), Number(w));
      if (bmi != null) bmiCategory = bmiCategoryKo(bmi);
    }

    const foodCategory = normalizeFoodCategory(parsed.foodCategory);

    let profileForKcal: ProfileForKcalNote | null = null;
    if (h != null && w != null && h > 0 && w > 0) {
      profileForKcal = {
        heightCm: Number(h),
        weightKg: Number(w),
        birthDate: profile?.birthDate != null ? String(profile.birthDate).trim() || null : null,
        gender: profile?.gender != null ? String(profile.gender).trim() || null : null,
      };
    }

    const personalizedIntakeNote = nutritionParsed
      ? buildPersonalizedIntakeNote(
          bmi,
          bmiCategory,
          nutritionParsed.caloriesKcal ?? null,
          nutritionParsed.servingSizeText ?? null,
          nutritionParsed.basisIsPerServing ?? null,
          {
            foodCategory,
            sugarG: nutritionParsed.sugarG ?? null,
            productName: product.productName || null,
          },
          profileForKcal
        )
      : null;

    const personalizedIntakeFootnote =
      profileForKcal &&
      personalizedIntakeNote &&
      !personalizedIntakeNote.includes('양 안내는 줄였어요')
        ? PERSONALIZED_INTAKE_FOOTNOTE
        : null;

    const novaSubgroup = normalizeNovaSubgroup(novaGroup, parsed.novaSubgroup);
    // 대체 식품은 별도 /api/alternatives에서 비동기로 처리
    let alternativeFoodText: string | null = null;
    let alternativeFoodFromWebSearch = false;

    const result = {
      product,
      novaGroup,
      novaSubgroup,
      judgmentReason: (parsed.judgmentReason && String(parsed.judgmentReason).trim()) || null,
      concernIngredients,
      briefDescription: (parsed.briefDescription && String(parsed.briefDescription).trim()) || null,
      consumptionAdvice: (parsed.consumptionAdvice && String(parsed.consumptionAdvice).trim()) || null,
      foodCategory,
      nutrition: nutritionParsed,
      nutritionDailyPercent,
      personalizedIntakeNote,
      personalizedIntakeFootnote,
      alternativeFoodText,
      alternativeFoodFromWebSearch,
    };

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
