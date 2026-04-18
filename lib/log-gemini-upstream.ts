/**
 * Vercel 프로덕션 로그에서도 Google generateContent 실패 원인을 볼 수 있게 함.
 * (한도 외: 모델 미지원 404, INVALID_ARGUMENT 400, 일시 과부하 503, 지역 제한 등)
 * 본문은 앞부분만 남기며, API 키는 요청 URL이 서버에만 있고 본문 JSON에 실리지 않는 전제.
 */
export function logGeminiHttpError(route: string, httpStatus: number, bodyText: string): void {
  const head = (bodyText || '').slice(0, 2000);
  console.error(`[${route}] Gemini upstream HTTP ${httpStatus}`, head);
}
