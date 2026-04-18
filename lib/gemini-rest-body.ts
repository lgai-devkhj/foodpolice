/**
 * Google Generative Language REST API(JSON)는 protobuf JSON 관례상 **camelCase** 필드명을 사용한다.
 * snake_case(inline_data, response_mime_type 등)는 무시되어 이미지·JSON 모드가 동작하지 않을 수 있다.
 */

export function inlineDataPart(mimeType: string, base64Data: string): {
  inlineData: { mimeType: string; data: string };
} {
  return { inlineData: { mimeType, data: base64Data } };
}

export function textPart(text: string): { text: string } {
  return { text };
}

export function generationConfigJsonMode(opts: {
  maxOutputTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  /**
   * Gemini 3.x 전용. 기본 추론(보통 high)보다 응답이 빨라지는 경우가 많다.
   * `gemini-2.5-*` 등에는 넣지 말 것(400). 폴백 호출 시에는 클라이언트에서 제거한다.
   */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}): {
  responseMimeType: 'application/json';
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
  thinkingConfig?: { thinkingLevel: string };
} {
  const base = {
    responseMimeType: 'application/json' as const,
    temperature: opts.temperature ?? 0.2,
    topP: opts.topP ?? 0.95,
    topK: opts.topK ?? 40,
    maxOutputTokens: opts.maxOutputTokens,
  };
  if (opts.thinkingLevel != null) {
    return {
      ...base,
      thinkingConfig: { thinkingLevel: opts.thinkingLevel },
    };
  }
  return base;
}
