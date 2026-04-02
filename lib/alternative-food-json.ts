/**
 * 대체 식품 Perplexity 응답 — JSON 스키마 공유(서버 검증 · 클라이언트 렌더).
 */

export type AlternativeFoodJsonTier = 'slight' | 'better' | 'best';

export type AlternativeFoodJsonItem = {
  tier: AlternativeFoodJsonTier;
  productName: string;
  reason: string;
  /** 클릭 시 상품/스토어로 이동 가능한 URL — UI에는 노출하지 않을 수 있음 */
  purchaseUrl: string;
};

export type AlternativeFoodJsonRoot = {
  currentFood: string;
  processingStage: string;
  alternatives: AlternativeFoodJsonItem[];
};

const SHOP_URL_HOST_PATH_RE =
  /(shopping|product|item|goods|mall|store|mart|market|coupang|ssg|emart|gmarket|11st|auction|kurly|naver\.com)/i;

export function isPurchaseableProductUrl(raw: string): boolean {
  const s = String(raw || '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return SHOP_URL_HOST_PATH_RE.test(`${u.hostname}${u.pathname}`);
  } catch {
    return false;
  }
}

/** 숫자·용량·개입 등을 제거한 식별용 코어(동일·중량만 다른 SKU 근사 비교) */
export function productIdentityCore(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+(\.\d+)?\s*(g|kg|mg|ml|m[lL]|l|㎖|리터|그램|gram)\b/gi, ' ')
    .replace(/\d+\s*개입/gi, ' ')
    .replace(/\d+\s*개/gi, ' ')
    .replace(/\d+(\.\d+)?/g, ' ')
    .replace(/[^a-z0-9가-힣]/gi, '')
    .trim();
}

export function isSameProductLineOrWeightOnlyVariant(
  alternativeName: string,
  scannedName: string
): boolean {
  const a = String(alternativeName || '').trim();
  const s = String(scannedName || '').trim();
  if (!a || !s) return false;
  const cA = productIdentityCore(a);
  const cS = productIdentityCore(s);
  if (cA && cA === cS) return true;
  const norm = (v: string) =>
    v
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9가-힣]/gi, '');
  const nA = norm(a);
  const nS = norm(s);
  if (nA === nS) return true;
  if (nA.length >= 6 && nS.length >= 6 && (nA.includes(nS) || nS.includes(nA))) {
    const ratio = Math.min(nA.length, nS.length) / Math.max(nA.length, nS.length);
    if (ratio >= 0.88) return true;
  }
  return false;
}

export function unwrapModelJsonBlock(content: string): string {
  let s = String(content || '').trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence) s = fence[1].trim();
  return s;
}
