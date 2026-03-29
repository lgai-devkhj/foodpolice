/**
 * 대체 식품 안내 — Gemini **Google Search 그라운딩** 전용 (텍스트만, 이미지 없음).
 * 모델 ID는 `lib/gemini-models.ts`의 SEARCH_MODEL 과 동일.
 * @see https://ai.google.dev/gemini-api/docs/google-search
 */

import {
  normalizeAlternativeFoodOutput,
  ALT_FOOD_OPTION_LINE_RE,
} from '@/lib/alternative-food-normalize';
import { SEARCH_MODEL } from '@/lib/gemini-models';
import { generateContentWithGoogleSearch } from '@/lib/gemini-grounding';

export const ALTERNATIVES_GROUNDING_MODEL = SEARCH_MODEL;

/** 한 번의 generateContent(검색 그라운딩 포함) 최대 대기 */
const PER_ATTEMPT_TIMEOUT_MS = 28_000;

/** /api/alternatives 요청 본문에서 넘기는 축약 영양(표 숫자 필드) */
export type AlternativesNutritionPayload = {
  caloriesKcal?: number | null;
  sodiumMg?: number | null;
  sugarG?: number | null;
  saturatedFatG?: number | null;
  transFatG?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  carbsG?: number | null;
  dietaryFiberG?: number | null;
};

export function buildNutritionHintForAlternatives(
  n: AlternativesNutritionPayload | null | undefined
): string | null {
  if (!n || typeof n !== 'object') return null;
  const parts: string[] = [];
  const push = (label: string, v: unknown, unit: string) => {
    if (v == null || v === '') return;
    const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    if (!Number.isFinite(num)) return;
    parts.push(`${label} 약 ${num}${unit}`);
  };
  push('열량', n.caloriesKcal, 'kcal');
  push('나트륨', n.sodiumMg, 'mg');
  push('당류', n.sugarG, 'g');
  push('포화지방', n.saturatedFatG, 'g');
  push('트랜스지방', n.transFatG, 'g');
  push('지방', n.fatG, 'g');
  push('탄수화물', n.carbsG, 'g');
  push('단백질', n.proteinG, 'g');
  push('식이섬유', n.dietaryFiberG, 'g');
  return parts.length > 0 ? parts.join(', ') : null;
}

