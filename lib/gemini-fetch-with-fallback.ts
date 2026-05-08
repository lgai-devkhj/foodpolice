import { geminiGenerateContentUrl } from '@/lib/gemini-api';
import {
  GEMINI_WATERFALL_ORDER,
  isGemini3FamilyModelId,
  normalizeGeminiModelId,
} from '@/lib/gemini-models';
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
  return new Promise((r) => setTimeout(r, ms));
}

function shouldRetryRoundAfterOverload(last: GeminiFetchWithFallbackResult): boolean {
  if (last.ok) return false;
  return last.status === 503 || last.status === 429;
}

function buildOverloadModelChain(primaryModel: string): string[] {
  const primary = normalizeGeminiModelId(primaryModel);
  const seen = new Set<string>();
  const out: string[] = [];
  if (!seen.has(primary)) {
    seen.add(primary);
    out.push(primary);
  }
  for (const m of GEMINI_WATERFALL_ORDER) {
    const id = normalizeGeminiModelId(m);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

const MAX_OVERLOAD_ROUNDS = 3;

export async function fetchGeminiGenerateContentWithFlashFallback(
  primaryModel: string,
  apiKey: string,
  requestBody: unknown,
  logContext: string,
): Promise<GeminiFetchWithFallbackResult> {
  const chain = buildOverloadModelChain(primaryModel);

  const jsonBodyForModel = (modelId: string): string => {
    if (isGemini3FamilyModelId(modelId)) {
      return JSON.stringify(requestBody);
    }
    return JSON.stringify(cloneRequestBodyWithoutThinkingConfig(requestBody));
  };

  const tryChainOnce = async (): Promise<GeminiFetchWithFallbackResult> => {
    let last: GeminiFetchWithFallbackResult = {
      ok: false,
      status: 0,
      text: '',
      usedModel: chain[0] || '',
    };

    for (let i = 0; i < chain.length; i++) {
      const modelId = chain[i]!;
      const url = geminiGenerateUrl(modelId, apiKey);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBodyForModel(modelId),
      });
      const text = await res.text();

      if (res.ok) {
        return { ok: true, status: res.status, text, usedModel: modelId };
      }

      logGeminiHttpError(`${logContext} (${modelId})`, res.status, text);
      last = { ok: false, status: res.status, text, usedModel: modelId };

      if (!shouldRetryGeminiWithFlashFallback(res.status, text)) {
        return last;
      }
      if (i < chain.length - 1 && process.env.NODE_ENV === 'development') {
        console.warn(`[${logContext}] HTTP ${res.status} → 다음 모델 ${chain[i + 1]}`);
      }
    }

    return last;
  };

  let result = await tryChainOnce();
  if (result.ok) return result;

  for (let round = 1; round < MAX_OVERLOAD_ROUNDS && shouldRetryRoundAfterOverload(result); round++) {
    await sleepMs(200 + round * 280 + Math.floor(Math.random() * 250));
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[${logContext}] 과부하 지속 → 워터폴 ${round + 1}/${MAX_OVERLOAD_ROUNDS} 라운드`);
    }
    result = await tryChainOnce();
    if (result.ok) return result;
  }

  return result;
}
