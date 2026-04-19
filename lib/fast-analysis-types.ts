/** 시연용 빠른 분석 — Gemini 2차 응답 스키마 */
export type FastProcessingLevel = '1' | '2' | '3' | '4A' | '4B' | '4C';

export interface FastAnalysisGeminiPayload {
  /** 라벨에서 읽은 대표 식품명(짧게). 없으면 빈 문자열 */
  productName?: string | null;
  processingLevel: FastProcessingLevel;
  /** 최대 2개 — 라벨에 보이는 짧은 성분명(OCR 오타는 읽기 쉬운 표기로 보정) */
  flaggedIngredients: string[];
  /**
   * OCR·문맥을 바탕으로 읽기 좋게 고친 전체 라벨 텍스트.
   * 없거나 비우면 전처리된 1차 OCR만 표시.
   */
  correctedOcrText?: string | null;
}
