/**
 * 2000kcal 기준 일일 영양소 참고치(한국 영양성분 표의 % 계산에 흔히 쓰이는 값에 근사).
 * 실제 필요 에너지는 개인차가 크므로 참고용 문구에만 사용합니다.
 */
import type { NutritionTableRow } from './store';

export const DAILY_REFERENCE = {
  caloriesKcal: 2000,
  sodiumMg: 2000,
  carbsG: 324,
  sugarG: 100,
  proteinG: 55,
  fatG: 54,
  saturatedFatG: 15,
  transFatG: 2.2,
  /** 한국 영양성분 표에서 % 계산에 흔히 쓰는 1일 참고치(mg) */
  cholesterolMg: 300,
  /** 식이섬유 1일 참고량(g) 근사 */
  dietaryFiberG: 25,
} as const;

export interface NutritionFactsInput {
  caloriesKcal?: number | null;
  sodiumMg?: number | null;
  carbsG?: number | null;
  sugarG?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  saturatedFatG?: number | null;
  transFatG?: number | null;
  cholesterolMg?: number | null;
  dietaryFiberG?: number | null;
  /** 예: "1회 30g", "100ml당" */
  servingSizeText?: string | null;
  /** 표 숫자가 1회 제공량 기준이면 true, 100g·100ml 기준이면 false */
  basisIsPerServing?: boolean;
  tableRows?: NutritionTableRow[] | null;
}

export interface NutritionDailyPercent {
  calories?: number;
  sodium?: number;
  carbs?: number;
  sugar?: number;
  protein?: number;
  fat?: number;
  saturatedFat?: number;
  transFat?: number;
  cholesterol?: number;
  dietaryFiber?: number;
}

function pctOf(val: number | null | undefined, dv: number): number | undefined {
  if (val == null || !Number.isFinite(val) || dv <= 0) return undefined;
  return Math.min(999, Math.round((Number(val) / dv) * 1000) / 10);
}

export function computeDailyPercentages(n: NutritionFactsInput): NutritionDailyPercent | null {
  const out: NutritionDailyPercent = {};
  const c = pctOf(n.caloriesKcal, DAILY_REFERENCE.caloriesKcal);
  if (c !== undefined) out.calories = c;
  const na = pctOf(n.sodiumMg, DAILY_REFERENCE.sodiumMg);
  if (na !== undefined) out.sodium = na;
  const cb = pctOf(n.carbsG, DAILY_REFERENCE.carbsG);
  if (cb !== undefined) out.carbs = cb;
  const sg = pctOf(n.sugarG, DAILY_REFERENCE.sugarG);
  if (sg !== undefined) out.sugar = sg;
  const pr = pctOf(n.proteinG, DAILY_REFERENCE.proteinG);
  if (pr !== undefined) out.protein = pr;
  const ft = pctOf(n.fatG, DAILY_REFERENCE.fatG);
  if (ft !== undefined) out.fat = ft;
  const sf = pctOf(n.saturatedFatG, DAILY_REFERENCE.saturatedFatG);
  if (sf !== undefined) out.saturatedFat = sf;
  const tf = pctOf(n.transFatG, DAILY_REFERENCE.transFatG);
  if (tf !== undefined) out.transFat = tf;
  const chol = pctOf(n.cholesterolMg, DAILY_REFERENCE.cholesterolMg);
  if (chol !== undefined) out.cholesterol = chol;
  const fib = pctOf(n.dietaryFiberG, DAILY_REFERENCE.dietaryFiberG);
  if (fib !== undefined) out.dietaryFiber = fib;
  return Object.keys(out).length > 0 ? out : null;
}

/** 맞춤 참고 아래 짧은 설명(키·몸무게 기반일 때만 API에서 채움) */
export const PERSONALIZED_INTAKE_FOOTNOTE =
  '키·몸무게로 잡은 참고치예요. 사람마다 달라요.';
