/**
 * generateContent가 실패할 때 본문이 `{ "error": { "message": "..." } }` 형태인 경우가 많음.
 * 사용자에게는 한국어로 요약해 돌려준다.
 */
export function formatGeminiHttpError(status: number, bodyText: string): string {
  const trimmed = (bodyText || '').trim();
  if (!trimmed) {
    if (status === 429) {
      return (
        '429는 키 오류가 아니라 요청 한도·속도 제한인 경우가 많아요. ' +
        'Vercel 등에 배포했다면 대시보드의 GEMINI_API_KEY를 새 키로 바꾼 뒤 재배포했는지 확인해 주세요(로컬 .env만 바꾸면 서버에는 반영되지 않아요). ' +
        '같은 Google 프로젝트에서 키만 새로 만들면 한도는 공유될 수 있고, 일일 한도가 남아도 분당(RPM) 제한에 걸릴 수 있어요. 잠시 뒤 다시 시도해 보세요.'
      );
    }
    return status === 503
      ? '요청이 많아 잠시 후 다시 시도해 주세요.'
      : 'AI 서버와 통신에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
  }

  try {
    const j = JSON.parse(trimmed) as {
      error?: { message?: string; status?: string; code?: number };
    };
    const raw = j?.error?.message;
    if (typeof raw !== 'string' || !raw.trim()) {
      return 'AI 서버와 통신에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
    }
    const msg = raw;
    if (/models\/[^\s]+.*(not found|is not supported|does not exist|was not found)/i.test(msg)) {
      return '설정된 AI 모델을 사용할 수 없어요. 환경 변수 GEMINI_ANALYSIS_MODEL(예: gemini-3.1-flash-lite-preview, gemini-3-flash-preview, gemini-2.5-flash-lite)을 확인해 주세요.';
    }
    if (/API key|API_KEY_INVALID|PERMISSION_DENIED|invalid.*api key/i.test(msg) || status === 403) {
      return 'Gemini API 키를 확인해 주세요. (환경 변수 GEMINI_API_KEY)';
    }
    if (/quota|Quota exceeded|RESOURCE_EXHAUSTED|rate limit/i.test(msg) || status === 429) {
      return (
        '요청 한도(쿼터) 또는 속도 제한이에요. 배포 서버의 GEMINI_API_KEY·재배포 여부를 확인하고, ' +
        '같은 프로젝트면 키를 바꿔도 한도가 공유될 수 있어요. 일일 한도가 남아도 분당 제한에 걸릴 수 있습니다. 잠시 뒤 다시 시도해 주세요.'
      );
    }
    if (/too large|payload|request size|exceeds|bytes/i.test(msg)) {
      return '요청이 너무 커서 처리하지 못했어요. 더 작은 사진으로 시도해 주세요.';
    }
  } catch {
    /* HTML·평문 오류 페이지 */
  }
  return 'AI 서버와 통신에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
}

/**
 * Google Generative Language API 오류 JSON의 `error.status` · `error.code` 를 표시용 한 줄로 합친다.
 */
export function geminiErrorCodeFromBody(bodyText: string): string | undefined {
  const trimmed = (bodyText || '').trim();
  if (!trimmed) return undefined;
  try {
    const j = JSON.parse(trimmed) as {
      error?: { status?: string; code?: number };
    };
    const e = j?.error;
    if (!e) return undefined;
    const parts: string[] = [];
    if (typeof e.status === 'string' && e.status.trim()) parts.push(e.status.trim());
    if (typeof e.code === 'number' && Number.isFinite(e.code)) parts.push(String(e.code));
    return parts.length > 0 ? parts.join(' · ') : undefined;
  } catch {
    return undefined;
  }
}
