export function hasGeminiCandidates(envelope: unknown): boolean {
  const c = (envelope as { candidates?: unknown })?.candidates;
  return Array.isArray(c) && c.length > 0;
}

export function getGeminiCandidateText(envelope: unknown): string | null {
  const c = (
    envelope as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
  )?.candidates?.[0];
  const parts = c?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const chunks: string[] = [];
  for (const p of parts) {
    if (p && typeof p.text === 'string' && p.text.length > 0) chunks.push(p.text);
  }
  return chunks.length > 0 ? chunks.join('\n') : null;
}

export function getGeminiPromptBlockReason(envelope: unknown): string | null {
  const br = (envelope as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason;
  return typeof br === 'string' && br.trim() ? br.trim() : null;
}
