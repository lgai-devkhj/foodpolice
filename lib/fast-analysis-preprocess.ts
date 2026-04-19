/**
 * 빠른 분석 파이프라인용 텍스트 전처리 (결정적·서버에서만).
 * Gemini 1차 OCR 직후·표시용 문자열에 공통 적용.
 */

/** 제로폭·BOM 제거 후 NFKC 정규화 */
export function preprocessGeminiOcrText(input: string): string {
  if (!input) return '';
  let s = input.replace(/\uFEFF/g, '');
  s = s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  try {
    s = s.normalize('NFKC');
  } catch {
    /* ignore */
  }
  s = s.replace(/\t/g, ' ');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = s.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    let L = line.replace(/[ \u00A0]+/g, ' ').trimEnd();
    L = L.trimStart();
    out.push(L);
  }
  s = out.join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** 표시용: 보정문·원재료 필드에 넣기 전 한 번 더 다듬음 */
export function preprocessDisplayLabelText(input: string): string {
  const t = preprocessGeminiOcrText(input);
  return t.slice(0, 12000);
}