export interface AlternativeSearchContext {
  productName: string;
  companyName: string;
  foodCategory: string | null;
  novaGroup: number;
  novaSubgroup: string | null;
  briefDescription: string | null;
  rawMaterials: string;
  /** 분석 API가 채운 숫자 영양 — 대안 선정 시 나트륨·당 등 비교에 사용 */
  nutritionHint: string | null;
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
  '검색으로도 구체 품명을 확인할 수 없으면 1~3번 제품명은 모두 비우고, "👉 더 나은 선택:" 바로 아래에 **딱 한 줄만** 출력:\n' +
  '더 건강한 식품은 찾지 못했어요.\n' +
  '(금지: 현재 식품·NOVA·식품군 설명, **이유:**, HTML, 여러 문단. 위 한 문장만.)\n';

export function buildAlternativeFoodWebSearchPrompt(ctx: AlternativeSearchContext): string {
  const raw = (ctx.rawMaterials || '').slice(0, 900);
  const sub = ctx.novaSubgroup ? ` · ${ctx.novaSubgroup}` : '';
  const stage = `Group ${ctx.novaGroup}${ctx.novaGroup === 4 ? sub : ''}`;
  const cat = ctx.foodCategory || '미분류';
  const desc = (ctx.briefDescription || '').slice(0, 300);
  const nut = ctx.nutritionHint ? `\n(1회 제공량·표 기준 추정) ${ctx.nutritionHint}\n` : '';

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
    (nut ? `영양(숫자):${nut}` : '') +
    '\n[한국 온라인 마트 — 검색 시 우선 활용]\n' +
    '웹 검색 쿼리를 잡을 때 **국내 실판매 페이지가 나오도록** 하세요.\n' +
    '- **네이버 쇼핑**(shopping.naver.com, search.shopping.naver.com)에 올라온 상품명·브랜드가 검색 스니펫에 보일 때까지 검색을 조정해도 됩니다.\n' +
    '- 검색은 **여러 쿼리**로 시도: ① `foodCategory` + 품목 키워드 + `저당`·`저나트륨`·`무가당`·`플레인` 등 **해당 카테고리에 맞는 수식어** ② 현재 브랜드/제품명 + `대체` ③ 유사 제품군 + `추천` + `site:shopping.naver.com`.\n' +
    '- 대형마트 채널 예: 네이버 쇼핑 내 **이마트** 마켓 홈 `https://shopping.naver.com/market/emart/home` — 식료품 유통 맥락의 기준으로 삼으세요. 실제 후보 품목은 **검색으로** `네이버쇼핑 이마트`, `site:shopping.naver.com`, 제품명+브랜드+`구매` 등 한국어 조합을 활용해 확인하세요.\n' +
    '- 홈플러스·롯데마트·GS더프레시 등 **다른** 네이버 쇼핑 마켓/슈퍼 채널 결과가 나와도 무방합니다. **검색 결과에 품명이 명시된 경우에만** 추천 칸에 적으세요.\n' +
    (ctx.nutritionHint
      ? '- 위 **영양(숫자)**가 있으면: 나트륨·당류·포화지방이 높게 잡혀 있으면 **같은 식품군** 안에서 그 수치를 **상대적으로 낮추는** 실제 유통 품을 우선 검색해 보세요. 숫자가 없는 항목은 억지로 비교하지 않습니다.\n'
      : '') +
    '\n' +
    '[규칙 — 반드시 준수]\n' +
    '1. **웹 검색으로 확인된** 브랜드+공식 판매명만 1~3번에 적습니다. 검색 결과에 없는 조합·플레버는 **지어내지 마세요**.\n' +
    '2. 같은 식품군(위 foodCategory)·비슷한 소비 상황을 유지하세요. 탄산 제로 콜라류면 다른 브랜드 **동종 제로 콜라** 등, 완전 다른 계열(생수·무가당 차만)로 바꾸지 마세요.\n' +
    (ctx.novaGroup === 3
      ? '3. 현재 **Group III(가공 식품)**이면 **덜 가공된 방향**으로: 같은 식품군·용도 안에서 **원재료가 더 분명·첨가가 더 적은** 실제 유통 제품을 우선 제안하세요. III→II(조리용 단일 재료)는 검색으로 근거가 있고 소비 상황이 맞을 때만. 근거 없으면 칸을 비우세요.\n'
      : ctx.novaGroup <= 2
        ? '3. 현재 **Group I~II**이지만 사용자가 **대안 품목을 직접 요청**했습니다. 같은 식품군·비슷한 용도에서 **다른 브랜드·실제 유통 품명**을 웹 검색으로 확인된 것만 제안하세요. “가공 단계를 낮춰야 한다”는 식의 설명은 쓰지 마세요. 근거 없으면 칸을 비우세요.\n'
        : '3. 가공 단계는 **한 단계만** 낮추는 방향(4C→4B, 4B→4A, 4A→III 등). 검색으로 그런 대안이 없으면 칸을 비우세요.\n') +
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
  const lines = t.split(/\r?\n/).map((l) => l.trim());
  if (lines.some((line) => ALT_FOOD_OPTION_LINE_RE.test(line))) return true;
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
    return { text: normalizeAlternativeFoodOutput(t), ok: true, status, bodySnippet: '' };
  }

  console.warn(`[alternatives] rejected by validator model=${model} len=${t.length} grounded=${grounded}`);
  return { text: null, ok: true, status, bodySnippet: '' };
}

/**
 * Google Search 그라운딩 — 항상 `gemini-2.5-flash`.
 * 빈 응답·검증 탈락 시 같은 프롬프트로 1회 재시도.
 * @returns 대체 식품 블록 텍스트, 실패 시 null
 */
export async function fetchAlternativesWithGoogleSearch(
  apiKey: string,
  prompt: string
): Promise<string | null> {
  const first = await generateAlternativesOnce(apiKey, SEARCH_MODEL, prompt);
  if (first.text) return first.text;
  const second = await generateAlternativesOnce(apiKey, SEARCH_MODEL, prompt);
  return second.text;
}
