/**
 * Gemini REST API용 모델 ID (경로: v1beta/models/{id}:generateContent)
 * SDK 예시의 `models/gemini-2.5-flash` 형태도 허용 — 내부에서 접두어만 제거.
 */

/**
 * 예전 문서·환경 변수에만 있던 이름 → 현재 API(v1beta)에 노출된 ID.
 * `GEMINI_ANALYSIS_MODEL=gemini-3.1-flash-lite`처럼 `-preview` 없이 넣어도 동작하게 한다.
 */
const GEMINI_MODEL_ID_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
};

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
 * `/api/analyze`, `/api/quiz` 등 `GEMINI_MODEL`로 쓰는 기본 모델.
 * 지연을 줄이기 위해 기본값은 **gemini-2.5-flash**. 더 무거운 3.x 라이트를 쓰려면
 * `GEMINI_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview` 등으로 지정.
 */
export const ANALYSIS_GEMINI_MODEL = modelFromEnv(
  'GEMINI_ANALYSIS_MODEL',
  'gemini-2.5-flash',
);

/**
 * 기본 모델이 503·429 등으로 실패할 때 `generateContent` 재시도용 모델.
 * (환경 변수로 덮어쓰지 않음 — 안정성 우선 고정값)
 */
export const GEMINI_FALLBACK_FLASH_MODEL = 'gemini-2.5-flash';

/**
 * primary가 이미 `GEMINI_FALLBACK_FLASH_MODEL`과 같을 때(예: 기본 분석 모델이 2.5-flash) 재시도용 대안.
 */
export const GEMINI_ALTERNATE_FALLBACK_MODEL = 'gemini-3.1-flash-lite-preview';

/**
 * 503 연쇄 시 마지막으로 시도할 추가 모델(다른 큐·부하 분산).
 */
export const GEMINI_TERTIARY_FALLBACK_MODEL = 'gemini-2.0-flash';

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
 * `/api/compare` 전용 모델. 미설정 시 `gemini-2.5-flash`(멀티 이미지에서 대체로 빠른 응답).
 * 분석과 동일한 모델을 쓰려면 `GEMINI_COMPARE_MODEL=gemini-3.1-flash-lite-preview` 등으로 지정.
 */
export const COMPARE_GEMINI_MODEL = (() => {
  const raw = process.env.GEMINI_COMPARE_MODEL;
  if (raw != null && String(raw).trim() !== '') {
    return normalizeGeminiModelId(String(raw).trim());
  }
  return normalizeGeminiModelId(GEMINI_FALLBACK_FLASH_MODEL);
})();