/** @deprecated PERSONALIZED_INTAKE_FOOTNOTE 사용 */
export const PERSONALIZED_INTAKE_KCAL_FOOTNOTE = PERSONALIZED_INTAKE_FOOTNOTE;

function ageYearsFromBirthDate(isoDate: string): number | null {
  const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const birth = new Date(y, mo, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1;
  if (age < 5 || age > 120) return null;
  return age;
}

/** 출생연도만 있을 때 한국 나이: 현재연도 − 출생연도 + 1 */
function ageKoreanFromBirthYear(birthYear: number): number | null {
  if (!Number.isFinite(birthYear)) return null;
  const cy = new Date().getFullYear();
  const age = cy - birthYear + 1;
  if (age < 5 || age > 120) return null;
  return age;
}

function ageYearsForBmr(opts?: {
  birthYear?: number | null;
  birthDate?: string | null;
}): number | null {
  if (opts?.birthYear != null && Number.isFinite(opts.birthYear)) {
    const k = ageKoreanFromBirthYear(opts.birthYear);
    if (k != null) return k;
  }
  if (opts?.birthDate) return ageYearsFromBirthDate(opts.birthDate);
  return null;
}

/**
 * Mifflin–St Jeor BMR × 활동계수(1.45, 보통). 나이·성별 없으면 보수적 기본값 사용.
 * 의료·영양 상담 대체 아님.
 */
export function estimateDailyKcalFromProfile(
  heightCm: number,
  weightKg: number,
  opts?: { gender?: string | null; birthDate?: string | null; birthYear?: number | null }
): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const fromBirth = ageYearsForBmr({
    birthYear: opts?.birthYear ?? null,
    birthDate: opts?.birthDate ?? null,
  });
  const age = fromBirth ?? 17;
  const g = (opts?.gender || '').toLowerCase();
  let bmr: number;
  if (g === 'female' || g === 'f') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else if (g === 'male' || g === 'm') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 78;
  }
  if (!Number.isFinite(bmr) || bmr < 400) return null;
  const tdee = Math.round(bmr * 1.45);
  return Math.min(3200, Math.max(1300, tdee));
}

export interface ProfileForKcalNote {
  heightCm: number;
  weightKg: number;
  birthYear?: number | null;
  birthDate?: string | null;
  gender?: string | null;
}

/** 대략적 하루 열량 참고(맞춤 안내 문장용, 의학적 권고 아님). 저체중이어도 2000kcal를 넘겨 올리지 않음 */
function roughDailyKcalTarget(bmi: number | null, category: string | null): number {
  if (bmi == null || !category) return DAILY_REFERENCE.caloriesKcal;
  if (category === '비만') return 1800;
  if (category === '과체중') return 1900;
  if (category === '저체중') return 2000;
  return DAILY_REFERENCE.caloriesKcal;
}

/** 간식 / 한 끼·간편식 / 음료 / 기타 — 배정 비율·문구 구분 */
type IntakeSlotKind = 'beverage' | 'snack' | 'meal' | 'general';

function intakeSlotKind(
  foodCategory: string | null | undefined,
  isBeverage: boolean,
  isLikelySweetDrinkPer100ml: boolean
): IntakeSlotKind {
  if (isBeverage || isLikelySweetDrinkPer100ml) return 'beverage';
  const c = (foodCategory || '').trim();
  if (c === '달콤한 간식' || c === '짭짤한 간식' || c === '유제품·디저트') return 'snack';
  if (c === '간편한 한 끼' || c === '빵·시리얼류') return 'meal';
  return 'general';
}

/** 내부 계산용: 하루 목표 열량 중 이 유형에 쓸 참고 몫(UI에는 kcal 숫자 미표시) */
function dailyKcalBudgetForThisFood(target: number, kind: IntakeSlotKind): number {
  const ratio =
    kind === 'beverage' ? 0.12 : kind === 'snack' ? 0.17 : kind === 'meal' ? 0.36 : 0.22;
  const raw = Math.round((target * ratio) / 50) * 50;
  return Math.max(120, Math.min(850, raw));
}

