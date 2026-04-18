/**
 * `fetch` 응답이 JSON이 아닌 경우(HTML 오류 페이지, 프록시 메시지 등) `res.json()` 대신 사용.
 */
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

/** JSON이 아니면 null (대체 식품 등 비필수 응답용) */
export function tryParseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
