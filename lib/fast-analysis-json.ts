import { parseGeminiModelObject } from '@/lib/parse-gemini-model-json';
import type { FastAnalysisGeminiPayload, FastProcessingLevel } from '@/lib/fast-analysis-types';

/**
 * 1차 OCR 호출 응답에서 `extractedText` 추출. 없거나 비어 있으면 null.
 */
export function parseGeminiOcrExtractedText(raw: string): string | null {
  const obj = parseGeminiModelObject(raw);
  if (!obj || typeof obj !== 'object') return null;
  const t =
    obj.extractedText ??
    (obj as Record<string, unknown>).extracted_text ??
    (obj as Record<string, unknown>).text;
  const s = typeof t === 'string' ? t.trim() : '';
  return s.length > 0 ? s : null;
}

const LEVELS = new Set<FastProcessingLevel>(['1', '2', '3', '4A', '4B', '4C']);

function normalizeLevel(v: unknown): FastProcessingLevel {
  const s = String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/^GROUP\s*/i, '')
    .replace(/^NOVA\s*/i, '');
  const compact = s.replace(/\s+/g, '');
  if (LEVELS.has(compact as FastProcessingLevel)) return compact as FastProcessingLevel;
  if (compact === '4' || compact === 'IV' || compact === 'GROUP4') return '4B';
  if (s === '1' || compact === 'I') return '1';
  if (s === '2' || compact === 'II') return '2';
  if (s === '3' || compact === 'III') return '3';
  return '3';
}

function normalizeFlagged(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (out.length >= 2) break;
    const name = String(x ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (name.length > 0 && name.length <= 80) out.push(name);
  }
  return out;
}

function normalizeCorrectedOcr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.slice(0, 12000);
}

function normalizeProductName(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return s.length > 0 ? s : undefined;
}

/**
 * Gemini 후보 텍스트 → 검증된 페이로드. 실패 시 null.
 */
export function parseAndValidateFastAnalysisJson(raw: string): FastAnalysisGeminiPayload | null {
  const obj = parseGeminiModelObject(raw);
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  const pl = obj.processingLevel ?? rec['processing_level'];
  const fi = obj.flaggedIngredients ?? rec['flagged_ingredients'];
  const corrected =
    normalizeCorrectedOcr(rec['correctedOcrText'] ?? rec['corrected_ocr_text']) ?? undefined;
  const pn =
    normalizeProductName(rec['productName'] ?? rec['product_name']) ?? undefined;
  return {
    processingLevel: normalizeLevel(pl),
    flaggedIngredients: normalizeFlagged(fi),
    ...(pn != null ? { productName: pn } : {}),
    ...(corrected != null ? { correctedOcrText: corrected } : {}),
  };
}
