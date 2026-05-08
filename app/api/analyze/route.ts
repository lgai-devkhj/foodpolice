import { NextRequest, NextResponse } from 'next/server';
import {
  getFoodPoliceSystemPolicyPrompt,
  getPackageAnalyzeUserTurn,
  getSingleProductJsonSchemaExample,
  getTwoImageAnalyzeUserTurn,
  type BmiTier,
  type PersonalizationInput,
} from '@/lib/gemini-prompts';
import { readGeminiApiKeyFromEnv } from '@/lib/gemini-api';
import { evaluateAnalysisGeminiConditions } from '@/lib/analysis-output-conditions';
import { computeBmiServer } from '@/lib/nutrition-daily';
import { buildAnalysisResultFromGeminiObject } from '@/lib/gemini-product-from-json';
import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
import { formatGeminiHttpError, geminiErrorCodeFromBody } from '@/lib/gemini-http-error';
import { apiErrorBody } from '@/lib/read-api-json';
import {
  getGeminiCandidateText,
  getGeminiPromptBlockReason,
  hasGeminiCandidates,
} from '@/lib/gemini-response-envelope';
import { generationConfigJsonMode, inlineDataPart, textPart } from '@/lib/gemini-rest-body';
import { fetchGeminiGenerateContentWithFlashFallback } from '@/lib/gemini-fetch-with-fallback';
import {
  ANALYSIS_GEMINI_MODEL,
  ANALYSIS_MAX_OUTPUT_TOKENS,
  gemini3ThinkingLevelForStructured,
} from '@/lib/gemini-models';

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
}

function profileToPersonalization(profile?: AnalyzeBody['profile']): PersonalizationInput | null {
  const h = profile?.heightCm;
  const w = profile?.weightKg;
  if (h == null || w == null || Number(h) <= 0 || Number(w) <= 0) return null;
  const bmi = computeBmiServer(Number(h), Number(w));
  if (bmi == null) return null;
  const bmiTier: BmiTier =
    bmi < 18.5 ? 'underweight' : bmi <= 22.9 ? 'normal' : bmi <= 24.9 ? 'overweight' : 'obese';
  return { bmiValue: bmi, bmiTier };
}

function coerceNovaGroupInPlace(rec: Record<string, unknown>): void {
  const current = rec.novaGroup;
  const num =
    typeof current === 'number'
      ? current
      : current != null
        ? parseInt(String(current).trim(), 10)
        : Number.NaN;
  if (Number.isFinite(num) && num >= 1 && num <= 4) {
    rec.novaGroup = Math.trunc(num);
    if (Math.trunc(num) === 4) {
      const sub = String(rec.novaSubgroup ?? '').trim().toUpperCase();
      if (sub !== '4A' && sub !== '4B' && sub !== '4C') {
        rec.novaSubgroup = '4B';
      }
    }
    return;
  }

  const subgroup = String(
    rec.novaSubgroup ?? rec.nova_subgroup ?? rec.novaSubGroup ?? rec.group4Subgroup ?? ''
  )
    .trim()
    .toUpperCase();
  if (subgroup === '4A' || subgroup === '4B' || subgroup === '4C') {
    rec.novaGroup = 4;
    rec.novaSubgroup = subgroup;
    return;
  }

  // 실사용 안정성 우선: 모델이 누락해도 기본 Group 4로 보정해 502를 막아요.
  rec.novaGroup = 4;
  rec.novaSubgroup = '4B';
}

function normalizeAnalysisRecordInPlace(rec: Record<string, unknown>): void {
  const aliasMap: Array<[string, string]> = [
    ['product_name', 'productName'],
    ['name', 'productName'],
    ['company', 'companyName'],
    ['brand', 'companyName'],
    ['company_name', 'companyName'],
    ['raw_materials', 'rawMaterials'],
    ['ingredients', 'rawMaterials'],
    ['ingredientList', 'rawMaterials'],
    ['nova_group', 'novaGroup'],
    ['group', 'novaGroup'],
    ['nova_subgroup', 'novaSubgroup'],
    ['subgroup', 'novaSubgroup'],
    ['brief_description', 'briefDescription'],
    ['consumption_advice', 'consumptionAdvice'],
    ['food_category', 'foodCategory'],
    ['nutritionInfo', 'nutrition'],
  ];
  for (const [from, to] of aliasMap) {
    if (rec[to] == null && rec[from] != null) rec[to] = rec[from];
  }

  if (Array.isArray(rec.products) && rec.products.length > 0 && rec.productName == null) {
    const p0 = rec.products[0];
    if (p0 && typeof p0 === 'object' && !Array.isArray(p0)) {
      const o = p0 as Record<string, unknown>;
      if (o.productName != null) rec.productName = o.productName;
      if (o.companyName != null) rec.companyName = o.companyName;
      if (o.rawMaterials != null) rec.rawMaterials = o.rawMaterials;
    }
  }
}

