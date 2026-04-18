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
}): {
  responseMimeType: 'application/json';
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
} {
  return {
    responseMimeType: 'application/json',
    temperature: opts.temperature ?? 0.2,
    topP: opts.topP ?? 0.95,
    topK: opts.topK ?? 40,
    maxOutputTokens: opts.maxOutputTokens,
  };
}
