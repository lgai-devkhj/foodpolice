/**
 * Gemini REST API용 모델 ID (경로: v1beta/models/{id}:generateContent)
 * SDK 예시의 `models/gemini-2.5-flash` 형태도 허용 — 내부에서 접두어만 제거.
 */

export function normalizeGeminiModelId(id: string): string {
  return id.replace(/^models\//, '').trim();
}

function modelFromEnv(envName: string, fallback: string): string {
  const raw = process.env[envName];
  if (raw == null || String(raw).trim() === '') return fallback;
  return normalizeGeminiModelId(String(raw));
}

/** Google Search tool 그라운딩 — 대체 식품 `/api/alternatives` 등 */
export const SEARCH_MODEL = modelFromEnv('GEMINI_SEARCH_MODEL', 'gemini-2.5-flash');