function beverageIntakeLine(): string {
  return '맞춤 참고: 1병=한 번이 아닐 수 있어요. 라벨의 1회 제공량(ml)을 보고, 단 음료면 양을 줄여 보세요.';
}

/** 통·봉지·박스 등 포장 개수로 허용량을 말하지 않을 때만 사용 가능한 단위 */
function solidIntakeLine(n: number, unit: string, kind: IntakeSlotKind): string {
  const q = `${n}${unit}`;
  if (kind === 'snack') {
    return `맞춤 참고: 간식 기준으로 약 ${q} 분량이면 열량 부담이 커질 수 있어요(이 표 기준).`;
  }
  if (kind === 'meal') {
    return `맞춤 참고: 한 끼·간편식 기준으로 약 ${q} 분량이면 열량 부담이 커질 수 있어요(이 표 기준).`;
  }
  return `맞춤 참고: 약 ${q} 분량이면 열량 부담이 커질 수 있어요(이 표 기준).`;
}

const PACKAGING_COUNT_UNITS = new Set(['통', '봉지', '박스']);

/** 판매 포장 단위(통·봉 등). 섭취 1회와 다를 수 있음 */
function detectPackageUnit(servingText: string): string | null {
  return retailUnitFromServing(servingText);
}

/**
 * 1회 제공량·섭취 참고 등이 라벨에 분명한지 (우선순위 1)
 */
