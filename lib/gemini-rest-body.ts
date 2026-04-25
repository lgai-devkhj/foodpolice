
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
