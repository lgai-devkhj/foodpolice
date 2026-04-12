/**
 * 대체 식품 안내 — Perplexity 웹 검색 전용. 응답은 JSON.
 */

import {
  type AlternativeFoodJsonItem,
  type AlternativeFoodJsonRoot,
  alternativeLikelyWrongFoodCategory,
  alternativeLooksLikeSpreadJarOrPaste,
  isPurchaseableProductUrl,
  isSameProductLineOrWeightOnlyVariant,
  productIdentityCore,
  scannedLooksLikeHandheldPieceSnack,
  unwrapModelJsonBlock,
} from '@/lib/alternative-food-json';
import type { BmiTier } from '@/lib/gemini-prompts';

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
  /** 프로필 BMI 구간 — 추천 방향·제품 유형 힌트 */
  bmiTier?: BmiTier | null;
}

const JSON_OUTPUT_SPEC =
  '[출력 — JSON 단일 객체 하나만, 마크다운·코드펜스·설명 문장 금지]\n' +
  JSON.stringify(
    {
      currentFood: '현재 제품명과 동일',
      processingStage: '예: Group 4 · 4A',
      alternatives: [
        {
          tier: 'slight',
          productName: '브랜드 + 정식 상품명',
          reason: '한 문장, 토스 말투(-요)로 왜 더 나은지',
          purchaseUrl: 'https://실제-구매-또는-상품-페이지',
        },
        {
          tier: 'better',
          productName: '',
          reason: '',
          purchaseUrl: '',
        },
        {
          tier: 'best',
          productName: '',
          reason: '',
          purchaseUrl: '',
        },
      ],
    },
    null,
    0
  ) +
  '\n' +
  '필수: alternatives는 **최소 1개**(가능하면 정확히 3개). tier는 slight, better, best 중 가능한 것만 채우되, 3개면 각 tier 1개씩 권장.\n' +
  '필수: purchaseUrl은 http(s) 로 시작하고, 눌렀을 때 상품·스토어로 이동 가능한 링크.\n';