function detectServingUnitClear(servingText: string): boolean {
  return /1\s*회\s*섭취|1\s*회\s*제공|1\s*회\s*당|회\s*섭취|섭취\s*참고\s*량|제공량|1\s*일|일일\s*섭취|하루\s*\d+\s*회|1\s*회\s*\(|1\s*회\s*기준/i.test(
    servingText
  );
}

/** 낱개·개당 중량 등 (우선순위 2) */
function detectPieceBasisClear(servingText: string): boolean {
  return /(?:개|알|정|캡슐)\s*당|1\s*(?:개|알)\s*당|당\s*\d+\s*(?:개|알)|\d+\s*(?:개|알)\s*입/i.test(
    servingText
  );
}

/** 캔디·껌·목캔디·정제형 등 — 1통=1회 가정 금지 */
function isDiscreteCandyOrGumLike(
  foodCategory: string | null | undefined,
  productName: string | null | undefined,
  servingText: string
): boolean {
  const blob = `${productName ?? ''} ${servingText}`;
  if (
    /이클립스|쿨에어|더블민트|맥스무작|스카치|목캔디|목\s*캔디|츄\s*잉|츄잉껌|블루\s*껌|질소\s*캔디|드롭스|정제|알갱이|젤리빈|별\s*사탕/i.test(
      blob
    )
  ) {
    return true;
  }
  if (foodCategory === '달콤한 간식' && /껌|캔디|사탕|민트|목캔|알\s*사탕|정\b|드롭/i.test(blob)) {
    return true;
  }
  return false;
}

/** 총 내용량 g (우선순위 3). "3.4g×50" 형태면 합산 시도 */
function extractTotalContentGrams(servingText: string): number | null {
  const t = servingText;
  let best = 0;
  const m1 = t.match(/(?:총|전체)\s*내용량\s*[：:]?\s*(\d+(?:\.\d+)?)\s*g\b/i);
  if (m1) {
    const v = parseFloat(m1[1]);
    if (Number.isFinite(v) && v >= 1 && v <= 5000) best = Math.max(best, v);
  }
  const m2 = t.match(/내용량\s*(\d+(?:\.\d+)?)\s*g\b/i);
  if (m2) {
    const v = parseFloat(m2[1]);
    if (Number.isFinite(v) && v >= 5 && v <= 5000) best = Math.max(best, v);
  }
  const m3 = t.match(/(\d+(?:\.\d+)?)\s*g\s*[×x＊*]\s*(\d+)\s*(?:개|입|알)?/i);
  if (m3) {
    const a = parseFloat(m3[1]);
    const b = parseFloat(m3[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b >= 2 && a * b <= 5000) {
      best = Math.max(best, Math.round(a * b));
    }
  }
  return best > 0 ? best : null;
}

function perServingBasisIntakeLine(n: number, kind: IntakeSlotKind): string {
  const slot =
    kind === 'snack' ? '간식' : kind === 'meal' ? '한 끼·간편식' : '이 유형';
  return `맞춤 참고: 영양표 1회 분량을 기준으로 ${slot} 섭취량을 조절해 보세요.`;
}

function weightBasisIntakeLine(grams: number, totalGramsKnown: boolean, kind: IntakeSlotKind): string {
  const slot = kind === 'snack' ? '간식' : kind === 'meal' ? '한 끼·간편식' : '이 식품';
  const g = Math.min(500, Math.max(5, Math.round(grams)));
  const tail = totalGramsKnown ? ' 총량과 맞춰 보세요.' : '';
  return `맞춤 참고: ${g}g 안팎이면 ${slot} 열량 몫에 가깝습니다(이 표 기준).${tail}`;
}

/** 액체: 병·캔 **개수** 대신 ml 분량 기준으로만 서술 */
function liquidPortionIntakeLine(n: number, mlPerPortion: number, kind: IntakeSlotKind): string {
  const slot =
    kind === 'snack' ? '간식·음료' : kind === 'meal' ? '한 끼·간편식' : '이 유형';
  const ml = Math.round(mlPerPortion);
  return `맞춤 참고: ${ml}ml 기준으로 ${slot} 섭취량을 조절해 보세요(이 표 기준).`;
}

function conservativeWeightFallbackIntakeLine(_kind: IntakeSlotKind): string {
  return '맞춤 참고: 라벨의 1회 제공량이나 총 g를 보고 양을 잡아 주세요.';
}

/**
 * 포장 개수 안내 전 단위 검증. 실패 시 중량·보수 문구로 전환해야 함.
 */
function validateCountUnitForIntakeAdvice(
  unit: string | null,
  servingText: string,
  basisIsPerServing: boolean | null | undefined,
  candyLike: boolean
): { ok: boolean; usePerServingWording: boolean } {
  if (unit == null) return { ok: false, usePerServingWording: basisIsPerServing === true };
  if (PACKAGING_COUNT_UNITS.has(unit)) {
    if (candyLike) return { ok: false, usePerServingWording: false };
    if (basisIsPerServing === true && detectServingUnitClear(servingText)) {
      return { ok: false, usePerServingWording: true };
    }
    return { ok: false, usePerServingWording: false };
  }
  if (unit === '개') {
    if (!detectPieceBasisClear(servingText) && !detectServingUnitClear(servingText)) {
      return { ok: false, usePerServingWording: basisIsPerServing === true };
    }
  }
  return { ok: true, usePerServingWording: false };
}

/** 100g 기준 열량으로 하루 몫에 맞는 그램 수 */
function fallbackToWeightGrams(
  caloriesPer100g: number,
  budgetKcal: number,
  totalG: number | null
): number | null {
  if (!Number.isFinite(caloriesPer100g) || caloriesPer100g <= 0) return null;
  const raw = budgetKcal / (caloriesPer100g / 100);
  if (!Number.isFinite(raw) || raw < 3) return null;
  const capped = totalG != null ? Math.min(totalG, raw) : Math.min(350, raw);
  return Math.max(5, Math.floor(capped));
}

function lowKcalSolidLine(kind: IntakeSlotKind): string {
  if (kind === 'snack') {
    return '맞춤 참고: 열량은 낮아 보여요. 간식은 조금만.';
  }
  if (kind === 'meal') {
    return '맞춤 참고: 열량은 낮아 보여요. 한 번에만 많이 먹지 말아 주세요.';
  }
  return '맞춤 참고: 열량은 낮아 보여요. 다른 끼니와 나눠 드세요.';
}

/** 맞춤 안내에만 사용. API에서 넘길 때 선택. */
export interface PersonalizedIntakeNoteExtras {
  foodCategory?: string | null;
  /** 표기 1단위(1회·100ml당 등) 기준 당류 g, 있으면 문구에 반영 */
  sugarG?: number | null;
  /** 제품명(콜라 등) — foodCategory·라벨 문구만으로 음료 판별이 빗나갈 때 보조 */
  productName?: string | null;
}

function isBeverageForIntakeNote(
  foodCategory: string | null | undefined,
  servingAndProductHint: string
): boolean {
  if (foodCategory === '음료') return true;
  return /(?:탄산|콜라|사이다|에너지|스포츠\s*음료|제로\s*음료|이온|이온음료|펩시|코카|코카콜라|환타|스프라이트|스파클링|소다|음료)/i.test(
    servingAndProductHint
  );
}

function isLiquidRetailUnit(label: string | null | undefined): boolean {
  return label === '병' || label === '캔' || label === '팩' || label === '컵';
}

/** 100ml당 표에서 “열량 기준이 되는 ml”. 첫 번째 ml만 쓰면 500ml·총량이 잡혀 병 수가 터짐 */
function extractNutritionBasisMl(servingText: string): number | null {
  const t = servingText;
  if (!t) return null;
  let m = t.match(/(\d+(?:\.\d+)?)\s*ml\s*당/i);
  if (m) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  m = t.match(/당\s*[（(]?\s*(\d+(?:\.\d+)?)\s*ml/i);
  if (m) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  m = t.match(/중\s*(\d+(?:\.\d+)?)\s*ml/i);
  if (m) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v) && v > 0 && v <= 400) return v;
  }
  if (/\b100\s*ml\b/i.test(t) && /(?:당|기준|영양|1회)/i.test(t)) return 100;
  return null;
}

