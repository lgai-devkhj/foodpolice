/**
 * 모델 JSON을 「조건 ID」 단위로 점검해 다중 조건 계약을 코드에서도 한 번 더 거름니다.
 */

import { isCanonicalFoodCategory } from '@/lib/food-domain-config';

export type AnalysisConditionSeverity = 'error' | 'warn';

export type AnalysisConditionViolation = {
  id: string;
  detail: string;
  severity: AnalysisConditionSeverity;
};

function novaGroupNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function evaluateAnalysisGeminiConditions(rec: Record<string, unknown>): AnalysisConditionViolation[] {
  const out: AnalysisConditionViolation[] = [];

  const ng = novaGroupNum(rec.novaGroup);
  if (rec.novaGroup != null && (ng == null || ng < 1 || ng > 4)) {
    out.push({
      id: 'COND_NOVA_GROUP_RANGE',
      severity: 'warn',
      detail: 'novaGroup은 1~4 정수가 되도록 모델이 채워야 해요.',
    });
  }

  const effectiveNova = ng ?? 4;
  if (effectiveNova === 4) {
    const sub = String(rec.novaSubgroup ?? '')
      .trim()
      .toUpperCase();
    if (!['4A', '4B', '4C'].includes(sub)) {
      out.push({
        id: 'COND_NOVA_SUBGROUP_WHEN_4',
        severity: 'warn',
        detail: 'novaGroup이 4일 때 novaSubgroup은 4A, 4B, 4C 중 하나여야 해요.',
      });
    }
  }

  const fc = rec.foodCategory != null ? String(rec.foodCategory).trim() : '';
  if (fc && !isCanonicalFoodCategory(fc)) {
    out.push({
      id: 'COND_FOOD_CATEGORY_ENUM',
      severity: 'warn',
      detail: `foodCategory는 허용 목록 중 하나여야 해요. 받은 값: ${fc.slice(0, 40)}`,
    });
  }

  if (Array.isArray(rec.concernIngredients) && rec.concernIngredients.length > 3) {
    out.push({
      id: 'COND_CONCERN_INGREDIENTS_MAX',
      severity: 'warn',
      detail: 'concernIngredients는 최대 3개까지예요.',
    });
  }

  const brief = rec.briefDescription != null ? String(rec.briefDescription).trim() : '';
  if (brief.length > 52) {
    out.push({
      id: 'COND_BRIEF_LENGTH',
      severity: 'warn',
      detail: `briefDescription은 짧게(약 45자 권장). 현재 길이 ${brief.length}자.`,
    });
  }

  return out;
}
