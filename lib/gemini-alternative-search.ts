/**
 * 대체 식품 안내 — Gemini **Google Search 그라운딩** 전용 (텍스트만, 이미지 없음).
 * 모델 ID는 `lib/gemini-models.ts`의 SEARCH_MODEL 과 동일.
 * @see https://ai.google.dev/gemini-api/docs/google-search
 */

import { SEARCH_MODEL } from '@/lib/gemini-models';
import { generateContentWithGoogleSearch } from '@/lib/gemini-grounding';

export const ALTERNATIVES_GROUNDING_MODEL = SEARCH_MODEL;

/** 한 번의 generateContent(검색 그라운딩 포함) 최대 대기 */
const PER_ATTEMPT_TIMEOUT_MS = 24_000;

export interface AlternativeSearchContext {
  productName: string;
  companyName: string;
  foodCategory: string | null;
  novaGroup: number;
  novaSubgroup: string | null;
  briefDescription: string | null;
  rawMaterials: string;
}

const OUTPUT_FORMAT =
  '[출력 형식 — 아래 텍스트만 출력, 다른 말 없이]\n' +
  '현재 식품: (위 제품명과 동일하게)\n' +
  '가공 단계: (novaGroup/novaSubgroup 반영, 예: Group IV · 4B)\n\n' +
  '👉 더 나은 선택:\n\n' +
  '1. 조금 개선: {웹에서 확인된 실제 제품명 또는 공백}\n' +
  '- 이유: {공백 가능}\n\n' +
  '2. 더 나은 선택: {실제 제품명 또는 공백}\n' +
  '- 이유: {공백 가능}\n\n' +
  '3. 최적 선택: {실제 제품명 또는 공백}\n' +
  '- 이유: {공백 가능}\n\n' +
  '검색으로도 구체 품명을 확인할 수 없으면 1~3번 제품명은 모두 비우고, "👉 더 나은 선택:" 바로 아래에 한 줄로만:\n' +
  '(마트에서 라벨을 비교해 보세요.)\n';

export function buildAlternativeFoodWebSearchPrompt(ctx: AlternativeSearchContext): string {
  const raw = (ctx.rawMaterials || '').slice(0, 900);
  const sub = ctx.novaSubgroup ? ` · ${ctx.novaSubgroup}` : '';
  const stage = `Group ${ctx.novaGroup}${ctx.novaGroup === 4 ? sub : ''}`;
  const cat = ctx.foodCategory || '미분류';
  const desc = (ctx.briefDescription || '').slice(0, 300);


  return (
    '**필수:** 답하기 전에 **Google Search 도구로 실제 웹 검색을 반드시 실행**하고, 네이버 쇼핑·마트 채널 등에서 **품명이 스니펫에 보이는지** 확인하세요. 검색 없이 추측만 하지 마세요.\n\n' +
    '당신은 **Google Search(웹 검색) 도구**로 얻은 정보**만** 근거로, 한국에서 살 수 있는 **실제 유통 제품**을 제안합니다.\n\n' +
    '[현재 식품 — 이미지 분석 결과]\n' +
    `제품명: ${ctx.productName || '(라벨에서 읽지 못함)'}\n` +
    `제조사: ${ctx.companyName || '(없음)'}\n` +
    `foodCategory: ${cat}\n` +
    `NOVA(한국형): ${stage}\n` +
    (desc ? `한 줄 설명: ${desc}\n` : '') +
    (raw ? `원재료 일부: ${raw}\n` : '') +
    '\n[한국 온라인 마트 — 검색 시 우선 활용]\n' +
    '웹 검색 쿼리를 잡을 때 **국내 실판매 페이지가 나오도록** 하세요.\n' +
    '- **네이버 쇼핑**(shopping.naver.com, search.shopping.naver.com)에 올라온 상품명·브랜드가 검색 스니펫에 보일 때까지 검색을 조정해도 됩니다.\n' +
    '- 대형마트 채널 예: 네이버 쇼핑 내 **이마트** 마켓 홈 `https://shopping.naver.com/market/emart/home` — 식료품 유통 맥락의 기준으로 삼으세요. 실제 후보 품목은 **검색으로** `네이버쇼핑 이마트`, `site:shopping.naver.com`, 제품명+브랜드+`구매` 등 한국어 조합을 활용해 확인하세요.\n' +
    '- 홈플러스·롯데마트·GS더프레시 등 **다른** 네이버 쇼핑 마켓/슈퍼 채널 결과가 나와도 무방합니다. **검색 결과에 품명이 명시된 경우에만** 추천 칸에 적으세요.\n\n' +
    '[규칙 — 반드시 준수]\n' +
    '1. **웹 검색으로 확인된** 브랜드+공식 판매명만 1~3번에 적습니다. 검색 결과에 없는 조합·플레버는 **지어내지 마세요**.\n' +
    '2. 같은 식품군(위 foodCategory)·비슷한 소비 상황을 유지하세요. 탄산 제로 콜라류면 다른 브랜드 **동종 제로 콜라** 등, 완전 다른 계열(생수·무가당 차만)로 바꾸지 마세요.\n' +
    '3. 가공 단계는 **한 단계만** 낮추는 방향(4C→4B, 4B→4A, 4A→III 등). 검색으로 그런 대안이 없으면 칸을 비우세요.\n' +
    '4. 한국어로 검색해 한국 내 유통·수입 제품을 우선하세요.\n' +
    '5. 확실하지 않으면 **차라리 비우기**. 범주명만 쓰기 금지.\n\n' +
    '[말투 규칙 — 토스 스타일]\n' +
    '- 짧고 분명하게 쓴다. 군더더기 설명은 줄인다.\n' +
    '- 이유 문장은 쉬운 생활어로 1문장만 쓴다.\n' +
    '- 과장·단정·공포 표현 없이 차분하고 친절하게 쓴다.\n\n' +
    OUTPUT_FORMAT
  );
}