export function buildAlternativeFoodWebSearchPrompt(ctx: AlternativeSearchContext): string {
  const raw = (ctx.rawMaterials || '').slice(0, 900);
  const sub = ctx.novaSubgroup ? ` · ${ctx.novaSubgroup}` : '';
  const stage = `Group ${ctx.novaGroup}${ctx.novaGroup === 4 ? sub : ''}`;
  const cat = ctx.foodCategory || '미분류';
  const desc = (ctx.briefDescription || '').slice(0, 300);
  const nut = ctx.nutritionHint ? `\n(1회 제공량·표 기준 추정) ${ctx.nutritionHint}\n` : '';
  const scanned = (ctx.productName || '').trim();
  const bmiHint =
    ctx.bmiTier === 'overweight' || ctx.bmiTier === 'obese'
      ? '\n[사용자 맞춤 — BMI] 과체중/비만 구간이에요. 같은 식품군에서 **당·나트륨·에너지(칼로리) 부담이 상대적으로 낮은** 실제 유통품을 우선하고, reason에는 그 근거를 토스 말투로 한 문장 넣어 주세요.\n'
      : ctx.bmiTier === 'underweight'
        ? '\n[사용자 맞춤 — BMI] 저체중 구간이에요. **포만감·에너지가 함께 따라오는** 실제 제품도 균형 있게 넣고, 무조건 제로·무맛만 고르진 않아도 돼요.\n'
        : ctx.bmiTier === 'normal'
          ? '\n[사용자 맞춤 — BMI] 정상 체중이에요. **비슷한 용도에서 가공·당·염을 한 단계 덜한** 실제 제품을 제안해 주세요.\n'
          : '';

  const categoryLockBlock =
    '[식품군 고정 — 필수]\n' +
    `- 현재 **foodCategory는 "${cat}"** 이에요.\n` +
    '- 넣는 **모든 alternative**는 이 카테고리와 **같은 식품군**(같은 용도·같은 먹는 방식)이어야 해요. 카테고리를 바꾸는 추천은 안 돼요.\n' +
    '- 금지 예시: **음료**인데 과자·라면·도시락·빵만 추천 / **간식**인데 주스·탄산만·한 끼 식사·시리얼 봉지 식사만 추천 / **한 끼**인데 음료·초소형 캔디만 추천 / **빵·시리얼**인데 라면·과자 봉지만·탄산음료만 추천 / **유제품·디저트**인데 라면·육포·칩만 추천.\n' +
    '- **달콤한 간식·짭짤한 간식**이면 손으로 집어먹는 형태(통·봉지)를 유지하고, **잼·초콜릿 스프레드·넛버터 통**(발라 먹는 형태)으로 바꾸지 마세요.\n' +
    (cat === '미분류'
      ? '- foodCategory가 미분류면 제품명·원재료로 보이는 **용도(마심/집어 먹음/한 끼 등)** 를 유지한 **같은 축**의 실제 유통 품목만 추천하세요.\n'
      : '') +
    '\n';

  return (
    '[말투]\n사용자에게 보이는 reason 문장은 토스 말투(친근한 -요체, 짧게)로 쓴다.\n\n' +
    '**필수:** 웹 검색으로 실제 판매 페이지를 확인한 뒤, JSON만 출력해 주세요.\n\n' +
    '[핵심 기준]\n' +
    '1. 추천 **각 품목**은 모두 **촬영·분석한 제품보다 건강/가공 관점에서 나은 실제 유통품**이어야 합니다.\n' +
    '2. **같은 제품**, **중량·용량·개입 수만 다른 제품**, **동일 라인·동일 품목의 다른 용량**은 절대 넣지 마세요.\n' +
    `3. 비교 대상(금지 대상) 상품명: "${scanned || '(라벨 미확인)'}" — 이와 동일 계열·용량 변형으로 보이면 배제하세요.\n` +
    '4. productName은 반드시 **브랜드 + 공식 출시명**(검색 스니펫·상세에 나오는 그대로)이어야 합니다. 일반명만 쓰지 마세요.\n' +
    '5. 임의로 브랜드와 품목을 합성하지 마세요.\n\n' +
    '[현재 식품 — 이미지 분석 결과]\n' +
    `제품명: ${ctx.productName || '(라벨에서 읽지 못함)'}\n` +
    `제조사: ${ctx.companyName || '(없음)'}\n` +
    `foodCategory: ${cat}\n` +
    `NOVA(한국형): ${stage}\n` +
    (desc ? `한 줄 설명: ${desc}\n` : '') +
    (raw ? `원재료 일부: ${raw}\n` : '') +
    (nut ? `영양(숫자):${nut}` : '') +
    bmiHint +
    '\n[한국 온라인 — 검색]\n' +
    '- 네이버 쇼핑, 쿠팡, SSG, 대형마트 채널 등에서 **실제 상품 URL**이 나올 때까지 쿼리를 조정하세요.\n' +
    (ctx.nutritionHint
      ? '- 영양(숫자)가 있으면 같은 식품군 안에서 당·나트륨·포화지방 등이 상대적으로 유리한 쪽을 우선하세요.\n'
      : '') +
    '\n' +
    (ctx.novaGroup === 3
      ? '[가공 단계] Group III이면 덜 가공된 방향(원재료 명확, 첨가 적은 실제 제품)을 우선합니다.\n\n'
      : ctx.novaGroup <= 2
        ? '[가공 단계] Group I~II라도 사용자 요청 시 같은 식품군의 실제 제품명을 제안합니다.\n\n'
        : '[가공 단계] Group IV면 한 단계 덜 가공된 방향(4C→4B 등)을 고려하되, 반드시 다른 SKU여야 합니다.\n\n') +
    categoryLockBlock +
    JSON_OUTPUT_SPEC
  );
}

function isValidTier(v: unknown): v is AlternativeFoodJsonItem['tier'] {
  return v === 'slight' || v === 'better' || v === 'best';
}

export type AlternativesScanContext = {
  rawMaterials?: string;
  foodCategory?: string | null;
};

