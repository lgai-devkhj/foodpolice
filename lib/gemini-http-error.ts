export function formatGeminiHttpError(status: number, bodyText: string): string {
  const trimmed = (bodyText || '').trim();
  if (!trimmed) {
    if (status === 404) {
      return '현재 설정한 AI 모델을 이 서버에서 찾지 못했어요. 모델 이름 또는 API 리전을 확인해요.';
    }
    if (status === 429) {
      return (
        '잠시 요청이 많아 막혔을 수 있어요. 키가 잘못됐다기보다는 사용 한도나 속도 제한인 경우가 많아요. ' +
        '배포한 사이트에 등록한 AI 키를 바꿨다면 다시 배포했는지 확인해요. ' +
        '같은 구글 계정 프로젝트면 키를 새로 만들어도 한도는 같을 수 있고, 하루 한도가 남아도 짧은 시간에 너무 많이 보내면 잠시 막힐 수 있어요. 잠시 뒤 다시 시도해요.'
      );
    }
    return status === 503
      ? '요청이 많아 잠시 후 다시 시도해요.'
      : 'AI 서버와 통신에 실패했어요. 잠시 뒤 다시 시도해요.';
  }

  try {
    const j = JSON.parse(trimmed) as {
      error?: { message?: string; status?: string; code?: number };
    };
    const raw = j?.error?.message;
    if (typeof raw !== 'string' || !raw.trim()) {
      return 'AI 서버와 통신에 실패했어요. 잠시 뒤 다시 시도해요.';
    }
    const msg = raw;
    if (/models\/[^\s]+.*(not found|is not supported|does not exist|was not found)/i.test(msg)) {
      return '설정한 AI 모델 이름을 쓸 수 없어요. 서버 설정(모델 이름)을 확인해요.';
    }
    if (/API key|API_KEY_INVALID|PERMISSION_DENIED|invalid.*api key/i.test(msg) || status === 403) {
      return 'AI 키(서버에 등록한 비밀번호)를 확인해요.';
    }
    if (/quota|Quota exceeded|RESOURCE_EXHAUSTED|rate limit/i.test(msg) || status === 429) {
      return (
        '요청 한도나 속도 제한에 걸렸을 수 있어요. 배포한 사이트에 등록한 AI 키와 다시 배포 여부를 확인해요. ' +
        '같은 구글 프로젝트면 키를 바꿔도 한도는 같을 수 있고, 하루 한도가 남아도 짧은 시간에 연속으로 보내면 잠시 막힐 수 있어요. 잠시 뒤 다시 시도해요.'
      );
    }
    if (/too large|payload|request size|exceeds|bytes/i.test(msg)) {
      return '요청이 너무 커서 처리하지 못했어요. 더 작은 사진으로 시도해요.';
    }
  } catch {
  }
  if (status === 404) {
    return '현재 설정한 AI 모델을 이 서버에서 찾지 못했어요. 모델 이름 또는 API 리전을 확인해요.';
  }
  return 'AI 서버와 통신에 실패했어요. 잠시 뒤 다시 시도해요.';
}

export function quizApiErrorFromGeminiUpstream(status: number, bodyText: string): {
  httpStatus: number;
  message: string;
  errorCode: string;
} {
  const t = (bodyText || '').trim();
  const lower = t.toLowerCase();
  if (
    status === 429 &&
    (lower.includes('spending cap') ||
      lower.includes('monthly spending cap') ||
      lower.includes('exceeded its monthly'))
  ) {
    return {
      httpStatus: 503,
      message:
        'Google AI 월 사용 한도에 도달했어요. AI Studio(https://ai.studio/spend)에서 한도를 늘리거나 다음 달까지 기다려요. 다른 모델로 바꿔도 같은 계정 한도는 같아요.',
      errorCode: 'GEMINI_SPEND_CAP',
    };
  }
  if (status === 429) {
    return {
      httpStatus: 503,
      message: formatGeminiHttpError(status, bodyText),
      errorCode: 'GEMINI_QUOTA',
    };
  }
  if (status === 503 || status === 502) {
    return {
      httpStatus: 503,
      message: formatGeminiHttpError(status, bodyText),
      errorCode: 'GEMINI_UNAVAILABLE',
    };
  }
  return {
    httpStatus: 502,
    message: '문제를 만들지 못했어요. 잠시 뒤 다시 시도해요.',
    errorCode: 'QUIZ_GENERATION_FAILED',
  };
}

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