function responseHasGroundingMetadata(data: unknown): boolean {
  const candidates = (data as { candidates?: Array<{ groundingMetadata?: unknown }> })?.candidates;
  if (!Array.isArray(candidates)) return false;
  return candidates.some(
    (c) => c?.groundingMetadata != null && typeof c.groundingMetadata === 'object'
  );
}

function acceptAlternativeModelText(text: string, grounded: boolean): boolean {
  const t = text.trim();
  if (!t) return false;

  if (/현재 식품\s*:/i.test(t) && /(👉\s*)?더\s*나은\s*선택/i.test(t)) return true;
  if (
    t.length >= 35 &&
    /(조금\s*개선|더\s*나은\s*선택|최적\s*선택|대체|유통|마트|쇼핑|라벨|네이버|쇼핑)/.test(t)
  ) {
    return true;
  }
  if (grounded && t.length >= 28) return true;
  if (t.length >= 120) return true;
  return false;
}

async function generateAlternativesOnce(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ text: string | null; ok: boolean; status: number; bodySnippet: string }> {
  const { text, ok, status, raw } = await generateContentWithGoogleSearch(
    apiKey,
    model,
    prompt,
    PER_ATTEMPT_TIMEOUT_MS
  );

  if (!ok && status === 0) {
    return { text: null, ok: false, status: 0, bodySnippet: '' };
  }
  if (!ok) {
    const snippet =
      raw != null && typeof raw === 'object'
        ? JSON.stringify(raw).slice(0, 500)
        : String(raw).slice(0, 500);
    return { text: null, ok: false, status, bodySnippet: snippet };
  }

  const grounded = responseHasGroundingMetadata(raw);
  const t = text.trim();
  if (!t) {
    console.warn(`[alternatives] empty text model=${model} grounded=${grounded}`);
    return { text: null, ok: true, status, bodySnippet: '' };
  }

  if (acceptAlternativeModelText(t, grounded)) {
    return { text: t, ok: true, status, bodySnippet: '' };
  }

  console.warn(`[alternatives] rejected by validator model=${model} len=${t.length} grounded=${grounded}`);
  return { text: null, ok: true, status, bodySnippet: '' };
}

/**
 * Google Search 그라운딩 — 항상 `gemini-2.5-flash`.
 * @returns 대체 식품 블록 텍스트, 실패 시 null
 */
export async function fetchAlternativesWithGoogleSearch(
  apiKey: string,
  prompt: string
): Promise<string | null> {
  const { text } = await generateAlternativesOnce(apiKey, SEARCH_MODEL, prompt);
  return text;
}
