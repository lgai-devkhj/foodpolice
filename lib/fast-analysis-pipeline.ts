/**
 * 시연용 빠른 분석 — Gemini **2회** (Tesseract 없음):
 * 1) 멀티모달: 낮은 화질 이미지 → OCR JSON (`extractedText`)
 * 2) 텍스트만: `productName` + `processingLevel` + `flaggedIngredients` + 선택 `correctedOcrText`
 */
import { parseAndValidateFastAnalysisJson, parseGeminiOcrExtractedText } from '@/lib/fast-analysis-json';
import { buildFastAnalysisUserPromptFromOcrText, buildFastGeminiOcrPrompt } from '@/lib/fast-analysis-prompt';
import { mapFastPayloadToAnalysisResult } from '@/lib/fast-analysis-mapper';
import { formatGeminiHttpError, geminiErrorCodeFromBody } from '@/lib/gemini-http-error';
import { fetchGeminiGenerateContentOnce, type GeminiFetchWithFallbackResult } from '@/lib/gemini-fetch-with-fallback';
import {
  getGeminiCandidateText,
  getGeminiPromptBlockReason,
  hasGeminiCandidates,
} from '@/lib/gemini-response-envelope';
import { generationConfigJsonMode, inlineDataPart, textPart } from '@/lib/gemini-rest-body';
import {
  FAST_ANALYSIS_GEMINI_MODEL,
  FAST_ANALYSIS_MAX_OUTPUT_TOKENS,
  FAST_OCR_MAX_OUTPUT_TOKENS,
  isGemini3FamilyModelId,
} from '@/lib/gemini-models';
import { preprocessGeminiOcrText } from '@/lib/fast-analysis-preprocess';
import type { AnalysisResult } from '@/lib/store';

export type FastAnalyzePipelineError = {
  message: string;
  code: string;
  status: number;
};

/** 분석 요청 이미지(클라이언트에서 축소·JPEG된 base64) */
export type FastAnalysisImageInput = {
  mimeType: string;
  base64: string;
};

const MIN_OCR_CHARS = 4;

function buildThinkingGemini3() {
  return isGemini3FamilyModelId(FAST_ANALYSIS_GEMINI_MODEL)
    ? { thinkingLevel: 'minimal' as const }
    : {};
}

function buildOcrGenerationConfig() {
  return generationConfigJsonMode({
    maxOutputTokens: FAST_OCR_MAX_OUTPUT_TOKENS,
    temperature: 0,
    ...buildThinkingGemini3(),
  });
}

function buildAnalysisGenerationConfig() {
  return generationConfigJsonMode({
    maxOutputTokens: FAST_ANALYSIS_MAX_OUTPUT_TOKENS,
    temperature: 0,
    ...buildThinkingGemini3(),
  });
}

function buildOcrGenerationBody(hasTwoImages: boolean, imageParts: ReturnType<typeof inlineDataPart>[]) {
  const prompt = buildFastGeminiOcrPrompt(hasTwoImages);
  return {
    contents: [{ parts: [...imageParts, textPart(prompt)] }],
    generationConfig: buildOcrGenerationConfig(),
  };
}

function buildGenerationBodyTextOnly(ocrText: string, hasTwoImages: boolean) {
  const prompt = buildFastAnalysisUserPromptFromOcrText(ocrText, hasTwoImages);
  return {
    contents: [{ parts: [textPart(prompt)] }],
    generationConfig: buildAnalysisGenerationConfig(),
  };
}

function partTextFromUpstream(
  upstream: GeminiFetchWithFallbackResult,
): { partText: string } | { error: FastAnalyzePipelineError } {
  if (!upstream.ok) {
    const code = geminiErrorCodeFromBody(upstream.text) ?? 'GEMINI_HTTP';
    return {
      error: {
        message: formatGeminiHttpError(upstream.status, upstream.text),
        code,
        status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      },
    };
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(upstream.text) as Record<string, unknown>;
  } catch {
    return {
      error: {
        message: 'AI 응답 포맷을 읽지 못했어요.',
        code: 'ENVELOPE_JSON',
        status: 502,
      },
    };
  }

  const blockReason = getGeminiPromptBlockReason(envelope);
  if (blockReason) {
    return {
      error: {
        message:
          '이 요청은 안전 정책으로 처리할 수 없어요. 다른 사진이나 표시만 있는 화면으로 시도해요.',
        code: `PROMPT_BLOCKED:${blockReason}`,
        status: 400,
      },
    };
  }

  if (!hasGeminiCandidates(envelope)) {
    return {
      error: {
        message: 'AI가 응답을 만들지 못했어요. 잠시 뒤 다시 시도해요.',
        code: 'NO_CANDIDATES',
        status: 502,
      },
    };
  }

  const partText = getGeminiCandidateText(envelope);
  if (!partText || typeof partText !== 'string') {
    return {
      error: {
        message: '분석 텍스트를 받지 못했어요. 잠시 뒤 다시 눌러요.',
        code: 'NO_MODEL_TEXT',
        status: 500,
      },
    };
  }

  return { partText };
}

async function runGeminiAndMap(
  geminiKey: string,
  generationBody: object,
  mapOpts: { rawMaterialsFromOcr?: string },
): Promise<{ result: AnalysisResult } | { error: FastAnalyzePipelineError }> {
  const upstream = await fetchGeminiGenerateContentOnce(
    FAST_ANALYSIS_GEMINI_MODEL,
    geminiKey,
    generationBody,
    'api/analyze:fast:analyze',
  );

  const pt = partTextFromUpstream(upstream);
  if ('error' in pt) return pt;

  const payload = parseAndValidateFastAnalysisJson(pt.partText);
  if (!payload) {
    return {
      error: {
        message: '결과 JSON을 읽는 데 실패했어요. 다시 한번 눌러요.',
        code: 'FAST_RESULT_JSON',
        status: 500,
      },
    };
  }

  return { result: mapFastPayloadToAnalysisResult(payload, mapOpts) };
}

/**
 * @param images — 단일: [라벨], 이중: [원재료, 영양]
 */
export async function runFastAnalysisPipeline(
  geminiKey: string,
  hasTwoImages: boolean,
  images: FastAnalysisImageInput[],
): Promise<{ result: AnalysisResult } | { error: FastAnalyzePipelineError }> {
  const imageParts = images.map((im) => inlineDataPart(im.mimeType, im.base64));
  const ocrBody = buildOcrGenerationBody(hasTwoImages, imageParts);

  const ocrUpstream = await fetchGeminiGenerateContentOnce(
    FAST_ANALYSIS_GEMINI_MODEL,
    geminiKey,
    ocrBody,
    'api/analyze:fast:ocr',
  );

  const ocrPt = partTextFromUpstream(ocrUpstream);
  if ('error' in ocrPt) return ocrPt;

  const ocrRaw = parseGeminiOcrExtractedText(ocrPt.partText);
  const ocrText = ocrRaw != null ? preprocessGeminiOcrText(ocrRaw) : '';
  if (!ocrText || ocrText.length < MIN_OCR_CHARS) {
    return {
      error: {
        message: '라벨 글자를 충분히 읽지 못했어요. 더 밝게·가깝게 찍어 다시 시도해요.',
        code: 'OCR_EMPTY',
        status: 422,
      },
    };
  }

  const analysisBody = buildGenerationBodyTextOnly(ocrText, hasTwoImages);
  return runGeminiAndMap(geminiKey, analysisBody, { rawMaterialsFromOcr: ocrText });
}
