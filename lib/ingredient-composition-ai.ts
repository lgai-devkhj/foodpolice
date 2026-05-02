import { geminiGenerateContentUrl, readGeminiApiKeyFromEnv } from '@/lib/gemini-api';
import {
  ANALYSIS_GEMINI_MODEL,
  GEMINI_INGREDIENT_AI_TIMEOUT_MS,
  GEMINI_INGREDIENT_AUX_MAX_OUTPUT_TOKENS,
  GEMINI_INGREDIENT_VALIDATE_MAX_OUTPUT_TOKENS,
  GEMINI_INGREDIENT_VALIDATE_TIMEOUT_MS,
} from '@/lib/gemini-models';
import { generationConfigJsonMode, textPart } from '@/lib/gemini-rest-body';
import {
  getGeminiCandidateText,
  hasGeminiCandidates,
} from '@/lib/gemini-response-envelope';

export interface NutritionPer100gLike {
  fat: number;
  carbs: number;
  sugars: number;
  protein: number;
}

export type IngredientRole =
  | 'fat_source'
  | 'carb_source'
  | 'protein_source'
  | 'water_base'
  | 'additive';

export interface IngredientPriorFromAI {
  name: string;
  role: IngredientRole;
  expectedRange: { min: number; max: number };
  typical: number;
  reasoning: string;
}

export interface GeneratePriorsAiResult {
  items: IngredientPriorFromAI[];
  priorsConfidence: number;
  rawModelError?: string;
}

export interface IngredientNutritionProfileFromAI {
  name: string;
  fat: number;
  carbs: number;
  sugars: number;
  protein: number;
  water: number;
  confidence: number;
  reasoning: string;
}

export interface GenerateProfilesAiResult {
  items: IngredientNutritionProfileFromAI[];
  profilesConfidence: number;
  rawModelError?: string;
}

export interface ValidateEstimatesAiResult {
  unrealisticFlags: string[];
  adjustmentNotes: string[];
  confidenceMultipliers: number[];
  userSummary: string;
  rawModelError?: string;
}

const ROLES: IngredientRole[] = [
  'fat_source',
  'carb_source',
  'protein_source',
  'water_base',
  'additive',
];

function parseRole(s: string): IngredientRole {
  const x = String(s || '').trim().toLowerCase();
  if (ROLES.includes(x as IngredientRole)) return x as IngredientRole;
  if (x === 'fat' || x === 'oil') return 'fat_source';
  if (x === 'carb' || x === 'sugar') return 'carb_source';
  if (x === 'protein' || x === 'dairy') return 'protein_source';
  if (x === 'water' || x === 'liquid') return 'water_base';
  return 'additive';
}

