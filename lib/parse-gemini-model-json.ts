import { normalizeGeminiJson } from '@/lib/gemini-prompts';

/** JSON 배열·객체 끝의 불필요한 후행 쉼표 제거 (LLM 출력 흔한 오류) */
function stripTrailingCommas(s: string): string {
  let prev: string;
  let cur = s;
  do {
    prev = cur;
    cur = cur.replace(/,(\s*[}\]])/g, '$1');
  } while (cur !== prev);
  return cur;
}

/**
 * MAX_TOKENS 등으로 잘린 JSON — 열린 문자열·괄호를 보수적으로 닫는다.
 */
function appendMissingJsonClosers(s: string): string {
  const stack: ('{' | '[')[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') stack.push('{');
    else if (c === '[') stack.push('[');
    else if (c === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
    } else if (c === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
    }
  }
  let out = s;
  if (inStr) out += '"';
  const tail: string[] = [];
  while (stack.length > 0) {
    const x = stack.pop()!;
    tail.push(x === '{' ? '}' : ']');
  }
  return out + tail.join('');
}

function tryParseObject(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s) as unknown;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    if (Array.isArray(v) && v.length >= 1) {
      const first = v[0];
      if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
        return first as Record<string, unknown>;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Gemini가 돌려준 텍스트(또는 JSON MIME 모드 한 줄)를 객체로 파싱한다.
 * 마크다운·후행 쉼표·잘린 괄호 등을 순서대로 보정해 본다.
 */
export function parseGeminiModelObject(raw: string, depth = 0): Record<string, unknown> | null {
  let s = (raw || '').replace(/^\uFEFF/, '').trim();
  if (!s) return null;

  // 모델이 JSON 전체를 한 번 더 문자열로 감싼 경우: "{\"productName\":...}"
  if (depth < 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const inner = JSON.parse(s);
      if (typeof inner === 'string' && inner.trim()) {
        const nested = parseGeminiModelObject(inner, depth + 1);
        if (nested) return nested;
      }
    } catch {
      /* 다음 단계로 */
    }
  }

  s = normalizeGeminiJson(s);

  const variants = [
    s,
    stripTrailingCommas(s),
    appendMissingJsonClosers(s),
    stripTrailingCommas(appendMissingJsonClosers(s)),
    appendMissingJsonClosers(stripTrailingCommas(s)),
  ];

  const seen = new Set<string>();
  for (const candidate of variants) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const obj = tryParseObject(candidate);
    if (obj) return obj;
  }

  return null;
}
