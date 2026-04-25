export const ALTERNATIVE_NOT_FOUND_MESSAGE = '조건에 맞는 실판매 대체 식품을 아직 찾지 못했어요.';

export const ALT_FOOD_OPTION_LINE_RE =
  /^(\d+)[.)]\s*\*{0,2}\s*(?:(조금\s*개선|더\s*나은\s*선택|최적\s*선택)\s*\*{0,2}\s*)?[:：\-–—]?\s*(.+)$/i;

export const ALT_FOOD_REASON_LINE_RE = /^[-–—•]\s*\*{0,2}\s*이유\s*\*{0,2}\s*[:：]\s*(.*)$/i;

export function normalizeAlternativeFoodOutput(raw: string): string {
  const t = raw.trim();
  if (!t) return raw;

  if (/마트에서\s*라벨을\s*비교해\s*보세요/.test(t)) {
    return ALTERNATIVE_NOT_FOUND_MESSAGE;
  }

  const withBreaks = t.replace(/<br\s*\/?>/gi, '\n');
  const lines = withBreaks
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let hasNamedProduct = false;
  for (const line of lines) {
    const m = line.match(ALT_FOOD_OPTION_LINE_RE);
    if (m) {
      const product = (m[3] || '').replace(/\*\*/g, '').trim();
      if (product.length >= 2) {
        hasNamedProduct = true;
        break;
      }
    }
  }

  if (!hasNamedProduct) {
    if (
      t.includes('더 건강한 식품은 찾지 못했어요') ||
      t.includes('적당한 대체 식품을 찾지 못했어요')
    ) {
      return ALTERNATIVE_NOT_FOUND_MESSAGE;
    }
    if (/찾기\s*어려웠|대안을\s*찾기\s*어려|적합한\s*대안/.test(t)) {
      return ALTERNATIVE_NOT_FOUND_MESSAGE;
    }
    if (t.length > 180 && !/\d+\s*[.)]\s*[^\n]+/.test(t)) {
      return ALTERNATIVE_NOT_FOUND_MESSAGE;
    }
  }

  return raw;
}
