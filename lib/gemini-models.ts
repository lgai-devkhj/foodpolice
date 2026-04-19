/**
 * Gemini REST API용 모델 ID (경로: v1beta/models/{id}:generateContent)
 * SDK 예시의 `models/gemini-2.5-flash` 형태도 허용 — 내부에서 접두어만 제거.
 */

/** 환경 변수 등에 쓴 짧은 이름 → 실제 REST 모델 ID. 필요 시 항목만 추가. */
const GEMINI_MODEL_ID_ALIASES: Record<string, string> = {};

export function normalizeGeminiModelId(id: string): string {
  const base = id.replace(/^models\//, '').trim();
  return GEMINI_MODEL_ID_ALIASES[base] ?? base;
}

/** Gemini 3.x는 generationConfig.thinkingConfig(추론 깊이)를 쓸 수 있다. 2.5 폴백과는 호환되지 않아 폴백 시 제거한다. */
export function isGemini3FamilyModelId(id: string): boolean {
  return normalizeGeminiModelId(id).startsWith('gemini-3');
}

function modelFromEnv(envName: string, fallback: string): string {
  const raw = process.env[envName];
  if (raw == null || String(raw).trim() === '') return fallback;
  return normalizeGeminiModelId(String(raw));
}

/**
 * `fetchGeminiGenerateContentWithFlashFallback` 워터폴(중복 제거 후 primary 뒤에 이어 붙음).
 * 순서: 2.5 flash lite → 2.5 flash → 2.0 flash (`gemini-2.0-flash`).
 */
export const GEMINI_WATERFALL_ORDER: readonly string[] = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

/** 환경 변수 미설정 시 첫 호출 모델. `GEMINI_ANALYSIS_MODEL` / `GEMINI_COMPARE_MODEL`로 덮어쓸 수 있음. */
export const DEFAULT_GEMINI_PRIMARY_MODEL = 'gemini-2.5-flash-lite';

/**
 * `/api/analyze`, `/api/quiz` 등 `GEMINI_MODEL`로 쓰는 기본 모델.
 */
export const ANALYSIS_GEMINI_MODEL = modelFromEnv(
  'GEMINI_ANALYSIS_MODEL',
  DEFAULT_GEMINI_PRIMARY_MODEL,
);

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

/**
 * `/api/compare` 전용 출력 상한. 두 제품·요약이 길어 잘리면 JSON이 깨질 수 있어 기본 3072.
 * `GEMINI_COMPARE_MAX_OUTPUT_TOKENS`로 조정 가능.
 */
export const COMPARE_MAX_OUTPUT_TOKENS = parsePositiveIntEnv('GEMINI_COMPARE_MAX_OUTPUT_TOKENS', 3072);

/**
 * `/api/compare` 전용 모델. 미설정 시 분석과 동일하게 `DEFAULT_GEMINI_PRIMARY_MODEL`.
 */
export const COMPARE_GEMINI_MODEL = (() => {
  const raw = process.env.GEMINI_COMPARE_MODEL;
  if (raw != null && String(raw).trim() !== '') {
    return normalizeGeminiModelId(String(raw).trim());
  }
  return normalizeGeminiModelId(DEFAULT_GEMINI_PRIMARY_MODEL);
})();