function firstMlInString(servingText: string): number | null {
  const m = servingText.match(/(\d+(?:\.\d+)?)\s*ml/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 라벨 문구에서 소비 단위(병·봉지 등) 추출 */
function retailUnitFromServing(t: string): string | null {
  if (t.includes('봉지')) return '봉지';
  if (t.includes('박스')) return '박스';
  if (t.includes('통')) return '통';
  if (t.includes('캔')) return '캔';
  if (t.includes('병')) return '병';
  if (t.includes('팩')) return '팩';
  if (t.includes('컵')) return '컵';
  if (t.includes('잔')) return '잔';
  if (/1\s*개|개입|\d+\s*개\b/.test(t)) return '개';
  return null;
}

function defaultDrinkUnit(servingText: string): string {
  const u = retailUnitFromServing(servingText);
  if (u === '캔' || u === '병' || u === '팩' || u === '컵') return u;
  if (servingText.includes('캔')) return '캔';
  if (servingText.includes('팩')) return '팩';
  return '병';
}

/** 1병(500ml)·총 500ml 등에서 ‘한 포’ 용량(ml) 추정 */
function extractPackageMl(servingText: string): number | null {
  const t = servingText;
  const m1 = t.match(/1\s*(?:병|캔|팩)\s*[\(（]?\s*(\d+(?:\.\d+)?)\s*ml/i);
  if (m1) {
    const v = parseFloat(m1[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const m2 = t.match(/(?:총|전체|내용량)\s*(\d+(?:\.\d+)?)\s*ml/i);
  if (m2) {
    const v = parseFloat(m2[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const all = Array.from(t.matchAll(/(\d+(?:\.\d+)?)\s*ml/gi), (x) => parseFloat(x[1])).filter((n) => Number.isFinite(n) && n > 0);
  if (all.length === 0) return null;
  return Math.max(...all);
}

/** 포장(통·봉지)은 반환하지 않음 — 호출부에서 중량·1회 기준으로 처리 */
function defaultSnackUnit(foodCategory: string | null | undefined, servingText: string): string | null {
  const u = retailUnitFromServing(servingText);
  if (u) {
    if (PACKAGING_COUNT_UNITS.has(u)) return null;
    return u;
  }
  if (foodCategory === '달콤한 간식' || foodCategory === '짭짤한 간식') return null;
  return '개';
}

export function buildPersonalizedIntakeNote(
  bmi: number | null,
  bmiCategory: string | null,
  caloriesKcal: number | null,
  servingSizeText?: string | null,
  basisIsPerServing?: boolean | null,
  extras?: PersonalizedIntakeNoteExtras | null,
  profileForKcal?: ProfileForKcalNote | null
): string | null {
  const normalizedServingSizeText = servingSizeText ? String(servingSizeText).trim() : '';
  const hintBlob = `${normalizedServingSizeText} ${extras?.productName ?? ''}`.trim();
  const beverage = isBeverageForIntakeNote(extras?.foodCategory ?? null, hintBlob);
  /** 분류가 빗나가도 제품명·라벨에 콜라류가 보이면 병 수 나눗셈 안내를 막음 */
  const sodaLikeHint =
    /(?:콜라|펩시|코카콜라|코카|사이다|스프라이트|환타|제로\s*콜라|무설탕\s*콜라)\b/i.test(
      hintBlob
    );
  const firstMl = normalizedServingSizeText ? firstMlInString(normalizedServingSizeText) : null;
  const nutritionBasisMl =
    basisIsPerServing === false ? extractNutritionBasisMl(normalizedServingSizeText) : null;
  const scaleMlForKcal =
    basisIsPerServing === false
      ? nutritionBasisMl ??
        (/\d+\s*ml/i.test(normalizedServingSizeText) && /당|기준|영양/.test(normalizedServingSizeText)
          ? 100
          : firstMl)
      : firstMl;

  if (caloriesKcal == null || !Number.isFinite(caloriesKcal)) {
    return '맞춤 참고: 열량을 못 읽어 숫자 안내는 생략했어요. 아래 영양 막대를 봐 주세요.';
  }

  const looksLikeSeasoningOrSauce =
    /(?:간장|된장|고추장|참기름|식초|쯔유|드레싱|양념|조미|소스\b)/i.test(normalizedServingSizeText);
  const mlLooksPer100Column =
    scaleMlForKcal != null && scaleMlForKcal >= 90 && scaleMlForKcal <= 110;
  const likelySweetDrinkPer100ml =
    !beverage &&
    !looksLikeSeasoningOrSauce &&
    basisIsPerServing === false &&
    mlLooksPer100Column &&
    caloriesKcal >= 12 &&
    caloriesKcal <= 55;

  const slotKind = intakeSlotKind(extras?.foodCategory, beverage, likelySweetDrinkPer100ml);

  const fromProfile =
    profileForKcal &&
    profileForKcal.heightCm > 0 &&
    profileForKcal.weightKg > 0
      ? estimateDailyKcalFromProfile(profileForKcal.heightCm, profileForKcal.weightKg, {
          birthYear: profileForKcal.birthYear ?? null,
          birthDate: profileForKcal.birthDate ?? null,
          gender: profileForKcal.gender ?? null,
        })
      : null;
  let target = fromProfile ?? roughDailyKcalTarget(bmi, bmiCategory);
  if (bmiCategory === '저체중') target = Math.min(target, 2000);
  if (target <= 0) return null;
  const budgetKcal = dailyKcalBudgetForThisFood(target, slotKind);

  // 0kcal·저열량(제로 음료 등): 열량은 유효하게 “0”으로 읽힌 경우. 나눗셈은 쓰지 않음.
  if (caloriesKcal >= 0 && caloriesKcal < 0.5) {
    if (beverage || likelySweetDrinkPer100ml) {
      return beverageIntakeLine();
    }
    const solidKind = slotKind === 'beverage' ? 'general' : slotKind;
    return lowKcalSolidLine(solidKind);
  }

  // 음료·100ml당 저열량 액체표 — 병·캔 **개수** 고정 안내 없음
  if (beverage || likelySweetDrinkPer100ml) {
    return beverageIntakeLine();
  }

  const servings = budgetKcal / caloriesKcal;
  const servingsRoundedDown = Math.max(1, Math.floor(servings));
  const unitLabel = retailUnitFromServing(normalizedServingSizeText);

  const capLiquidSugarDrink = beverage || sodaLikeHint;
  if (isLiquidRetailUnit(unitLabel) && servingsRoundedDown >= 3 && capLiquidSugarDrink) {
    return beverageIntakeLine();
  }

  const solidKindForLine: IntakeSlotKind =
    slotKind === 'beverage' ? 'general' : slotKind;

  const candyLike = isDiscreteCandyOrGumLike(
    extras?.foodCategory ?? null,
    extras?.productName ?? null,
    normalizedServingSizeText
  );
  const servingClear = detectServingUnitClear(normalizedServingSizeText);
  const pieceClear = detectPieceBasisClear(normalizedServingSizeText);

  // 캔디/껌/정제형: 1통=1회 금지 → 중량 또는 1회 제공량 문구만
  if (candyLike && !servingClear && !pieceClear) {
    if (basisIsPerServing === false && caloriesKcal > 0) {
      const totalG = extractTotalContentGrams(normalizedServingSizeText);
      const gW = fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG);
      if (gW != null) {
        return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
      }
    }
    if (basisIsPerServing === true) {
      return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
    }
    return conservativeWeightFallbackIntakeLine(solidKindForLine);
  }

  // 통·봉지·박스만 보이고 1회 제공이 불명확 — 포장 개수 안내 금지
  if (
    unitLabel &&
    PACKAGING_COUNT_UNITS.has(unitLabel) &&
    !servingClear &&
    !candyLike
  ) {
    if (basisIsPerServing === false && caloriesKcal > 0) {
      const totalG = extractTotalContentGrams(normalizedServingSizeText);
      const gW = fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG);
      if (gW != null) {
        return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
      }
    }
    if (basisIsPerServing === true) {
      return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
    }
    return conservativeWeightFallbackIntakeLine(solidKindForLine);
  }

  // 100g/ml당 표기: ml은 **병·캔 개수**가 아니라 ml 분량으로 안내
  if (basisIsPerServing === false || (unitLabel == null && scaleMlForKcal != null)) {
    if (scaleMlForKcal != null && scaleMlForKcal > 0) {
      const packMl = extractPackageMl(normalizedServingSizeText);
      const refMl =
        packMl != null && packMl >= scaleMlForKcal
          ? packMl
          : scaleMlForKcal >= 90 && scaleMlForKcal <= 110
            ? 500
            : scaleMlForKcal;
      const kcalPerPack = caloriesKcal * (refMl / scaleMlForKcal);
      if (Number.isFinite(kcalPerPack) && kcalPerPack > 0) {
        const nRaw = Math.floor(budgetKcal / kcalPerPack);
        const n = Math.min(30, Math.max(1, nRaw));
        const uGuess =
          unitLabel ??
          (scaleMlForKcal >= 90 && scaleMlForKcal <= 110
            ? defaultDrinkUnit(normalizedServingSizeText)
            : defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText));
        if (isLiquidRetailUnit(uGuess) && n >= 3 && capLiquidSugarDrink) {
          return beverageIntakeLine();
        }
        if (isLiquidRetailUnit(uGuess) && refMl > 0) {
          return liquidPortionIntakeLine(n, refMl, solidKindForLine);
        }
        if (uGuess && PACKAGING_COUNT_UNITS.has(uGuess)) {
          const totalG = extractTotalContentGrams(normalizedServingSizeText);
          const gW = fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG);
          if (gW != null) {
            return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
          }
          return conservativeWeightFallbackIntakeLine(solidKindForLine);
        }
        if (uGuess) {
          const val = validateCountUnitForIntakeAdvice(
            uGuess,
            normalizedServingSizeText,
            basisIsPerServing,
            candyLike
          );
          if (val.usePerServingWording) {
            return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
          }
          if (!val.ok) {
            const totalG = extractTotalContentGrams(normalizedServingSizeText);
            const gW = fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG);
            if (gW != null) {
              return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
            }
            return conservativeWeightFallbackIntakeLine(solidKindForLine);
          }
          return solidIntakeLine(n, uGuess, solidKindForLine);
        }
        return liquidPortionIntakeLine(n, refMl, solidKindForLine);
      }
    }
    const u =
      unitLabel ??
      (basisIsPerServing === false && scaleMlForKcal == null
        ? '회'
        : defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText));
    if (u == null) {
      if (basisIsPerServing === true) {
        return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
      }
      const totalG = extractTotalContentGrams(normalizedServingSizeText);
      const gW =
        basisIsPerServing === false && caloriesKcal > 0
          ? fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG)
          : null;
      if (gW != null) {
        return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
      }
      return conservativeWeightFallbackIntakeLine(solidKindForLine);
    }
    const val = validateCountUnitForIntakeAdvice(
      u,
      normalizedServingSizeText,
      basisIsPerServing,
      candyLike
    );
    if (val.usePerServingWording) {
      return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
    }
    if (!val.ok) {
      const totalG = extractTotalContentGrams(normalizedServingSizeText);
      const gW = fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG);
      if (gW != null) {
        return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
      }
      return conservativeWeightFallbackIntakeLine(solidKindForLine);
    }
    return solidIntakeLine(servingsRoundedDown, u, solidKindForLine);
  }

  if (unitLabel) {
    const val = validateCountUnitForIntakeAdvice(
      unitLabel,
      normalizedServingSizeText,
      basisIsPerServing,
      candyLike
    );
    if (val.usePerServingWording) {
      return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
    }
    if (!val.ok) {
      const totalG = extractTotalContentGrams(normalizedServingSizeText);
      const gW = fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG);
      if (gW != null) {
        return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
      }
      return conservativeWeightFallbackIntakeLine(solidKindForLine);
    }
    return solidIntakeLine(servingsRoundedDown, unitLabel, solidKindForLine);
  }

  const fallbackU = defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText);
  if (fallbackU == null) {
    if (basisIsPerServing === true) {
      return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
    }
    return conservativeWeightFallbackIntakeLine(solidKindForLine);
  }
  const val = validateCountUnitForIntakeAdvice(
    fallbackU,
    normalizedServingSizeText,
    basisIsPerServing,
    candyLike
  );
  if (val.usePerServingWording) {
    return perServingBasisIntakeLine(servingsRoundedDown, solidKindForLine);
  }
  if (!val.ok) {
    const totalG = extractTotalContentGrams(normalizedServingSizeText);
    const gW = fallbackToWeightGrams(caloriesKcal, budgetKcal, totalG);
    if (gW != null) {
      return weightBasisIntakeLine(gW, totalG != null, solidKindForLine);
    }
    return conservativeWeightFallbackIntakeLine(solidKindForLine);
  }
  return solidIntakeLine(servingsRoundedDown, fallbackU, solidKindForLine);
}

export function computeBmiServer(heightCm: number, weightKg: number): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function bmiCategoryKo(bmi: number): string {
  if (bmi < 18.5) return '저체중';
  if (bmi <= 22.9) return '정상';
  if (bmi <= 24.9) return '과체중';
  return '비만';
}
