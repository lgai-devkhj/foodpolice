import { geminiGenerateContentUrl } from '@/lib/gemini-api';
import { isGemini3FamilyModelId, normalizeGeminiModelId } from '@/lib/gemini-models';
import { logGeminiHttpError } from '@/lib/log-gemini-upstream';

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
  return geminiGenerateContentUrl(normalizeGeminiModelId(modelId), apiKey);
}

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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_SINGLE_MODEL_RETRIES = 1;

export async function fetchGeminiGenerateContentWithFlashFallback(
  primaryModel: string,
  apiKey: string,
  requestBody: unknown,
  logContext: string,
): Promise<GeminiFetchWithFallbackResult> {
  const modelId = normalizeGeminiModelId(primaryModel);

  const jsonBody = (() => {
    if (isGemini3FamilyModelId(modelId)) {
      return JSON.stringify(requestBody);
    }
    return JSON.stringify(cloneRequestBodyWithoutThinkingConfig(requestBody));
  })();

  const url = geminiGenerateUrl(modelId, apiKey);
  let lastStatus = 0;
  let lastText = '';

  for (let attempt = 0; attempt <= MAX_SINGLE_MODEL_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody,
    });
    const text = await res.text();
    lastStatus = res.status;
    lastText = text;

    if (res.ok) {
      return { ok: true, status: res.status, text, usedModel: modelId };
    }

    logGeminiHttpError(`${logContext} (${modelId})`, res.status, text);

    const shouldRetry = (res.status === 503 || res.status === 429) && attempt < MAX_SINGLE_MODEL_RETRIES;
    if (!shouldRetry) break;
    await sleepMs(220 + Math.floor(Math.random() * 180));
  }

  return { ok: false, status: lastStatus, text: lastText, usedModel: modelId };
}
