/**
 * 시연용 빠른 분석 파이프라인 — `import { … } from '@/lib/fast-analysis'`
 */
export type { FastAnalysisGeminiPayload, FastProcessingLevel } from '@/lib/fast-analysis-types';
export { buildFastGeminiOcrPrompt, buildFastAnalysisUserPromptFromOcrText } from '@/lib/fast-analysis-prompt';
export { parseAndValidateFastAnalysisJson, parseGeminiOcrExtractedText } from '@/lib/fast-analysis-json';
export { tesseractExtractFromBase64Images } from '@/lib/tesseract-ocr';
export type { TesseractOcrItem } from '@/lib/tesseract-ocr';
export { mapFastPayloadToAnalysisResult } from '@/lib/fast-analysis-mapper';
export { runFastAnalysisPipeline } from '@/lib/fast-analysis-pipeline';
export type {
  FastAnalyzePipelineError,
  FastAnalysisImageInput,
} from '@/lib/fast-analysis-pipeline';
