import {
  GEMINI_ALTERNATE_FALLBACK_MODEL,
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

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** primary·fallback 모두 과부하(503/429)로 실패한 뒤 한 번 더 돌릴지 */
function shouldRetryRoundAfterOverload(last: GeminiFetchWithFallbackResult): boolean {
  if (last.ok) return false;
  return last.status === 503 || last.status === 429;
}

/**
 * 동일 요청 본문으로 primary 호출 → 실패 시 보조 모델 한 번 더.
 * - primary가 3.x 등이면 보조는 보통 gemini-2.5-flash.
 * - primary가 이미 2.5-flash면 보조는 gemini-3.1-flash-lite-preview.
 * - 양쪽 모두 503/429면 짧게 대기 후 **같은 순서로 한 라운드 더** 시도(일시 스파이크 완화).
 */
export async function fetchGeminiGenerateContentWithFlashFallback(
  primaryModel: string,
  apiKey: string,
  requestBody: unknown,
  logContext: string,
): Promise<GeminiFetchWithFallbackResult> {
  const primary = normalizeGeminiModelId(primaryModel);
  const flashFallback = normalizeGeminiModelId(GEMINI_FALLBACK_FLASH_MODEL);
  const alternateFallback = normalizeGeminiModelId(GEMINI_ALTERNATE_FALLBACK_MODEL);
  const bodyStr = JSON.stringify(requestBody);

  const tryPrimaryThenFallback = async (): Promise<GeminiFetchWithFallbackResult> => {
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

    if (!shouldRetryGeminiWithFlashFallback(res.status, text)) {
      return { ok: false, status: res.status, text, usedModel: primary };
    }

    const retryModel = primary === flashFallback ? alternateFallback : flashFallback;
    if (retryModel === primary) {
      return { ok: false, status: res.status, text, usedModel: primary };
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn(`[${logContext}] HTTP ${res.status} → 재시도 ${retryModel}`);
    }

    const url2 = geminiGenerateUrl(retryModel, apiKey);
    const retryBody = JSON.stringify(cloneRequestBodyWithoutThinkingConfig(requestBody));
    res = await fetch(url2, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: retryBody,
    });
    text = await res.text();
    if (!res.ok) {
      logGeminiHttpError(`${logContext} (fallback ${retryModel})`, res.status, text);
    }
    return {
      ok: res.ok,
      status: res.status,
      text,
      usedModel: res.ok ? retryModel : primary,
    };
  };

  let result = await tryPrimaryThenFallback();
  if (result.ok) return result;

  if (shouldRetryRoundAfterOverload(result)) {
    await sleepMs(400 + Math.floor(Math.random() * 500));
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[${logContext}] HTTP ${result.status} 과부하 → primary→fallback 2차 라운드`);
    }
    result = await tryPrimaryThenFallback();
  }

  return result;
}
