import {
  GEMINI_FALLBACK_FLASH_MODEL,
  normalizeGeminiModelId,
} from '@/lib/gemini-models';
import { logGeminiHttpError } from '@/lib/log-gemini-upstream';

/** 2.5 폴백은 thinkingConfig를 지원하지 않거나 거부할 수 있어 제거한다. */
function cloneRequestBodyWithoutThinkingConfig(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const o = body as Record<string, unknown>;
  const gc = o.generationConfig;
  if (!gc || typeof gc !== 'object') return body;
  const ggc = gc as Record<string, unknown>;
  if (!('thinkingConfig' in ggc)) return body;
  const { thinkingConfig: _removed, ...restGen } = ggc;
  return { ...o, generationConfig: restGen };
}

function geminiGenerateUrl(modelId: string, apiKey: string): string {
  const m = normalizeGeminiModelId(modelId);
  return `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/** 첫 모델 실패 시 Flash로 재시도할지 (클라이언트에 그대로 넘길 불필요한 오류는 제외) */
export function shouldRetryGeminiWithFlashFallback(httpStatus: number, bodyText: string): boolean {
  if (httpStatus === 503 || httpStatus === 429) return true;
  if (httpStatus === 404) {
    const t = (bodyText || '').toLowerCase();
    return (
      t.includes('not found') ||
      t.includes('not supported') ||
      t.includes('does not exist') ||
      t.includes('was not found')
    );
  }
  if (httpStatus === 500 || httpStatus === 502) {
    const t = (bodyText || '').toLowerCase();
    return (
      t.includes('unavailable') ||
      t.includes('overloaded') ||
      t.includes('high demand') ||
      t.includes('resource_exhausted') ||
      t.includes('try again') ||
      t.includes('deadline') ||
      t.includes('internal')
    );
  }
  return false;
}

export type GeminiFetchWithFallbackResult = {
  ok: boolean;
  status: number;
  text: string;
  usedModel: string;
};

/**
 * 동일 요청 본문으로 primary 모델 호출 → 실패 시 gemini-2.5-flash 한 번 더.
 * primary와 fallback이 같으면 재시도하지 않음.
 */
export async function fetchGeminiGenerateContentWithFlashFallback(
  primaryModel: string,
  apiKey: string,
  requestBody: unknown,
  logContext: string,
): Promise<GeminiFetchWithFallbackResult> {
  const primary = normalizeGeminiModelId(primaryModel);
  const fallback = normalizeGeminiModelId(GEMINI_FALLBACK_FLASH_MODEL);
  const bodyStr = JSON.stringify(requestBody);

  const url1 = geminiGenerateUrl(primary, apiKey);
  let res = await fetch(url1, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  });
  let text = await res.text();

  if (res.ok) {
    return { ok: true, status: res.status, text, usedModel: primary };
  }

  logGeminiHttpError(logContext, res.status, text);

  if (primary === fallback || !shouldRetryGeminiWithFlashFallback(res.status, text)) {
    return { ok: false, status: res.status, text, usedModel: primary };
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(`[${logContext}] HTTP ${res.status} → 재시도 ${fallback}`);
  }

  const url2 = geminiGenerateUrl(fallback, apiKey);
  const retryBody = JSON.stringify(cloneRequestBodyWithoutThinkingConfig(requestBody));
  res = await fetch(url2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: retryBody,
  });
  text = await res.text();
  if (!res.ok) {
    logGeminiHttpError(`${logContext} (fallback ${fallback})`, res.status, text);
  }
  return {
    ok: res.ok,
    status: res.status,
    text,
    usedModel: res.ok ? fallback : primary,
  };
}
