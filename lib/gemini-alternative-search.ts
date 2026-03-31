/**
 * 대체 식품 안내 — Perplexity 웹 검색 전용 (텍스트만, 이미지 없음).
 */

export const PERPLEXITY_MODEL = 'sonar';

/** 한 번의 Perplexity 호출 최대 대기 */
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
  '1. 조금 개선: {웹에서 확인된 실제 제품명}\n' +
  '- 이유: {공백 가능}\n\n' +
  '2. 더 나은 선택: {실제 제품명}\n' +
  '- 이유: {공백 가능}\n\n' +
  '3. 최적 선택: {실제 제품명}\n' +
  '- 이유: {공백 가능}\n\n' +
  '금지: "더 건강한 식품은 찾지 못했어요." 같은 포기 문장, HTML, 여러 문단, 빈 제품명.\n';

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
    '1. 1~3번 제품명은 **빈칸 금지**입니다. 각 줄에 반드시 브랜드+제품명을 적으세요.\n' +
    '2. 검색에서 완전일치 품명이 약하면, 한국에서 널리 유통되는 같은 식품군의 대표 제품명으로 채우세요(가장 현실적인 후보 우선).\n' +
    '3. 검색 스니펫에 제품명이 보이면 그 이름을 우선 사용하고, 없으면 카테고리 대표 제품으로 보완하세요.\n' +
    '4. 지나치게 생소한 조합·가짜 플레이버는 피하고, 편의점/대형마트/네이버쇼핑에서 흔한 품목을 고르세요.\n' +
    '5. 제품명만 비워두는 출력은 금지합니다.\n' +
    '6. 같은 식품군(위 foodCategory)·비슷한 소비 상황을 유지하세요. 탄산 제로 콜라류면 다른 브랜드 동종 제로 콜라 등, 완전 다른 계열로 바꾸지 마세요.\n' +
    (ctx.novaGroup === 3
      ? '7. 현재 Group III(가공 식품)이면 덜 가공된 방향으로: 같은 식품군·용도 안에서 원재료가 더 분명하고 첨가가 더 적은 제품을 우선 제안하세요.\n'
      : ctx.novaGroup <= 2
        ? '7. 현재 Group I~II라도 사용자가 대안을 요청했으므로, 같은 식품군·비슷한 용도에서 다른 브랜드 실제 유통 품명 3개를 채워 제시하세요.\n'
        : '7. Group IV면 4C→4B, 4B→4A, 4A→III 방향을 우선하되, 비워두지 말고 같은 식품군에서 현실적인 대안을 채워 제시하세요.\n') +
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
  // 사용자가 "있는 그대로" 표시를 원하므로, 비어 있지 않으면 통과시킨다.
  return true;
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
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              '웹 검색 결과를 우선 참고해 답하세요. 빈칸 없이 한국에서 구하기 쉬운 대안을 3개 제시하세요.',
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
    '- 반드시 3개를 채워서 제시한다. 빈칸 금지.\n' +
    '- 완전 일치 제품이 부족하면, 한국에서 유통되는 같은 식품군의 대표 제품(브랜드+제품명)을 제안한다.\n' +
    '- "찾지 못했어요" 문장은 쓰지 말고, 가장 가까운 현실적 대안을 적는다.\n';
  const second = await generateAlternativesOnce(perplexityApiKey, PERPLEXITY_MODEL, relaxedPrompt);
  return second.text;
}