function clampRange(min: number, max: number): { min: number; max: number } {
  const a = Math.max(0, Math.min(100, min));
  const b = Math.max(0, Math.min(100, max));
  if (a <= b) return { min: a, max: b };
  return { min: b, max: a };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  const start = t.indexOf('{');
  if (start < 0) return null;
  const end = t.lastIndexOf('}');
  if (end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const PROFILES_SYSTEM = `당신은 식품 원재료별 대표 영양 특성을 추정해 수식 엔진 입력을 만드는 도우미예요.
출력은 반드시 JSON 스키마만 따르고, 설명 문장은 넣지 않아요.
각 원재료의 100g 기준 대표값으로 fat, carbs, sugars, protein, water(0~100)를 추정해요.
불확실하면 confidence를 낮추고 reasoning을 짧게 남겨요.

[우선순위] JSON 스키마·필수 필드 > sugars≤carbs 등 수치 제약 > 입력 ingredients 순서·이름 일치 > 짧은 reasoning.
[출력 가드레일] 마크다운·코드펜스 금지. 라벨에 없는 원재료를 새로 넣지 않아요.`;

function buildProfilesUserPrompt(inp: PriorsAiInput): string {
  return (
    `${PROFILES_SYSTEM}\n\n` +
    `[입력]\n` +
    `category: ${inp.category}\n` +
    `ingredients (라벨 순서): ${JSON.stringify(inp.ingredients)}\n` +
    `nutritionPer100g: ${JSON.stringify(inp.nutritionPer100g)}\n\n` +
    `[규칙]\n` +
    `- items 길이는 ingredients와 같아야 해요.\n` +
    `- name은 입력 문자열과 동일해야 해요.\n` +
    `- sugars <= carbs를 지켜요.\n` +
    `- 각 값은 0~100 사이 숫자예요.\n` +
    `- 추정치는 수식 엔진 입력용 대표치예요.\n\n` +
    `[출력 JSON]\n` +
    '{"profilesConfidence":0.0-1.0,"items":[{"name":"","fat":0,"carbs":0,"sugars":0,"protein":0,"water":0,"confidence":0.0-1.0,"reasoning":""}]}'
  );
}

function clamp01(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function clampN(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, v));
}

export async function generateIngredientProfilesWithAI(
  input: PriorsAiInput,
  options?: { apiKey?: string; model?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<GenerateProfilesAiResult | null> {
  const apiKey = options?.apiKey ?? readGeminiApiKeyFromEnv();
  if (!apiKey) return null;
  const model = options?.model ?? ANALYSIS_GEMINI_MODEL;
  const timeoutMs = options?.timeoutMs ?? GEMINI_INGREDIENT_AI_TIMEOUT_MS;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = options?.signal ?? ctrl.signal;
  const url = geminiGenerateContentUrl(model, apiKey);
  const userText = buildProfilesUserPrompt(input);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [textPart(userText)] }],
        generationConfig: generationConfigJsonMode({
          maxOutputTokens: GEMINI_INGREDIENT_AUX_MAX_OUTPUT_TOKENS,
          temperature: 0,
        }),
      }),
    });
    clearTimeout(t);
    if (!res.ok) return { items: [], profilesConfidence: 0, rawModelError: `HTTP ${res.status}` };
    const body = (await res.json()) as unknown;
    if (!hasGeminiCandidates(body)) return { items: [], profilesConfidence: 0, rawModelError: 'no_candidates' };
    const text = getGeminiCandidateText(body);
    if (!text) return { items: [], profilesConfidence: 0, rawModelError: 'empty_text' };
    const parsed = extractJsonObject(text);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [], profilesConfidence: 0, rawModelError: 'parse' };

    const profilesConfidence = clamp01(parsed.profilesConfidence, 0.5);
    const rawItems = parsed.items as Array<Record<string, unknown>>;
    const items: IngredientNutritionProfileFromAI[] = [];

    for (let i = 0; i < input.ingredients.length; i++) {
      const row = rawItems[i] ?? {};
      const carbs = clampN(row.carbs, 0);
      const sugars = Math.min(clampN(row.sugars, 0), carbs);
      items.push({
        name: row.name != null ? String(row.name) : input.ingredients[i],
        fat: clampN(row.fat, 0),
        carbs,
        sugars,
        protein: clampN(row.protein, 0),
        water: clampN(row.water, 0),
        confidence: clamp01(row.confidence, 0.5),
        reasoning: row.reasoning != null ? String(row.reasoning).slice(0, 300) : '',
      });
    }

    return { items, profilesConfidence };
  } catch (e) {
    clearTimeout(t);
    return {
      items: [],
      profilesConfidence: 0,
      rawModelError: e instanceof Error ? e.message : 'abort',
    };
  }
}

export interface PriorsAiInput {
  ingredients: string[];
  nutritionPer100g: NutritionPer100gLike;
  category: string;
}

const PRIORS_SYSTEM = `당신은 식품 라벨·제조 관행에 익숙한 조언자예요.
출력은 반드시 요청 JSON 스키마만 따라요. 각 원재료의 함량 퍼센트(%)는 **직접 확정하지 않아요**.
역할(role), 참고용 범위(expectedRange), 참고 typical(0~100, 합이 100일 필요 없음)과 짧은 reasoning만 제시해요.
단정적·법적 표현은 쓰지 않고, 불확실하면 범위를 넓게 잡아요.

[우선순위] JSON 스키마·items 길이·name 일치 > 불확실 시 넓은 범위·낮은 신뢰 > reasoning 짧게.
[출력 가드레일] 마크다운·코드펜스 금지. 실제 함량을 단정하지 않아요.`;

function buildPriorsUserPrompt(inp: PriorsAiInput): string {
  return (
    `${PRIORS_SYSTEM}\n\n` +
    `[입력]\n` +
    `category: ${inp.category}\n` +
    `ingredients (라벨 순서): ${JSON.stringify(inp.ingredients)}\n` +
    `nutritionPer100g: ${JSON.stringify(inp.nutritionPer100g)}\n\n` +
    `[규칙]\n` +
    `- 실제 제조 관행·식품군 특성을 반영해 역할을 나눠요.\n` +
    `- 영양성분과 모순되는 전제(예: 물만으로 고지방)는 피해요.\n` +
    `- expectedRange.min/max는 해당 원재료가 전체 배합에서 차지할 **가능한 비중 범위(참고)**예요.\n` +
    `- typical은 범위 안의 대표치(참고)이고, 최종 비율은 계산기가 정해요.\n` +
    `- items 배열 길이는 ingredients와 같고, name은 입력과 동일한 문자열이어야 해요.\n\n` +
    `[출력 JSON]\n` +
    `{"priorsConfidence":0.0-1.0,"items":[{"name":"","role":"fat_source|carb_source|protein_source|water_base|additive","expectedRange":{"min":0,"max":100},"typical":0,"reasoning":""}]}`
  );
}

