export type ApiErrorBody = {
  error?: string;
  errorCode?: string;
};

export function apiErrorBody(message: string, errorCode?: string): ApiErrorBody {
  return errorCode ? { error: message, errorCode } : { error: message };
}

export function formatApiErrorForDisplay(res: Response, body: ApiErrorBody): string {
  const msg =
    typeof body.error === 'string' && body.error.trim() ? body.error.trim() : '요청에 실패했어요.';
  const http = `HTTP ${res.status}`;
  const code = typeof body.errorCode === 'string' && body.errorCode.trim() ? body.errorCode.trim() : '';
  if (code) return `${msg} (${http} · ${code})`;
  return `${msg} (${http})`;
}

export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return parseJsonResponseBody<T>(text, res.status);
}

function parseJsonResponseBody<T>(text: string, httpStatus: number): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`서버 응답이 비어 있어요. (HTTP ${httpStatus})`);
  }
  const first = trimmed[0];
  if (first !== '{' && first !== '[') {
    throw new Error(`잠깐 서버와 연결이 원활하지 않아요. (HTTP ${httpStatus})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`응답을 해석하지 못했어요. (HTTP ${httpStatus})`);
  }
}

export function tryParseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
