import type { AnalysisResult } from '@/lib/store';
import type { FastAnalysisGeminiPayload } from '@/lib/fast-analysis-types';
import { preprocessDisplayLabelText } from '@/lib/fast-analysis-preprocess';

const PLACEHOLDER_EXPL = '시연 빠른 분석에서는 설명을 생략했어요.';

function novaFromLevel(level: string): { novaGroup: number; novaSubgroup?: string | null } {
  if (level.startsWith('4')) {
    const sub = level === '4A' || level === '4B' || level === '4C' ? level : '4B';
    return { novaGroup: 4, novaSubgroup: sub };
  }
  const n = parseInt(level, 10);
  if (n >= 1 && n <= 3) return { novaGroup: n, novaSubgroup: null };
  return { novaGroup: 3, novaSubgroup: null };
}

export type MapFastPayloadOptions = {
  /** 1차(Gemini OCR) 등으로 추출한 원재료·라벨 텍스트(표시용) */
  rawMaterialsFromOcr?: string;
};

/**
 * 최소 JSON → 기존 `AnalysisResult` 호환 객체(시연 모드). 긴 문구·영양·대체식품 없음.
 */
export function mapFastPayloadToAnalysisResult(
  payload: FastAnalysisGeminiPayload,
  opts?: MapFastPayloadOptions,
): AnalysisResult {
  const { novaGroup, novaSubgroup } = novaFromLevel(payload.processingLevel);
  const concerns = payload.flaggedIngredients.map((name) => ({
    name,
    explanation: PLACEHOLDER_EXPL,
  }));
  const corrected = payload.correctedOcrText != null && String(payload.correctedOcrText).trim()
    ? preprocessDisplayLabelText(String(payload.correctedOcrText))
    : '';
  const fallbackRaw =
    opts?.rawMaterialsFromOcr != null && String(opts.rawMaterialsFromOcr).trim()
      ? preprocessDisplayLabelText(String(opts.rawMaterialsFromOcr))
      : '';
  const raw = corrected || fallbackRaw;
  const displayName =
    payload.productName != null && String(payload.productName).trim()
      ? String(payload.productName).trim().slice(0, 120)
      : '제품명 미확인';

  return {
    product: {
      productName: displayName,
      companyName: '',
      rawMaterials: raw,
    },
    novaGroup,
    novaSubgroup: novaSubgroup ?? null,
    judgmentReason: null,
    concernIngredients: concerns,
    estimatedIngredients: null,
    keyInsights: null,
    analysisConfidence: 'low',
    labelExplicitPercentages: null,
    briefDescription: null,
    consumptionAdvice: null,
    foodCategory: null,
    nutrition: null,
    nutritionDailyPercent: null,
    personalizedIntakeNote: null,
    personalizedIntakeFootnote: null,
    alternativeFoodText: null,
    alternativeFoodFromWebSearch: false,
    alternativeFoodEngineFallback: false,
    alternativeUnavailableReason: null,
    alternativeFoodLoaded: true,
    alternativeFoodNotice:
      novaGroup >= 3
        ? '시연 빠른 분석에서는 대체 식품 웹 검색을 생략해요.'
        : 'NOVA 1~2단계예요. 시연 모드에서는 대체 식품 안내를 생략해요.',
    alternativeFoodUserRequested: false,
    dailyQuestProductMatch: false,
    fastAnalysisDemo: true,
  };
}