function normalizeAlternativesPayload(
  data: unknown,
  scannedProductName: string,
  scanContext?: AlternativesScanContext | null
): AlternativeFoodJsonRoot | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const currentFood = o.currentFood != null ? String(o.currentFood).trim() : '';
  const processingStage = o.processingStage != null ? String(o.processingStage).trim() : '';
  const rawAlts = o.alternatives;
  if (!Array.isArray(rawAlts) || rawAlts.length < 1) return null;

  const items: AlternativeFoodJsonItem[] = [];
  const seenCores = new Set<string>();

  for (const entry of rawAlts) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (!isValidTier(e.tier)) continue;
    const productName = e.productName != null ? String(e.productName).trim() : '';
    const reason = e.reason != null ? String(e.reason).trim() : '';
    const purchaseUrl = e.purchaseUrl != null ? String(e.purchaseUrl).trim() : '';
    if (!productName || !reason || !purchaseUrl) continue;
    if (!isPurchaseableProductUrl(purchaseUrl)) continue;
    if (isSameProductLineOrWeightOnlyVariant(productName, scannedProductName)) continue;
    if (scanContext && alternativeLikelyWrongFoodCategory(productName, scanContext.foodCategory)) {
      continue;
    }
    if (
      scanContext &&
      scannedLooksLikeHandheldPieceSnack(
        scannedProductName,
        scanContext.rawMaterials,
        scanContext.foodCategory
      ) &&
      alternativeLooksLikeSpreadJarOrPaste(productName)
    ) {
      continue;
    }
    const core = productIdentityCore(productName);
    if (!core || seenCores.has(core)) continue;
    seenCores.add(core);
    items.push({ tier: e.tier, productName, reason, purchaseUrl });
  }

  const byTier = new Map<AlternativeFoodJsonItem['tier'], AlternativeFoodJsonItem>();
  for (const it of items) {
    if (!byTier.has(it.tier)) byTier.set(it.tier, it);
  }
  if (byTier.size < 1) return null;

  const tierSeq: AlternativeFoodJsonItem['tier'][] = ['slight', 'better', 'best'];
  const ordered: AlternativeFoodJsonItem[] = [];
  for (const t of tierSeq) {
    const it = byTier.get(t);
    if (it) ordered.push(it);
  }
  if (ordered.length === 0) return null;

  return {
    currentFood: currentFood || scannedProductName,
    processingStage: processingStage || '',
    alternatives: ordered,
  };
}

function acceptAlternativeModelJson(
  text: string,
  scannedProductName: string,
  scanContext?: AlternativesScanContext | null
): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/더\s*건강한\s*식품은\s*찾지\s*못했어요/i.test(t)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapModelJsonBlock(t));
  } catch {
    return null;
  }

  const normalized = normalizeAlternativesPayload(parsed, scannedProductName, scanContext);
  if (!normalized) return null;
  return JSON.stringify(normalized);
}

async function generateAlternativesOnce(
  perplexityApiKey: string,
  model: string,
  prompt: string,
  scannedProductName: string,
  scanContext?: AlternativesScanContext | null
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
              '웹 검색 근거로만 답해 주세요. 응답은 유효한 JSON 객체 하나만 출력해 주세요. 마크다운·코드 블록·설명 문장은 빼 주세요. 추측·임의 조합은 안 돼요.',
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

  const normalized = acceptAlternativeModelJson(t, scannedProductName, scanContext);
  if (normalized) {
    return {
      text: normalized,
      ok: true,
      status: res.status,
      bodySnippet: '',
      elapsedMs: Date.now() - started,
    };
  }

  console.warn(`[alternatives] rejected JSON perplexity len=${t.length}`);
  return { text: null, ok: true, status: res.status, bodySnippet: '', elapsedMs: Date.now() - started };
}

/**
 * Perplexity 검색 — `sonar` 단일 고정.
 * 빈 응답·검증 탈락 시 1회 재시도.
 */
export async function fetchAlternativesWithPerplexity(
  perplexityApiKey: string,
  prompt: string,
  scannedProductName: string,
  scanContext?: AlternativesScanContext | null
): Promise<string | null> {
  const first = await generateAlternativesOnce(
    perplexityApiKey,
    PERPLEXITY_MODEL,
    prompt,
    scannedProductName,
    scanContext
  );
  if (first.text) return first.text;

  const relaxedPrompt =
    prompt +
    '\n\n[재시도]\n' +
    '- JSON만 출력.\n' +
    '- alternatives 최소 1개(권장 3개), tier slight/better/best 가능한 만큼.\n' +
    '- 각 purchaseUrl은 http(s) 실제 상품·스토어 페이지.\n' +
    '- 촬영 제품과 동일하거나 중량·개입만 다른 SKU는 배제.\n' +
    '- 반드시 촬영 제품보다 나은 다른 SKU만.\n' +
    '- **foodCategory(식품군)는 반드시 지킬 것.** 다른 카테고리 상품으로 바꾸지 말 것.\n';
  const second = await generateAlternativesOnce(
    perplexityApiKey,
    PERPLEXITY_MODEL,
    relaxedPrompt,
    scannedProductName,
    scanContext
  );
  return second.text;
}
