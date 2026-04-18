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

const PER_ATTEMPT_TIMEOUT_MS = 18_000;

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
  nutritionHint: string | null;
  bmiTier?: BmiTier | null;
}

const JSON_OUTPUT_SPEC =
  '[출력]\n' +
  '- JSON 단일 객체 하나만 출력한다. 마크다운, 코드펜스, 설명 문장은 금지한다.\n' +
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
  '- alternatives는 최소 1개, 가능하면 3개.\n' +
  '- tier는 slight, better, best 중 가능한 것만 쓴다.\n' +
  '- purchaseUrl은 반드시 http(s) 실제 상품·스토어 페이지여야 한다.\n';

function getAlternativeBmiHint(bmiTier?: BmiTier | null): string {
  if (bmiTier === 'overweight' || bmiTier === 'obese') {
    return '- BMI: 과체중/비만. 같은 식품군에서 당·나트륨·에너지 부담이 상대적으로 낮은 실제 제품을 우선하고, reason에 그 근거를 짧게 쓴다.\n';
  }
  if (bmiTier === 'underweight') {
    return '- BMI: 저체중. 같은 식품군 안에서 포만감·에너지도 함께 고려하되 현재 제품보다 더 나은 실제 제품을 추천한다.\n';
  }
  if (bmiTier === 'normal') {
    return '- BMI: 정상. 같은 식품군에서 가공·당·염이 한 단계 덜한 실제 제품을 우선한다.\n';
  }
  return '';
}

export function buildAlternativeFoodWebSearchPrompt(ctx: AlternativeSearchContext): string {
  const raw = (ctx.rawMaterials || '').slice(0, 500);
  const sub = ctx.novaSubgroup ? ` · ${ctx.novaSubgroup}` : '';
  const stage = `Group ${ctx.novaGroup}${ctx.novaGroup === 4 ? sub : ''}`;
  const cat = ctx.foodCategory || '미분류';
  const desc = (ctx.briefDescription || '').slice(0, 150);
  const nut = ctx.nutritionHint ? `- 영양: ${ctx.nutritionHint}\n` : '';
  const scanned = (ctx.productName || '').trim();

  return (
    '웹 검색으로 실제 판매 중인 대체 식품을 찾고 JSON 하나만 출력해 주세요.\n\n' +
    '[현재 제품]\n' +
    `- 제품명: ${ctx.productName || '(라벨에서 읽지 못함)'}\n` +
    `- 제조사: ${ctx.companyName || '(없음)'}\n` +
    `- foodCategory: ${cat}\n` +
    `- NOVA: ${stage}\n` +
    (desc ? `- 설명: ${desc}\n` : '') +
    (raw ? `- 원재료 일부: ${raw}\n` : '') +
    nut +
    getAlternativeBmiHint(ctx.bmiTier) +
    '\n[핵심 기준]\n' +
    '- 모든 alternatives는 현재 제품보다 건강·가공 관점에서 더 나은 실제 유통품이어야 한다.\n' +
    `- 비교 금지 대상 상품명: "${scanned || '(라벨 미확인)'}". 같은 제품, 같은 라인, 중량·용량·개입 수만 다른 변형은 절대 넣지 않는다.\n` +
    '- productName은 반드시 브랜드 + 공식 상품명으로 쓴다.\n' +
    '- 임의로 브랜드와 품목을 합성하지 않는다.\n' +
    '- reason은 토스 말투의 짧은 한 문장으로 쓴다.\n' +
    '- reason에서 사용자를 환자·진료 대상으로 부르거나 진료·병원 맥락으로 말하지 않는다.\n' +
    '- purchaseUrl은 눌렀을 때 실제 상품·스토어로 이동 가능한 링크여야 한다.\n\n' +

    '[식품군 고정]\n' +
    `- 현재 foodCategory는 "${cat}" 이다.\n` +
    '- 모든 alternatives는 같은 식품군, 같은 용도, 같은 먹는 방식이어야 한다.\n' +
    '- 음료면 음료, 간식이면 간식, 한 끼면 한 끼, 빵·시리얼이면 빵·시리얼, 유제품·디저트면 유제품·디저트로 유지한다.\n' +
    '- 달콤한 간식·짭짤한 간식이면 손으로 집어먹는 형태를 유지하고, 잼·초콜릿 스프레드·넛버터 통처럼 발라 먹는 형태로 바꾸지 않는다.\n' +
    (cat === '미분류'
      ? '- foodCategory가 미분류면 제품명·원재료를 보고 마심/집어 먹음/한 끼 등 같은 축의 실제 유통 품목만 추천한다.\n'
      : '') +
    '\n[검색]\n' +
    '- 한국 온라인 판매 페이지 기준으로 찾는다.\n' +
    '- 네이버 쇼핑, 쿠팡, SSG, 대형마트 채널 등 실제 상품 URL이 나올 때까지 쿼리를 조정한다.\n' +
    (ctx.nutritionHint
      ? '- 영양 숫자가 있으면 같은 식품군 안에서 당·나트륨·포화지방 등이 상대적으로 유리한 쪽을 우선한다.\n'
      : '') +
    (ctx.novaGroup === 3
      ? '- 현재 제품이 Group III이면 더 덜 가공되고 원재료가 명확한 방향을 우선한다.\n'
      : ctx.novaGroup <= 2
        ? '- 현재 제품이 Group I~II라도 같은 식품군의 실제 제품명만 추천한다.\n'
        : '- 현재 제품이 Group IV면 한 단계 덜 가공된 방향을 고려하되 반드시 다른 SKU만 추천한다.\n') +
    '\n' +
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
    '- alternatives 최소 1개, 가능하면 3개.\n' +
    '- tier는 slight, better, best 중 가능한 것만 쓴다.\n' +
    '- purchaseUrl은 http(s) 실제 상품·스토어 페이지.\n' +
    '- 촬영 제품과 동일하거나 중량·개입만 다른 SKU는 배제.\n' +
    '- foodCategory는 반드시 지킨다.\n';

  const second = await generateAlternativesOnce(
    perplexityApiKey,
    PERPLEXITY_MODEL,
    relaxedPrompt,
    scannedProductName,
    scanContext
  );
  return second.text;
}