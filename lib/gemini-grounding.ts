/**
 * Gemini REST: `tools: [{ google_search: {} }]` 그라운딩 공통 호출.
 */

const DEFAULT_TIMEOUT_MS = 24_000;

function extractTextFromCandidates(data: unknown): string {
  const candidates = (data as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates)) return '';
  const chunks: string[] = [];
  for (const c of candidates) {
    const parts = (c as { content?: { parts?: Array<{ text?: string }> } })?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      if (typeof p?.text === 'string' && p.text.length > 0) chunks.push(p.text);
    }
  }
  return chunks.join('\n').trim();
}

export interface GoogleSearchGroundingResult {
  text: string;
  raw: unknown;
  ok: boolean;
  status: number;
}

/**
 * @param modelId REST용 모델 ID (예: gemini-2.5-flash)
 */
export async function generateContentWithGoogleSearch(
  apiKey: string,
  modelId: string,
  userPrompt: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<GoogleSearchGroundingResult> {
  const model = encodeURIComponent(modelId);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.35,
          topP: 0.95,
          topK: 40,
        },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[gemini-grounding] fetch failed model=${modelId}:`, msg);
    return { text: '', raw: null, ok: false, status: 0 };
  }
  clearTimeout(timer);

  const rawBody = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error(`[gemini-grounding] JSON parse error model=${modelId} status=${res.status}`);
    return { text: '', raw: null, ok: res.ok, status: res.status };
  }

  if (!res.ok) {
    console.error(
      `[gemini-grounding] HTTP ${res.status} model=${modelId}:`,
      rawBody.slice(0, 500)
    );
    return { text: '', raw: data, ok: false, status: res.status };
  }

  const text = extractTextFromCandidates(data);
  return { text, raw: data, ok: true, status: res.status };
}