export async function generateIngredientPriorsWithAI(
  input: PriorsAiInput,
  options?: { apiKey?: string; model?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<GeneratePriorsAiResult | null> {
  const apiKey = options?.apiKey ?? readGeminiApiKeyFromEnv();
  if (!apiKey) return null;
  const model = options?.model ?? ANALYSIS_GEMINI_MODEL;
  const timeoutMs = options?.timeoutMs ?? GEMINI_INGREDIENT_AI_TIMEOUT_MS;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = options?.signal ?? ctrl.signal;

  const url = geminiGenerateContentUrl(model, apiKey);
  const userText = buildPriorsUserPrompt(input);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [textPart(userText)] }],
        generationConfig: generationConfigJsonMode({
          maxOutputTokens: GEMINI_INGREDIENT_AUX_MAX_OUTPUT_TOKENS,
          temperature: 0,
        }),
      }),
    });
    clearTimeout(t);
    if (!res.ok) {
      return { items: [], priorsConfidence: 0, rawModelError: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as unknown;
    if (!hasGeminiCandidates(body)) {
      return { items: [], priorsConfidence: 0, rawModelError: 'no_candidates' };
    }
    const text = getGeminiCandidateText(body);
    if (!text) return { items: [], priorsConfidence: 0, rawModelError: 'empty_text' };
    const parsed = extractJsonObject(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      return { items: [], priorsConfidence: 0, rawModelError: 'parse' };
    }
    const priorsConfidence =
      typeof parsed.priorsConfidence === 'number'
        ? Math.max(0, Math.min(1, parsed.priorsConfidence))
        : 0.55;
    const items: IngredientPriorFromAI[] = [];
    const arr = parsed.items as unknown[];
    for (let i = 0; i < input.ingredients.length; i++) {
      const row = arr[i] as Record<string, unknown> | undefined;
      const name = row?.name != null ? String(row.name) : input.ingredients[i];
      const role = parseRole(row?.role != null ? String(row.role) : 'additive');
      const er = row?.expectedRange as { min?: unknown; max?: unknown } | undefined;
      const min = typeof er?.min === 'number' ? er.min : 0;
      const max = typeof er?.max === 'number' ? er.max : 100;
      const typical =
        typeof row?.typical === 'number' && Number.isFinite(row.typical)
          ? Math.max(0, Math.min(100, row.typical))
          : (Number(min) + Number(max)) / 2;
      const reasoning = row?.reasoning != null ? String(row.reasoning).slice(0, 400) : '';
      items.push({
        name,
        role,
        expectedRange: clampRange(Number(min), Number(max)),
        typical: Math.max(0, Math.min(100, typical)),
        reasoning,
      });
    }
    while (items.length < input.ingredients.length) {
      const i = items.length;
      items.push({
        name: input.ingredients[i],
        role: 'additive',
        expectedRange: { min: 0, max: 100 },
        typical: 5,
        reasoning: '자동 보정',
      });
    }
    return { items: items.slice(0, input.ingredients.length), priorsConfidence };
  } catch (e) {
    clearTimeout(t);
    return {
      items: [],
      priorsConfidence: 0,
      rawModelError: e instanceof Error ? e.message : 'abort',
    };
  }
}

const VALIDATE_SYSTEM = `당신은 식품 라벨 추정 결과를 검토해요.
최종 함량 퍼센트는 이미 계산됐어요. 비현실성 플래그·설명·신뢰도 보정 계수만 제시해요.
JSON만 출력해요. adjustmentNotes·userSummary는 사용자에게 보이면 앱인토스 UX 라이팅(-해요체, 되어요→돼요, 능동·긍정 우선)을 따라요.`;

