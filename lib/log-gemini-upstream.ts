export function logGeminiHttpError(route: string, httpStatus: number, bodyText: string): void {
  const head = (bodyText || '').slice(0, 2000);
  console.error(`[${route}] Gemini upstream HTTP ${httpStatus}`, head);
}
