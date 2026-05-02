import {
  type AlternativeFoodJsonItem,
  type AlternativeFoodJsonRoot,
  alternativeLikelyFlavorMismatch,
  alternativeLikelyWrongFoodCategory,
  alternativeLooksLikeSpreadJarOrPaste,
  isPurchaseableProductUrl,
  isSameProductLineOrWeightOnlyVariant,
  productIdentityCore,
  scannedLooksLikeHandheldPieceSnack,
  unwrapModelJsonBlock,
} from '@/lib/alternative-food-json';
import { getTossUserFacingToneBlock, type BmiTier } from '@/lib/gemini-prompts';

export const PERPLEXITY_MODEL = 'sonar';

const PER_ATTEMPT_TIMEOUT_MS = 25_000;
const MAX_PRODUCT_NAME_LEN = 120;
const MAX_REASON_LEN = 120;
const MAX_PROCESSING_STAGE_LEN = 80;
const MAX_CURRENT_FOOD_LEN = 120;

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

export type AlternativesScanContext = {
  rawMaterials?: string;
  foodCategory?: string | null;
};

export type PerplexityAlternativesOutcome = {
  json: string | null;
  perplexityTransportFailed: boolean;
};

function clampText(v: unknown, maxLen: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeLooseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function toFiniteNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function normalizeReasonTone(reason: string): string {
  let s = clampText(reason, MAX_REASON_LEN);
  if (!s) return '';

  s = s
    .replace(/[.!]+$/g, '')
    .replace(/\b(환자|치료|처방|진료|병원)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!s) return '';

  if (!/[요]$/.test(s)) {
    if (/다$/.test(s)) s = s.replace(/다$/, '요');
    else if (/함$/.test(s)) s = s.replace(/함$/, '해요');
    else s = `${s}요`;
  }

  s = s.replace(/되어요/g, '돼요');

  return s;
}

function getAlternativeBmiHint(bmiTier?: BmiTier | null): string {
  if (bmiTier === 'overweight' || bmiTier === 'obese') {
    return '- BMI는 과체중/비만이에요. 같은 식품군 안에서 당, 나트륨, 포화지방, 열량 부담이 상대적으로 낮은 실제 제품을 우선해요.\n';
  }
  if (bmiTier === 'underweight') {
    return '- BMI는 저체중이에요. 같은 식품군 안에서 너무 가볍기만 한 제품보다 에너지와 포만감도 함께 볼 수 있는 실제 제품을 우선해요.\n';
  }
  if (bmiTier === 'normal') {
    return '- BMI는 정상이에요. 같은 식품군 안에서 가공도, 당, 염이 상대적으로 덜한 실제 제품을 우선해요.\n';
  }
  return '';
}

export function buildNutritionHintForAlternatives(
  n: AlternativesNutritionPayload | null | undefined
): string | null {
  if (!n || typeof n !== 'object') return null;

  const parts: string[] = [];
  const push = (label: string, value: unknown, unit: string) => {
    const num = toFiniteNumber(value);
    if (num == null) return;
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

const JSON_OUTPUT_SPEC = [
  '[출력]',
  '- JSON 객체 하나만 출력해요.',
  '- 마크다운, 코드블록, 설명 문장, 인삿말은 넣지 않아요.',
  JSON.stringify(
    {
      currentFood: '현재 제품명과 동일',
      processingStage: '예: NOVA 4단계 · 세부 4A',
      alternatives: [
        {
          tier: 'slight',
          productName: '브랜드 + 정식 상품명',
          reason: '짧은 한 문장, 앱인토스 UX 라이팅·-해요체',
          purchaseUrl: 'https://실제-상품-또는-스토어-페이지',
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
  ),
  '- alternatives는 최소 1개, 가능하면 3개예요.',
  '- tier는 slight, better, best 중 가능한 것만 써요.',
  '- purchaseUrl은 반드시 http(s) 실제 상품 또는 스토어 페이지예요.',
  '- reason은 아래 [말투 · 앱인토스 UX 라이팅]을 따라 짧고 분명하게 써요.',
].join('\n');

export function buildAlternativeFoodWebSearchPrompt(ctx: AlternativeSearchContext): string {
  const raw = clampText(ctx.rawMaterials, 500);
  const sub = ctx.novaSubgroup ? ` · ${ctx.novaSubgroup}` : '';
  const stage = `Group ${ctx.novaGroup}${ctx.novaGroup === 4 ? sub : ''}`;
  const cat = clampText(ctx.foodCategory || '미분류', 40);
  const desc = clampText(ctx.briefDescription || '', 150);
  const nut = ctx.nutritionHint ? `- 영양: ${clampText(ctx.nutritionHint, 180)}\n` : '';
  const scanned = clampText(ctx.productName || '', 100);

  return [
    '웹 검색으로 실제 판매 중인 더 나은 대체 식품을 찾고 JSON 하나만 출력해요.',
    '',
    '[현재 제품]',
    `- 제품명: ${ctx.productName || '(라벨에서 읽지 못함)'}`,
    `- 제조사: ${ctx.companyName || '(없음)'}`,
    `- foodCategory: ${cat}`,
    `- NOVA: ${stage}`,
    desc ? `- 설명: ${desc}` : '',
    raw ? `- 원재료 일부: ${raw}` : '',
    nut ? nut.trimEnd() : '',
    getAlternativeBmiHint(ctx.bmiTier).trimEnd(),
    '',
    '[핵심 기준]',
    '- alternatives는 모두 현재 제품보다 건강·가공도 관점에서 더 나은 실제 유통품이어야 해요.',
    `- "${scanned || '(라벨 미확인)'}"와 같은 제품, 같은 제품 라인의 용량·개수만 다른 변형은 제외해요.`,
    '- productName은 반드시 브랜드 + 공식 상품명으로 써요.',
    '- 브랜드와 품목을 임의로 합치지 않아요.',
    '- reason은 짧은 한 문장으로, 앱인토스 UX 라이팅·능동형으로 바로 근거를 말해요.',
    '- reason은 사용자를 환자처럼 부르지 않고 병원·진료 맥락으로 쓰지 않아요.',
    '- purchaseUrl은 눌렀을 때 실제 상품 또는 스토어로 이동되는 링크만 써요.',
    '',
    '[식품군 고정]',
    `- 현재 foodCategory는 "${cat}"예요.`,
    '- 모든 alternatives는 같은 식품군, 같은 용도, 같은 먹는 방식이어야 해요.',
    '- 음료는 음료, 간식은 간식, 한 끼는 한 끼, 빵·시리얼은 빵·시리얼, 유제품·디저트는 유제품·디저트로 유지해요.',
    cat === '음료' || cat === '유제품·디저트'
      ? '- foodCategory가 음료 또는 유제품·디저트면, 위 제품명·설명·원재료에서 소비자가 기대하는 핵심 맛·향(과일·초코·커피·캐러멜·솜사탕 등 어떤 표현이든)을 스스로 정하고, alternatives는 그 맛·향 축을 벗어나지 않게 골라요.'
      : '',
    '- 달콤한 간식·짭짤한 간식이면 손으로 집어먹는 형태를 유지하고, 스프레드·페이스트·잼·넛버터 통 형태로 바꾸지 않아요.',
    cat === '미분류'
      ? '- foodCategory가 미분류면 제품명과 원재료를 보고 마시는지, 집어먹는지, 한 끼인지 같은 축을 유지해요.'
      : '',
    '',
    '[검색]',
    '- 한국 온라인 판매 페이지 기준으로 찾아요.',
    '- 네이버쇼핑, 쿠팡, SSG, 대형마트 채널 등 실제 상품 URL이 나올 때까지 검색어를 조정해요.',
    ctx.nutritionHint
      ? '- 영양 숫자가 있으면 같은 식품군 안에서 당, 나트륨, 포화지방, 열량 부담이 상대적으로 낮은 쪽을 우선해요.'
      : '',
    ctx.novaGroup === 3
      ? '- 현재 제품이 NOVA 3단계면 더 덜 가공되고 원재료가 단순한 방향을 우선해요.'
      : ctx.novaGroup <= 2
        ? '- 현재 제품이 NOVA 1~2단계라도 같은 식품군의 실제 제품명만 추천해요.'
        : '- 현재 제품이 NOVA 4단계면 한 단계 덜 가공된 방향을 고려하되, 이름이 다른 다른 제품만 추천해요.',
    '',
    getTossUserFacingToneBlock(),
    '',
    JSON_OUTPUT_SPEC,
  ]
    .filter(Boolean)
    .join('\n');
}

function isValidTier(v: unknown): v is AlternativeFoodJsonItem['tier'] {
  return v === 'slight' || v === 'better' || v === 'best';
}

function isLikelyStoreOrProductPage(url: string): boolean {
  return isPurchaseableProductUrl(url);
}

function dedupeByTier(items: AlternativeFoodJsonItem[]): AlternativeFoodJsonItem[] {
  const byTier = new Map<AlternativeFoodJsonItem['tier'], AlternativeFoodJsonItem>();
  for (const item of items) {
    if (!byTier.has(item.tier)) byTier.set(item.tier, item);
  }

  const order: AlternativeFoodJsonItem['tier'][] = ['slight', 'better', 'best'];
  return order.map((tier) => byTier.get(tier)).filter(Boolean) as AlternativeFoodJsonItem[];
}

function normalizeAlternativesPayload(
  data: unknown,
  scannedProductName: string,
  scanContext?: AlternativesScanContext | null
): AlternativeFoodJsonRoot | null {
  if (!data || typeof data !== 'object') return null;

  const root = data as Record<string, unknown>;
  const currentFood = clampText(root.currentFood, MAX_CURRENT_FOOD_LEN);
  const processingStage = clampText(root.processingStage, MAX_PROCESSING_STAGE_LEN);
  const rawAlts = root.alternatives;

  if (!Array.isArray(rawAlts) || rawAlts.length < 1) return null;

  const items: AlternativeFoodJsonItem[] = [];
  const seenCores = new Set<string>();

  for (const entry of rawAlts) {
    if (!entry || typeof entry !== 'object') continue;

    const e = entry as Record<string, unknown>;
    if (!isValidTier(e.tier)) continue;

    const productName = clampText(e.productName, MAX_PRODUCT_NAME_LEN);
    const reason = normalizeReasonTone(String(e.reason ?? ''));
    const purchaseUrl = normalizeLooseUrl(String(e.purchaseUrl ?? ''));

    if (!productName || !reason || !purchaseUrl) continue;
    if (!isLikelyStoreOrProductPage(purchaseUrl)) continue;
    if (isSameProductLineOrWeightOnlyVariant(productName, scannedProductName)) continue;

    if (scanContext?.foodCategory && alternativeLikelyWrongFoodCategory(productName, scanContext.foodCategory)) {
      continue;
    }

    if (
      scanContext &&
      alternativeLikelyFlavorMismatch(
        scannedProductName,
        productName,
        scanContext.foodCategory,
        scanContext.rawMaterials
      )
    ) {
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
    items.push({
      tier: e.tier,
      productName,
      reason,
      purchaseUrl,
    });
  }

  const ordered = dedupeByTier(items);
  if (ordered.length === 0) return null;

  return {
    currentFood: currentFood || clampText(scannedProductName, MAX_CURRENT_FOOD_LEN),
    processingStage,
    alternatives: ordered,
  };
}

function acceptAlternativeModelJson(
  text: string,
  scannedProductName: string,
  scanContext?: AlternativesScanContext | null
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/더\s*건강한\s*식품은\s*찾지\s*못했어요/i.test(trimmed)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapModelJsonBlock(trimmed));
  } catch {
    return null;
  }

  const normalized = normalizeAlternativesPayload(parsed, scannedProductName, scanContext);
  return normalized ? JSON.stringify(normalized) : null;
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

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${perplexityApiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        top_p: 0.9,
        messages: [
          {
            role: 'system',
            content:
              '웹 검색 근거로만 답하고, 유효한 JSON 객체 하나만 출력해요. 마크다운, 코드 블록, 설명 문장, 추측, 임의 조합은 넣지 않아요.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

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

    const normalized = acceptAlternativeModelJson(String(text ?? ''), scannedProductName, scanContext);

    if (normalized) {
      return {
        text: normalized,
        ok: true,
        status: res.status,
        bodySnippet: '',
        elapsedMs: Date.now() - started,
      };
    }

    console.warn(`[alternatives] rejected JSON perplexity len=${String(text ?? '').length}`);
    return {
      text: null,
      ok: true,
      status: res.status,
      bodySnippet: '',
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    clearTimeout(timer);
    const elapsedMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[alternatives] perplexity fetch failed:', message);

    return {
      text: null,
      ok: false,
      status: 0,
      bodySnippet: '',
      elapsedMs,
    };
  }
}

export async function fetchAlternativesWithPerplexity(
  perplexityApiKey: string,
  prompt: string,
  scannedProductName: string,
  scanContext?: AlternativesScanContext | null
): Promise<PerplexityAlternativesOutcome> {
  const first = await generateAlternativesOnce(
    perplexityApiKey,
    PERPLEXITY_MODEL,
    prompt,
    scannedProductName,
    scanContext
  );

  if (first.text) {
    return {
      json: first.text,
      perplexityTransportFailed: false,
    };
  }

  const relaxedPrompt = [
    prompt,
    '',
    '[재시도]',
    '- JSON만 출력해요.',
    '- alternatives는 최소 1개, 가능하면 3개예요.',
    '- tier는 slight, better, best 중 가능한 것만 써요.',
    '- purchaseUrl은 http(s) 실제 상품 또는 스토어 페이지예요.',
    '- 촬영한 제품과 같거나 중량, 용량, 개수만 다른 같은 제품은 넣지 않아요.',
    '- foodCategory는 반드시 지켜요.',
    '- reason은 짧은 한 문장으로, 앱인토스 UX 라이팅·-해요체만 써요.',
  ].join('\n');

  const second = await generateAlternativesOnce(
    perplexityApiKey,
    PERPLEXITY_MODEL,
    relaxedPrompt,
    scannedProductName,
    scanContext
  );

  if (second.text) {
    return {
      json: second.text,
      perplexityTransportFailed: false,
    };
  }

  const transportFailed =
    first.status === 0 ||
    second.status === 0 ||
    (!first.ok && !second.ok);

  return {
    json: null,
    perplexityTransportFailed: transportFailed,
  };
}