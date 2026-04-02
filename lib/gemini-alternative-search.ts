/**
 * 대체 식품 안내 — Perplexity 웹 검색 전용 (텍스트만, 이미지 없음).
 */

import { ALT_FOOD_OPTION_LINE_RE } from '@/lib/alternative-food-normalize';

export const PERPLEXITY_MODEL = 'sonar';

/** 한 번의 Perplexity 호출 최대 대기 */
const PER_ATTEMPT_TIMEOUT_MS = 18_000;

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
  '1. 조금 개선: {웹에서 확인된 실제 제품명}\n' +
  '- 이유: {공백 가능}\n' +
  '- 출처: {https://... 실제 상품 페이지/검색 결과 URL}\n\n' +
  '2. 더 나은 선택: {실제 제품명}\n' +
  '- 이유: {공백 가능}\n' +
  '- 출처: {https://... 실제 상품 페이지/검색 결과 URL}\n\n' +
  '3. 최적 선택: {실제 제품명}\n' +
  '- 이유: {공백 가능}\n' +
  '- 출처: {https://... 실제 구매 가능한 상품/스토어 페이지 URL}\n\n' +
  '금지: 확인되지 않은 제품명 추측, 브랜드/제품 임의 조합, 브랜드 없는 일반명, HTML, 여러 문단.\n';

export function buildAlternativeFoodWebSearchPrompt(ctx: AlternativeSearchContext): string {
  const raw = (ctx.rawMaterials || '').slice(0, 900);
  const sub = ctx.novaSubgroup ? ` · ${ctx.novaSubgroup}` : '';
  const stage = `Group ${ctx.novaGroup}${ctx.novaGroup === 4 ? sub : ''}`;
  const cat = ctx.foodCategory || '미분류';
  const desc = (ctx.briefDescription || '').slice(0, 300);
  const nut = ctx.nutritionHint ? `\n(1회 제공량·표 기준 추정) ${ctx.nutritionHint}\n` : '';

  return (
    '**필수:** 답하기 전에 **웹 검색을 실제로 수행**하고, 네이버 쇼핑·마트 채널 등에서 **품명이 스니펫에 보이는지** 확인하세요. 검색 없이 추측만 하지 마세요.\n\n' +
    '당신은 웹 검색 결과를 우선 참고해, 한국에서 살 수 있는 실제 유통 제품을 제안합니다.\n\n' +
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
    '1. 검색 스니펫/상품 목록에 보인 정확한 제품명만 적으세요. 존재를 확인 못한 제품은 절대 쓰지 마세요.\n' +
    '1-1. 제품명은 반드시 "브랜드 + 정식 상품명" 형태로 쓰세요.\n' +
    '1-2. 금지 예시: "플레인 구운 땅콩", "무염 땅콩", "볶은 땅콩".\n' +
    '1-3. 허용 예시: "브랜드명 + 제품에 인쇄된 공식 상품명" 형태.\n' +
    '2. 브랜드와 제품명을 임의로 합치지 마세요(예: 다른 브랜드명+다른 제품명 조합 금지).\n' +
    '3. 각 항목(1~3)마다 반드시 출처 URL을 함께 적으세요. URL 없는 항목은 무효입니다.\n' +
    '4. 출처 URL은 사용자가 눌러서 상품/스토어 페이지로 이동 가능한 링크여야 합니다.\n' +
    '5. 1~3 항목 모두 제품명과 출처 URL을 채우세요. 비워두지 마세요.\n' +
    '5. 같은 식품군(위 foodCategory)·비슷한 소비 상황을 유지하세요. 완전 다른 계열로 바꾸지 마세요.\n' +
    (ctx.novaGroup === 3
      ? '7. 현재 Group III(가공 식품)이면 덜 가공된 방향으로: 같은 식품군·용도 안에서 원재료가 더 분명하고 첨가가 더 적은 제품을 우선 제안하세요.\n'
      : ctx.novaGroup <= 2
        ? '7. 현재 Group I~II라도 사용자가 대안을 요청했으므로, 같은 식품군·비슷한 용도의 실제 유통 품명 위주로 제안하세요.\n'
        : '7. Group IV면 4C→4B, 4B→4A, 4A→III 방향을 우선하되, 확인된 제품만 제시하세요.\n') +
    '8. 한국어 검색 기반으로 한국 내 유통·수입 제품을 우선하세요.\n\n' +
    '[말투 규칙 — 토스 스타일]\n' +
    '- 짧고 분명하게 쓴다. 군더더기 설명은 줄인다.\n' +
    '- 이유 문장은 쉬운 생활어로 1문장만 쓴다.\n' +
    '- 과장·단정·공포 표현 없이 차분하고 친절하게 쓴다.\n\n' +
    OUTPUT_FORMAT
  );
}