function buildValidatePrompt(
  ingredients: string[],
  category: string,
  nutrition: NutritionPer100gLike,
  estimated: Array<{ name: string; percent: number }>,
): string {
  return (
    `${VALIDATE_SYSTEM}\n\n` +
    `category: ${category}\n` +
    `nutritionPer100g: ${JSON.stringify(nutrition)}\n` +
    `estimatedIngredients (수식 엔진 결과, 참고): ${JSON.stringify(estimated)}\n\n` +
    `[출력 JSON]\n` +
    '{"unrealisticFlags":[],"adjustmentNotes":[],"confidenceMultipliers":[1.0],"userSummary":""}\n' +
    '- unrealisticFlags: 문자열 배열, 예: "정제수 비중이 지나치게 낮음"\n' +
    '- adjustmentNotes: 사용자에게 보일 짧은 메모(-해요체)\n' +
    '- confidenceMultipliers: 원재료 순서와 같은 길이, 0.7~1.0 권장(낮을수록 불확실)\n' +
    '- userSummary: 한두 문장 요약(앱인토스 UX 라이팅)\n'
  );
}

export async function validateEstimatesWithAI(
  ingredients: string[],
  category: string,
  nutrition: NutritionPer100gLike,
  estimatedPercents: number[],
  options?: { apiKey?: string; model?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<ValidateEstimatesAiResult | null> {
  const apiKey = options?.apiKey ?? readGeminiApiKeyFromEnv();
  if (!apiKey) return null;
  const model = options?.model ?? ANALYSIS_GEMINI_MODEL;
  const timeoutMs = options?.timeoutMs ?? GEMINI_INGREDIENT_VALIDATE_TIMEOUT_MS;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = options?.signal ?? ctrl.signal;

  const estimated = ingredients.map((name, i) => ({
    name,
    percent: Math.round(estimatedPercents[i] * 10) / 10,
  }));
  const url = geminiGenerateContentUrl(model, apiKey);
  const userText = buildValidatePrompt(ingredients, category, nutrition, estimated);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [textPart(userText)] }],
        generationConfig: generationConfigJsonMode({
          maxOutputTokens: GEMINI_INGREDIENT_VALIDATE_MAX_OUTPUT_TOKENS,
          temperature: 0,
        }),
      }),
    });
    clearTimeout(t);
    if (!res.ok) {
      return {
        unrealisticFlags: [],
        adjustmentNotes: [],
        confidenceMultipliers: ingredients.map(() => 1),
        userSummary: '',
        rawModelError: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as unknown;
    if (!hasGeminiCandidates(body)) {
      return {
        unrealisticFlags: [],
        adjustmentNotes: [],
        confidenceMultipliers: ingredients.map(() => 1),
        userSummary: '',
        rawModelError: 'no_candidates',
      };
    }
    const text = getGeminiCandidateText(body);
    if (!text) {
      return {
        unrealisticFlags: [],
        adjustmentNotes: [],
        confidenceMultipliers: ingredients.map(() => 1),
        userSummary: '',
        rawModelError: 'empty_text',
      };
    }
    const parsed = extractJsonObject(text);
    if (!parsed) {
      return {
        unrealisticFlags: [],
        adjustmentNotes: [],
        confidenceMultipliers: ingredients.map(() => 1),
        userSummary: '',
        rawModelError: 'parse',
      };
    }
    const flags = Array.isArray(parsed.unrealisticFlags)
      ? (parsed.unrealisticFlags as unknown[]).map((x) => String(x))
      : [];
    const notes = Array.isArray(parsed.adjustmentNotes)
      ? (parsed.adjustmentNotes as unknown[]).map((x) => String(x))
      : [];
    const multRaw = parsed.confidenceMultipliers;
    const confidenceMultipliers: number[] = [];
    for (let i = 0; i < ingredients.length; i++) {
      const m = Array.isArray(multRaw) ? multRaw[i] : 1;
      const v = typeof m === 'number' && Number.isFinite(m) ? m : 1;
      confidenceMultipliers.push(Math.max(0.5, Math.min(1, v)));
    }
    while (confidenceMultipliers.length < ingredients.length) confidenceMultipliers.push(1);
    const userSummary =
      parsed.userSummary != null ? String(parsed.userSummary).slice(0, 600) : '';
    return { unrealisticFlags: flags, adjustmentNotes: notes, confidenceMultipliers, userSummary };
  } catch (e) {
    clearTimeout(t);
    return {
      unrealisticFlags: [],
      adjustmentNotes: [],
      confidenceMultipliers: ingredients.map(() => 1),
      userSummary: '',
      rawModelError: e instanceof Error ? e.message : 'abort',
    };
  }
}
