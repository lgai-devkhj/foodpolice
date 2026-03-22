/**
 * 2000kcal 기준 일일 영양소 참고치(한국 영양성분 표의 % 계산에 흔히 쓰이는 값에 근사).
 * 실제 필요 에너지는 개인차가 크므로 참고용 문구에만 사용합니다.
 */
export const DAILY_REFERENCE = {
  caloriesKcal: 2000,
  sodiumMg: 2000,
  carbsG: 324,
  sugarG: 100,
  proteinG: 55,
  fatG: 54,
  saturatedFatG: 15,
  transFatG: 2.2,
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
  /** 예: "1회 30g", "100ml당" */
  servingSizeText?: string | null;
  /** 표 숫자가 1회 제공량 기준이면 true, 100g·100ml 기준이면 false */
  basisIsPerServing?: boolean;
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
  return Object.keys(out).length > 0 ? out : null;
}

/** 맞춤 열량 안내 아래 붙이는 짧은 설명(키·몸무게 기반 추정일 때만 API에서 채움) */
export const PERSONALIZED_INTAKE_KCAL_FOOTNOTE =
  '기초대사량에 보통 활동을 반영해 하루 필요 열량을 추정한 참고값이에요.';

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

/**
 * Mifflin–St Jeor BMR × 활동계수(1.45, 보통). 나이·성별 없으면 보수적 기본값 사용.
 * 의료·영양 상담 대체 아님.
 */
export function estimateDailyKcalFromProfile(
  heightCm: number,
  weightKg: number,
  opts?: { gender?: string | null; birthDate?: string | null }
): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const fromBirth = opts?.birthDate ? ageYearsFromBirthDate(opts.birthDate) : null;
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
  birthDate?: string | null;
  gender?: string | null;
}

/** 대략적 하루 열량 참고(맞춤 안내 문장용, 의학적 권고 아님) */
function roughDailyKcalTarget(bmi: number | null, category: string | null): number {
  if (bmi == null || !category) return DAILY_REFERENCE.caloriesKcal;
  if (category === '비만') return 1800;
  if (category === '과체중') return 1900;
  if (category === '저체중') return 2100;
  return DAILY_REFERENCE.caloriesKcal;
}

/** 하루 총열량 중 이 식품에 배정할 참고 열량(다른 식사/간식도 먹는 현실 반영) */
function dailyKcalBudgetForThisFood(target: number): number {
  const quarter = Math.round((target * 0.25) / 50) * 50;
  return Math.max(300, quarter);
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

function beverageIntakeParagraph(
  drinkUnit: string,
  target: number,
  budgetKcal: number
): string {
  return `일일 권장 섭취량: 하루 2${drinkUnit} 이내(${target}kcal 기준, 전체 식단 고려 ${budgetKcal}kcal 배정)`;
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

function defaultSnackUnit(foodCategory: string | null | undefined, servingText: string): string {
  const u = retailUnitFromServing(servingText);
  if (u) return u;
  if (foodCategory === '달콤한 간식' || foodCategory === '짭짤한 간식') return '봉지';
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
  const fromProfile =
    profileForKcal &&
    profileForKcal.heightCm > 0 &&
    profileForKcal.weightKg > 0
      ? estimateDailyKcalFromProfile(profileForKcal.heightCm, profileForKcal.weightKg, {
          birthDate: profileForKcal.birthDate ?? null,
          gender: profileForKcal.gender ?? null,
        })
      : null;
  const target = fromProfile ?? roughDailyKcalTarget(bmi, bmiCategory);
  if (target <= 0) return null;
  const budgetKcal = dailyKcalBudgetForThisFood(target);

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
    return '일일 권장 섭취량: 열량 판독이 어려워 계산을 생략했어요';
  }

  // 0kcal·저열량(제로 음료 등): 열량은 유효하게 “0”으로 읽힌 경우. 나눗셈(목표kcal/열량)은 쓰지 않음.
  if (caloriesKcal >= 0 && caloriesKcal < 0.5) {
    if (beverage) return beverageIntakeParagraph(defaultDrinkUnit(normalizedServingSizeText), target, budgetKcal);
    return `일일 권장 섭취량: 열량 부담이 낮아요(${target}kcal 기준, 전체 식단 고려)`;
  }

  // 음료·100ml당 저열량 액체표: 목표kcal÷(100ml당 kcal)×100ml → 수 리터까지 나와 비현실적
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

  if (beverage || likelySweetDrinkPer100ml) {
    const du = defaultDrinkUnit(normalizedServingSizeText);
    return beverageIntakeParagraph(du, target, budgetKcal);
  }

  const servings = budgetKcal / caloriesKcal; // 하루 총열량이 아니라 "이 식품 몫"으로 계산
  const servingsRoundedDown = Math.max(1, Math.floor(servings));
  const unitLabel = retailUnitFromServing(normalizedServingSizeText);

  const capLiquidSugarDrink = beverage || sodaLikeHint;
  if (isLiquidRetailUnit(unitLabel) && servingsRoundedDown >= 3 && capLiquidSugarDrink) {
    const du = unitLabel || defaultDrinkUnit(normalizedServingSizeText);
    return beverageIntakeParagraph(du, target, budgetKcal);
  }

  // 100g/ml당 표기: ml 리터로 쓰지 않고, 포장 1개 분량으로 환산해 **N병·N봉지** 형태
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
        const u =
          unitLabel ??
          (scaleMlForKcal >= 90 && scaleMlForKcal <= 110
            ? defaultDrinkUnit(normalizedServingSizeText)
            : defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText));
        if (isLiquidRetailUnit(u) && n >= 3 && capLiquidSugarDrink) {
          return beverageIntakeParagraph(u, target, budgetKcal);
        }
        return `일일 권장 섭취량: 하루 ${n}${u} 이내(${target}kcal 기준, 전체 식단 고려 ${budgetKcal}kcal 배정)`;
      }
    }
    const u =
      unitLabel ??
      (basisIsPerServing === false && scaleMlForKcal == null
        ? '회'
        : defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText));
    return `일일 권장 섭취량: 하루 ${servingsRoundedDown}${u} 이내(${target}kcal 기준, 전체 식단 고려 ${budgetKcal}kcal 배정)`;
  }

  if (unitLabel) {
    return `일일 권장 섭취량: 하루 ${servingsRoundedDown}${unitLabel} 이내(${target}kcal 기준, 전체 식단 고려 ${budgetKcal}kcal 배정)`;
  }

  const fallbackU = defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText);
  return `일일 권장 섭취량: 하루 ${servingsRoundedDown}${fallbackU} 이내(${target}kcal 기준, 전체 식단 고려 ${budgetKcal}kcal 배정)`;
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
