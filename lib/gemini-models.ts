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
