import { normalizeGeminiModelId } from '@/lib/gemini-models';

/** REST 베이스 (테스트용 프록시나 다른 리전이 필요하면 `GEMINI_API_BASE_URL`로 덮어쓰기). */
export const GEMINI_GENERATIVE_LANGUAGE_API_BASE =
  (typeof process !== 'undefined' && process.env.GEMINI_API_BASE_URL?.replace(/\/$/, '').trim()) ||
  'https://generativelanguage.googleapis.com/v1beta';

export const GEMINI_API_KEY_ENV_NAME = 'GEMINI_API_KEY';

export function readGeminiApiKeyFromEnv(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const k = process.env[GEMINI_API_KEY_ENV_NAME];
  if (k == null || String(k).trim() === '') return undefined;
  return String(k).trim();
}

/** `:generateContent` 까지의 경로 (쿼리 없음). */
export function geminiGenerateContentPath(modelId: string): string {
  const m = normalizeGeminiModelId(modelId);
  return `${GEMINI_GENERATIVE_LANGUAGE_API_BASE}/models/${m}:generateContent`;
}

export function geminiGenerateContentUrl(modelId: string, apiKey: string): string {
  return `${geminiGenerateContentPath(modelId)}?key=${encodeURIComponent(apiKey)}`;
}