function acceptAlternativeModelText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/더\s*건강한\s*식품은\s*찾지\s*못했어요/.test(t)) return false;

  const lines = t.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const products = lines
    .map((line) => line.match(ALT_FOOD_OPTION_LINE_RE))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => (m[3] || '').trim())
    .filter((name) => /[가-힣A-Za-z0-9]/.test(name) && !/^[:：•·\-\–—,./\\|(){}\[\]]+$/.test(name));
  const urlCandidates = Array.from(new Set(t.match(/https?:\/\/[^\s)\]]+/gi) || []));
  const validUrls = urlCandidates.filter((raw) => {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      // 구매/스토어로 클릭 이동 가능한 페이지 성격(검색·몰·상품)
      return /(shopping|product|item|goods|mall|store|mart|market|coupang|ssg|emart|gmarket|11st|auction|kurly)/i.test(
        `${u.hostname}${u.pathname}`
      );
    } catch {
      return false;
    }
  });
  return products.length >= 3 && validUrls.length >= 3;
}

async function generateAlternativesOnce(
  perplexityApiKey: string,
  model: string,
  prompt: string
): Promise<{
  text: string | null;
  ok: boolean;
  status: number;
  bodySnippet: string;
  elapsedMs: number;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${perplexityApiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              '한국에서 실제로 구매 가능한 제품 3개를 반드시 제시하세요. 추측 금지, 임의 조합 금지, 빈칸 금지. 각 항목에 클릭 가능한 구매/스토어 URL을 포함하세요.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    const elapsedMs = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[alternatives] perplexity fetch failed:', msg);
    return { text: null, ok: false, status: 0, bodySnippet: '', elapsedMs };
  }
  clearTimeout(timer);

  const bodyText = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = null;
  }
  if (!res.ok) {
    return {
      text: null,
      ok: false,
      status: res.status,
      bodySnippet: bodyText.slice(0, 500),
      elapsedMs: Date.now() - started,
    };
  }
  const text =
    (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? '';
  const t = String(text).trim();
  if (!t) {
    console.warn('[alternatives] perplexity empty text');
    return { text: null, ok: true, status: res.status, bodySnippet: '', elapsedMs: Date.now() - started };
  }

  if (acceptAlternativeModelText(t)) {
    return {
      text: t,
      ok: true,
      status: res.status,
      bodySnippet: '',
      elapsedMs: Date.now() - started,
    };
  }

  console.warn(`[alternatives] rejected by validator perplexity len=${t.length}`);
  return { text: null, ok: true, status: res.status, bodySnippet: '', elapsedMs: Date.now() - started };
}

/**
 * Perplexity 검색 — `sonar` 단일 고정.
 * 빈 응답·검증 탈락 시 같은 프롬프트로 1회 재시도.
 * @returns 대체 식품 블록 텍스트, 실패 시 null
 */

export async function fetchAlternativesWithPerplexity(
  perplexityApiKey: string,
  prompt: string
): Promise<string | null> {
  const first = await generateAlternativesOnce(perplexityApiKey, PERPLEXITY_MODEL, prompt);
  if (first.text) return first.text;

  const relaxedPrompt =
    prompt +
    '\n\n[재시도 규칙]\n' +
    '- 1~3을 반드시 채워서 제시한다. 빈칸 금지.\n' +
    '- 한국에서 구매 가능한 실제 제품명만 쓴다.\n' +
    '- 각 항목에 클릭 가능한 구매/스토어 URL을 반드시 포함한다.\n' +
    '- 브랜드명+제품명 임의 조합을 절대 만들지 않는다.\n';
  const second = await generateAlternativesOnce(perplexityApiKey, PERPLEXITY_MODEL, relaxedPrompt);
  return second.text;
}
