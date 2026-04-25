import { normalizeGeminiJson } from '@/lib/gemini-prompts';

function stripTrailingCommas(s: string): string {
  let prev: string;
  let cur = s;
  do {
    prev = cur;
    cur = cur.replace(/,(\s*[}\]])/g, '$1');
  } while (cur !== prev);
  return cur;
}

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

export function parseGeminiModelObject(raw: string, depth = 0): Record<string, unknown> | null {
  let s = (raw || '').replace(/^\uFEFF/, '').trim();
  if (!s) return null;

  if (depth < 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const inner = JSON.parse(s);
      if (typeof inner === 'string' && inner.trim()) {
        const nested = parseGeminiModelObject(inner, depth + 1);
        if (nested) return nested;
      }
    } catch {
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
