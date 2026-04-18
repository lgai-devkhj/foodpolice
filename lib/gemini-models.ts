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

/**
 * `/api/analyze`, `/api/compare` 등 generateContent 공통 모델. (`/api/quiz`는 `lib/gemini-prompts`의 `GEMINI_MODEL` 사용)
 * 기본은 **gemini-3.1-flash-lite**.
 * 다른 모델을 쓰려면 `GEMINI_ANALYSIS_MODEL`(예: gemini-3.1-flash-lite)로 지정.
 */
export const ANALYSIS_GEMINI_MODEL = modelFromEnv('GEMINI_ANALYSIS_MODEL', 'gemini-3.1-flash-lite');

/**
 * 기본 모델이 503·429 등으로 실패할 때 `generateContent` 재시도용 모델.
 * (환경 변수로 덮어쓰지 않음 — 안정성 우선 고정값)
 */
export const GEMINI_FALLBACK_FLASH_MODEL = 'gemini-2.5-flash';

/**
 * 분석·비교 JSON 응답 상한. 8192는 출력이 길어질수록 지연이 커질 수 있어 4096로 제한.
 * 잘리면(MAX_TOKENS) 환경 변수 `GEMINI_ANALYSIS_MAX_OUTPUT_TOKENS`로 올리면 됨.
 */
function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32768) : fallback;
}

export const ANALYSIS_MAX_OUTPUT_TOKENS = parsePositiveIntEnv('GEMINI_ANALYSIS_MAX_OUTPUT_TOKENS', 4096);