function buildAnalyzeShapeRepairText(hasTwoImages: boolean): string {
  const modeHint = hasTwoImages
    ? '입력은 1) 원재료/제품표시 2) 영양표 이미지 순서예요.'
    : '입력은 단일 라벨 이미지예요.';
  return [
    '[형식 복구 - 매우 중요]',
    '- 반드시 JSON 객체 하나만 출력해요.',
    '- 키는 스키마와 동일하게 사용해요.',
    '- 마크다운, 코드블록, 설명 문장은 금지예요.',
    modeHint,
    '[JSON 스키마]',
    getSingleProductJsonSchemaExample(),
  ].join('\n');
}

function hasMeaningfulNutrition(rec: Record<string, unknown>): boolean {
  const nutrition = rec.nutrition;
  const o =
    nutrition && typeof nutrition === 'object' && !Array.isArray(nutrition)
      ? (nutrition as Record<string, unknown>)
      : null;
  if (!o) return false;
  const hasNumbers = [
    'caloriesKcal',
    'sodiumMg',
    'carbsG',
    'sugarG',
    'proteinG',
    'fatG',
    'saturatedFatG',
    'transFatG',
    'cholesterolMg',
    'dietaryFiberG',
  ].some((k) => o[k] != null && String(o[k]).trim() !== '');
  const rows = Array.isArray(o.tableRows) ? o.tableRows : [];
  return hasNumbers || rows.length > 0;
}

function shouldRunOcrRecovery(rec: Record<string, unknown>, hasTwoImages: boolean): boolean {
  const rawMaterials = String(rec.rawMaterials ?? '').trim();
  const rawTooShort = rawMaterials.length > 0 && rawMaterials.length < 20;
  const rawMissing = rawMaterials.length === 0;
  // 지연을 줄이기 위해 복구 호출은 "원재료 인식 실패/불충분"일 때만 실행해요.
  // 영양표만 비는 경우는 추가 호출 대신 플레이스홀더를 채워 UI 빈칸을 막아요.
  return rawMissing || rawTooShort;
}

function buildOcrRecoveryPrompt(hasTwoImages: boolean): string {
  return [
    '[OCR 복구 추출 - 매우 중요]',
    hasTwoImages
      ? '- 이미지 순서: 1) 원재료/제품표시 2) 영양정보 표'
      : '- 이미지 1장에서 제품명/원재료/영양표를 최대한 정확히 읽어요.',
    '- 반드시 JSON 객체 하나만 출력해요.',
    '- 원재료명은 보이는 항목을 가능한 끝까지 이어서 추출해요. 앞 일부만 잘라 쓰지 않아요.',
    '- 쉼표로 구분된 원재료는 중간에서 임의로 끊지 않아요.',
    '- 영양표가 보이면 nutrition 숫자와 tableRows를 채워요.',
    '- 안 보이는 항목만 null/빈값으로 두고, 보이는 항목은 최대한 채워요.',
    '- 마크다운, 코드블록, 설명 문장은 금지예요.',
    '[JSON 스키마]',
    getSingleProductJsonSchemaExample(),
  ].join('\n');
}

function buildRawMaterialsOnlyRecoveryPrompt(): string {
  return [
    '[원재료 OCR 복구 - 최우선]',
    '- 입력 이미지는 원재료/제품표시 라벨이에요.',
    '- rawMaterials를 가능한 끝까지 정확히 읽어 한 줄 문자열로 출력해요.',
    '- productName, companyName도 보이면 같이 채워요.',
    '- 다른 설명 문장 없이 JSON 하나만 출력해요.',
    '[JSON 출력]',
    JSON.stringify({
      productName: '',
      companyName: '',
      rawMaterials: '',
    }),
  ].join('\n');
}

function ensureNutritionPlaceholderInPlace(rec: Record<string, unknown>, hasTwoImages: boolean): void {
  if (!hasTwoImages) return;
  if (hasMeaningfulNutrition(rec)) return;
  rec.nutrition = {
    caloriesKcal: null,
    sodiumMg: null,
    carbsG: null,
    sugarG: null,
    proteinG: null,
    fatG: null,
    saturatedFatG: null,
    transFatG: null,
    cholesterolMg: null,
    dietaryFiberG: null,
    servingSizeText: '영양표 판독이 불안정해요. 다시 촬영하면 더 정확해져요.',
    basisIsPerServing: null,
    tableRows: [{ name: '영양표', amount: '판독 불가' }],
  };
}

