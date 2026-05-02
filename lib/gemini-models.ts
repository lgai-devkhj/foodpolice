const GEMINI_MODEL_ID_ALIASES: Record<string, string> = {};

export function normalizeGeminiModelId(id: string): string {
  const base = id.replace(/^models\//, '').trim();
  return GEMINI_MODEL_ID_ALIASES[base] ?? base;
}

export function isGemini3FamilyModelId(id: string): boolean {
  return normalizeGeminiModelId(id).startsWith('gemini-3');
}

function modelFromEnv(envName: string, fallback: string): string {
  const raw = process.env[envName];
  if (raw == null || String(raw).trim() === '') return fallback;
  return normalizeGeminiModelId(String(raw));
}

export const GEMINI_WATERFALL_ORDER: readonly string[] = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

export const DEFAULT_GEMINI_PRIMARY_MODEL = 'gemini-2.5-flash-lite';

export const ANALYSIS_GEMINI_MODEL = modelFromEnv(
  'GEMINI_ANALYSIS_MODEL',
  DEFAULT_GEMINI_PRIMARY_MODEL,
);

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32768) : fallback;
}

export const ANALYSIS_MAX_OUTPUT_TOKENS = parsePositiveIntEnv('GEMINI_ANALYSIS_MAX_OUTPUT_TOKENS', 4096);

export const COMPARE_MAX_OUTPUT_TOKENS = parsePositiveIntEnv('GEMINI_COMPARE_MAX_OUTPUT_TOKENS', 3072);

export const COMPARE_GEMINI_MODEL = (() => {
  const raw = process.env.GEMINI_COMPARE_MODEL;
  if (raw != null && String(raw).trim() !== '') {
    return normalizeGeminiModelId(String(raw).trim());
  }
  return normalizeGeminiModelId(DEFAULT_GEMINI_PRIMARY_MODEL);
})();

function parsePositiveMsEnv(name: string, fallback: number, maxMs: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, maxMs) : fallback;
}

function parseFiniteFloatEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseFloat(String(raw).trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** OX 퀴즈 생성용 */
export const GEMINI_QUIZ_MAX_OUTPUT_TOKENS = parsePositiveIntEnv('GEMINI_QUIZ_MAX_OUTPUT_TOKENS', 1024);

export const GEMINI_QUIZ_TEMPERATURE = parseFiniteFloatEnv('GEMINI_QUIZ_TEMPERATURE', 0.7, 0, 2);

/** 원재료 추정 등 보조 호출 타임아웃(ms) */
export const GEMINI_INGREDIENT_AI_TIMEOUT_MS = parsePositiveMsEnv('GEMINI_INGREDIENT_AI_TIMEOUT_MS', 1800, 120_000);

export const GEMINI_INGREDIENT_VALIDATE_TIMEOUT_MS = parsePositiveMsEnv(
  'GEMINI_INGREDIENT_VALIDATE_TIMEOUT_MS',
  1500,
  120_000,
);

export const GEMINI_INGREDIENT_VALIDATE_MAX_OUTPUT_TOKENS = parsePositiveIntEnv(
  'GEMINI_INGREDIENT_VALIDATE_MAX_OUTPUT_TOKENS',
  1024,
);

/** 프로파일·사전확률(priors) 등 원재료 보조 호출 공통 */
export const GEMINI_INGREDIENT_AUX_MAX_OUTPUT_TOKENS = parsePositiveIntEnv(
  'GEMINI_INGREDIENT_AUX_MAX_OUTPUT_TOKENS',
  2048,
);

export const GEMINI_STRUCTURED_THINKING_LEVEL = 'minimal' as const;

/** Gemini 3 계열에서만 구조화 JSON 호출에 thinking budget을 붙일 때 */
export function gemini3ThinkingLevelForStructured(modelId: string): typeof GEMINI_STRUCTURED_THINKING_LEVEL | undefined {
  return isGemini3FamilyModelId(modelId) ? GEMINI_STRUCTURED_THINKING_LEVEL : undefined;
}
