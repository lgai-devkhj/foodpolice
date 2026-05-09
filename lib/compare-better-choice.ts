import type { AnalysisResult } from '@/lib/store';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Gemini가 camelCase 외 키로 줄 때를 흡수해요. */
export function extractCompareBetterChoiceRaw(parsed: Record<string, unknown>): unknown {
  const directKeys = [
    'betterChoice',
    'better_choice',
    'BetterChoice',
    'verdict',
    'winner',
    'choice',
  ];
  for (const k of directKeys) {
    const v = parsed[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  const nestedKeys = ['comparison', 'compare', 'result', 'data', 'output'];
  for (const nk of nestedKeys) {
    const inner = parsed[nk];
    if (isRecord(inner)) {
      const v = extractCompareBetterChoiceRaw(inner);
      if (v != null && String(v).trim() !== '') return v;
    }
  }
  return undefined;
}

export function normalizeBetterChoice(v: unknown): 'A' | 'B' | 'similar' {
  if (v == null) return 'similar';
  let s0 = String(v).trim();
  if (!s0) return 'similar';

  s0 = s0.replace(/^["']|["']$/g, '').trim();
  const s = s0.toUpperCase().replace(/\s+/g, '');

  if (s === 'A' || s === 'B') return s;
  if (s === 'SIMILAR' || s === 'TIE' || s === '동일' || s === '같음') return 'similar';

  if (/제품\s*A|PRODUCT\s*A|^A$/i.test(s0)) return 'A';
  if (/제품\s*B|PRODUCT\s*B|^B$/i.test(s0)) return 'B';

  const first = s0.charAt(0).toUpperCase();
  if (first === 'A' || first === 'B') {
    const rest = s0.slice(1).replace(/[^가-힣a-z0-9]/gi, '');
    if (rest.length === 0 || /^[가-힣]*$/.test(rest)) return first as 'A' | 'B';
  }

  return 'similar';
}

/**
 * 모델이 similar/누락을 줬을 때, 당류 수치가 뚜렷하게 다르면 더 낮은 쪽을 골라요.
 * (일반 탄산음료 vs 제로 등)
 */
export function inferBetterChoiceWhenSugarClearlyDiffers(
  a: AnalysisResult,
  b: AnalysisResult,
  minDiffG = 1.5,
): 'A' | 'B' | null {
  const sa = a.nutrition?.sugarG;
  const sb = b.nutrition?.sugarG;
  if (sa == null || sb == null) return null;
  const na = Number(sa);
  const nb = Number(sb);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return null;
  if (Math.abs(na - nb) < minDiffG) return null;
  return na < nb ? 'A' : 'B';
}