type AnalyzeBlocker = { message: string; code: string };

function detectAnalyzeBlocker(rec: Record<string, unknown>, hasTwoImages: boolean): AnalyzeBlocker | null {
  const rawMaterials = String(rec.rawMaterials ?? '').trim();
  const productName = String(rec.productName ?? '').trim();
  const companyName = String(rec.companyName ?? '').trim();

  if (!rawMaterials) {
    return {
      message:
        '원재료명이 잘 보이게 다시 촬영해주세요. 원재료표 전체가 선명하게 나오도록 가까이 찍어주세요.',
      code: 'RAW_MATERIALS_UNREADABLE',
    };
  }

  if (!productName && !companyName && rawMaterials.length < 6) {
    return {
      message: '라벨 글자가 흐려요. 제품명과 원재료가 함께 보이도록 다시 촬영해주세요.',
      code: 'LABEL_TEXT_UNREADABLE',
    };
  }

  // 영양표 누락은 오탐이 잦아 분석 자체는 계속 진행해요.
  // (원재료/라벨 판독 불가만 차단)

  return null;
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
      profile,
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

    const key = readGeminiApiKeyFromEnv();
    if (!key || key.length === 0) {
      return NextResponse.json(
        apiErrorBody('AI 키가 서버에 설정돼 있지 않아요. 관리자에게 문의해요.', 'NO_API_KEY'),
        { status: 500 },
      );
    }

    const personalization = profileToPersonalization(profile);
    const systemPolicy = getFoodPoliceSystemPolicyPrompt('standard');
    const userTurnText = hasTwoImages
      ? getTwoImageAnalyzeUserTurn(personalization)
      : getPackageAnalyzeUserTurn(personalization);

    const parts = hasTwoImages
      ? [
          inlineDataPart(rawMimeType, rawImageBase64 || ''),
          inlineDataPart(nutritionMimeType, nutritionImageBase64 || ''),
          textPart(userTurnText),
        ]
      : [inlineDataPart(mimeType, imageBase64 || ''), textPart(userTurnText)];

    const generationBody = {
      systemInstruction: { parts: [textPart(systemPolicy)] },
      contents: [{ parts }],
      generationConfig: generationConfigJsonMode({
        maxOutputTokens: ANALYSIS_MAX_OUTPUT_TOKENS,
        temperature: 0,
        thinkingLevel: gemini3ThinkingLevelForStructured(ANALYSIS_GEMINI_MODEL),
      }),
    };

    const upstream = await fetchGeminiGenerateContentWithFlashFallback(
      ANALYSIS_GEMINI_MODEL,
      key,
      generationBody,
      'api/analyze',
    );
    const text = upstream.text;
    if (!upstream.ok) {
      const clientStatus = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
      const upstreamCode = geminiErrorCodeFromBody(text);
      return NextResponse.json(
        apiErrorBody(formatGeminiHttpError(upstream.status, text), upstreamCode),
        { status: clientStatus },
      );
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] envelope JSON.parse failed', text.slice(0, 800));
      }
      return NextResponse.json(
        apiErrorBody('AI 응답을 읽지 못했어요. 잠시 뒤 다시 시도해요.', 'ENVELOPE_JSON'),
        { status: 502 },
      );
    }

    const blockReason = getGeminiPromptBlockReason(data);
    if (blockReason) {
      return NextResponse.json(
        apiErrorBody(
          '이 요청은 안전 정책으로 처리할 수 없어요. 다른 사진으로 시도해요.',
          `PROMPT_BLOCKED:${blockReason}`,
        ),
        { status: 400 },
      );
    }

    if (!hasGeminiCandidates(data)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] empty candidates', JSON.stringify(data).slice(0, 2000));
      }
      return NextResponse.json(
        apiErrorBody('AI가 응답을 만들지 못했어요. 잠시 뒤 다시 시도해요.', 'NO_CANDIDATES'),
        { status: 502 },
      );
    }

    const cand = (data as { candidates?: Array<{ finishReason?: string }> })?.candidates?.[0];
    const finishReason = cand?.finishReason;
    const partText = getGeminiCandidateText(data);

    if (!partText || typeof partText !== 'string') {
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return NextResponse.json(
          apiErrorBody('이미지를 분석할 수 없어요. 다른 사진으로 시도해요.', finishReason || 'BLOCKED'),
          { status: 500 },
        );
      }
      if (finishReason === 'MAX_TOKENS') {
        return NextResponse.json(
          apiErrorBody('분석 응답이 잘렸어요. 다시 시도해요.', 'MAX_TOKENS'),
          { status: 500 },
        );
      }
      return NextResponse.json(
        apiErrorBody(
          '분석 결과를 받지 못했어요. 잠시 뒤에 다시 눌러요.',
          finishReason ? String(finishReason) : 'NO_MODEL_TEXT',
        ),
        { status: 500 },
      );
    }

    let parsed = parseGeminiModelObject(partText);
    if (!parsed || typeof parsed !== 'object') {
      const repairText = buildAnalyzeShapeRepairText(hasTwoImages);
      const repairParts = hasTwoImages
        ? [
            inlineDataPart(rawMimeType, rawImageBase64 || ''),
            inlineDataPart(nutritionMimeType, nutritionImageBase64 || ''),
            textPart(repairText),
          ]
        : [inlineDataPart(mimeType, imageBase64 || ''), textPart(repairText)];
      const repairBody = {
        systemInstruction: { parts: [textPart(systemPolicy)] },
        contents: [{ parts: repairParts }],
        generationConfig: generationConfigJsonMode({
          maxOutputTokens: ANALYSIS_MAX_OUTPUT_TOKENS,
          temperature: 0,
          thinkingLevel: gemini3ThinkingLevelForStructured(ANALYSIS_GEMINI_MODEL),
        }),
      };
      const repaired = await fetchGeminiGenerateContentWithFlashFallback(
        ANALYSIS_GEMINI_MODEL,
        key,
        repairBody,
        'api/analyze:shape-repair',
      );
      if (repaired.ok) {
        try {
          const repairedEnvelope = JSON.parse(repaired.text) as Record<string, unknown>;
          if (hasGeminiCandidates(repairedEnvelope)) {
            const repairedText = getGeminiCandidateText(repairedEnvelope);
            if (repairedText && typeof repairedText === 'string') {
              parsed = parseGeminiModelObject(repairedText);
            }
          }
        } catch {
          // ignore and fallback to original failure
        }
      }
      if (!parsed || typeof parsed !== 'object') {
        if (process.env.NODE_ENV === 'development') {
          console.error('[api/analyze] RESULT_JSON raw head:', partText.slice(0, 2500));
        }
        return NextResponse.json(
          apiErrorBody('결과 형식을 정리하지 못했어요. 라벨이 선명한 사진으로 다시 시도해요.', 'RESULT_JSON'),
          { status: 500 },
        );
      }
    }

    const rec = parsed as Record<string, unknown>;
    normalizeAnalysisRecordInPlace(rec);
    coerceNovaGroupInPlace(rec);
    if (shouldRunOcrRecovery(rec, hasTwoImages)) {
      const recoveryPrompt = buildOcrRecoveryPrompt(hasTwoImages);
      const recoveryParts = hasTwoImages
        ? [
            inlineDataPart(rawMimeType, rawImageBase64 || ''),
            inlineDataPart(nutritionMimeType, nutritionImageBase64 || ''),
            textPart(recoveryPrompt),
          ]
        : [inlineDataPart(mimeType, imageBase64 || ''), textPart(recoveryPrompt)];
      const recoveryBody = {
        systemInstruction: { parts: [textPart(systemPolicy)] },
        contents: [{ parts: recoveryParts }],
        generationConfig: generationConfigJsonMode({
          maxOutputTokens: ANALYSIS_MAX_OUTPUT_TOKENS,
          temperature: 0,
          thinkingLevel: gemini3ThinkingLevelForStructured(ANALYSIS_GEMINI_MODEL),
        }),
      };
      const recoveredUpstream = await fetchGeminiGenerateContentWithFlashFallback(
        ANALYSIS_GEMINI_MODEL,
        key,
        recoveryBody,
        'api/analyze:ocr-recovery',
      );
      if (recoveredUpstream.ok) {
        try {
          const recoveredEnvelope = JSON.parse(recoveredUpstream.text) as Record<string, unknown>;
          if (hasGeminiCandidates(recoveredEnvelope)) {
            const recoveredText = getGeminiCandidateText(recoveredEnvelope);
            if (recoveredText && typeof recoveredText === 'string') {
              const recoveredObj = parseGeminiModelObject(recoveredText);
              if (recoveredObj && typeof recoveredObj === 'object') {
                const r = recoveredObj as Record<string, unknown>;
                normalizeAnalysisRecordInPlace(r);
                if (String(r.rawMaterials ?? '').trim().length >= String(rec.rawMaterials ?? '').trim().length) {
                  rec.rawMaterials = r.rawMaterials;
                }
                if (String(r.productName ?? '').trim().length > String(rec.productName ?? '').trim().length) {
                  rec.productName = r.productName;
                }
                if (!hasMeaningfulNutrition(rec) && hasMeaningfulNutrition(r)) {
                  rec.nutrition = r.nutrition;
                }
              }
            }
          }
        } catch {
          // 복구 실패 시 기존 rec로 계속 진행해요.
        }
      }
    }
    const recRaw = String(rec.rawMaterials ?? '').trim();
    if (recRaw.length > 0 && recRaw.length < 28) {
      const rawOnlyPrompt = buildRawMaterialsOnlyRecoveryPrompt();
      const rawOnlyBody = {
        systemInstruction: { parts: [textPart(systemPolicy)] },
        contents: [{ parts: [inlineDataPart(hasTwoImages ? rawMimeType : mimeType, hasTwoImages ? (rawImageBase64 || '') : (imageBase64 || '')), textPart(rawOnlyPrompt)] }],
        generationConfig: generationConfigJsonMode({
          maxOutputTokens: 800,
          temperature: 0,
          thinkingLevel: gemini3ThinkingLevelForStructured(ANALYSIS_GEMINI_MODEL),
        }),
      };
      const rawRecovered = await fetchGeminiGenerateContentWithFlashFallback(
        ANALYSIS_GEMINI_MODEL,
        key,
        rawOnlyBody,
        'api/analyze:raw-materials-recovery',
      );
      if (rawRecovered.ok) {
        try {
          const rawEnvelope = JSON.parse(rawRecovered.text) as Record<string, unknown>;
          if (hasGeminiCandidates(rawEnvelope)) {
            const rawText = getGeminiCandidateText(rawEnvelope);
            if (rawText && typeof rawText === 'string') {
              const rawObj = parseGeminiModelObject(rawText);
              if (rawObj && typeof rawObj === 'object') {
                const r = rawObj as Record<string, unknown>;
                normalizeAnalysisRecordInPlace(r);
                const newRaw = String(r.rawMaterials ?? '').trim();
                if (newRaw.length > recRaw.length + 8) {
                  rec.rawMaterials = newRaw;
                }
                const newName = String(r.productName ?? '').trim();
                if (newName.length > String(rec.productName ?? '').trim().length) {
                  rec.productName = newName;
                }
                const newCompany = String(r.companyName ?? '').trim();
                if (newCompany.length > String(rec.companyName ?? '').trim().length) {
                  rec.companyName = newCompany;
                }
              }
            }
          }
        } catch {
          // ignore recovery parsing failure
        }
      }
    }
    ensureNutritionPlaceholderInPlace(rec, hasTwoImages);
    const blocker = detectAnalyzeBlocker(rec, hasTwoImages);
    if (blocker) {
      // 실사용 우선: 분석을 막지 않고 결과는 반환해요.
      // 인식이 약한 경우에는 최소 필드를 채워 UI가 비지 않게 유지합니다.
      if (String(rec.productName ?? '').trim().length === 0) rec.productName = '제품명을 확인 중이에요';
      if (String(rec.rawMaterials ?? '').trim().length === 0) {
        rec.rawMaterials = '원재료 인식이 불안정해요. 라벨을 더 가까이 촬영하면 정확도가 올라가요.';
      }
      if (process.env.NODE_ENV === 'development') {
        console.warn('[api/analyze] blocker detected but continue:', blocker.code);
      }
    }
    const conditionChecks = evaluateAnalysisGeminiConditions(rec);
    const fatalConditions = conditionChecks.filter(
      (c) => c.severity === 'error' && c.id !== 'COND_NOVA_GROUP_RANGE'
    );
    if (fatalConditions.length > 0) {
      const first = fatalConditions[0]!;
      if (process.env.NODE_ENV === 'development') {
        console.warn('[api/analyze] 조건 위반', conditionChecks);
      }
      return NextResponse.json(
        apiErrorBody(first.detail, first.id),
        { status: 502 },
      );
    }
    if (conditionChecks.length > 0 && process.env.NODE_ENV === 'development') {
      console.warn('[api/analyze] 조건 경고(계속 처리)', conditionChecks);
    }

    try {
      const result = buildAnalysisResultFromGeminiObject(rec);
      return NextResponse.json(result);
    } catch (buildErr) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/analyze] buildAnalysisResultFromGeminiObject', buildErr);
      }
      return NextResponse.json(
        apiErrorBody('분석 결과를 가공하는 데 실패했어요. 다시 시도해요.', 'BUILD_RESULT'),
        { status: 500 },
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해요.';
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/analyze] SERVER', e);
    }
    return NextResponse.json(apiErrorBody(message, 'SERVER'), { status: 500 });
  }
}
