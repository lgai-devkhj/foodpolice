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

/** 맞춤 참고 아래 짧은 설명(키·몸무게 기반일 때만 API에서 채움) */
export const PERSONALIZED_INTAKE_FOOTNOTE =
  '위 양 안내는 키·몸무게 등으로 잡은 하루 열량 참고와 간식·한 끼 구분을 반영한 추정이에요. 사람마다 달라요.';
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

/** 열량(양) 안내 뒤에 붙이는 한 마디 — kcal만 따지는 느낌 완화 */
function wholeDietReminder(): string {
  return ' 열량·양 말고도 나트륨·당류·지방은 아래 영양 정보에서 함께 보면 좋아요.';
}

function beverageIntakeLine(drinkUnit: string): string {
  return `맞춤 참고: 달고 가진 음료는 하루 2${drinkUnit} 이내로 줄이는 편이 좋아요.${wholeDietReminder()}`;
}

function solidIntakeLine(n: number, unit: string, kind: IntakeSlotKind): string {
  const q = `${n}${unit}`;
  if (kind === 'snack') {
    return `맞춤 참고: 간식으로는 하루 ${q} 이내를 참고해 보세요.${wholeDietReminder()}`;
  }
  if (kind === 'meal') {
    return `맞춤 참고: 한 끼·간편식으로는 하루 ${q} 이내를 참고해 보세요.${wholeDietReminder()}`;
  }
  return `맞춤 참고: 하루 ${q} 이내를 참고해 보세요.${wholeDietReminder()}`;
}

function lowKcalSolidLine(kind: IntakeSlotKind): string {
  const tail = wholeDietReminder();
  if (kind === 'snack') {
    return `맞춤 참고: 표상 열량 부담은 낮아 보여요. 간식은 가끔·적게 맞춰 보세요.${tail}`;
  }
  if (kind === 'meal') {
    return `맞춤 참고: 표상 열량 부담은 낮아 보여요. 한 끼로만 몰아먹지 않도록 나눠 보세요.${tail}`;
  }
  return `맞춤 참고: 표상 열량 부담은 낮아 보여요. 하루 식단 전체와 나눠 맞춰 보세요.${tail}`;
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
    return '맞춤 참고: 열량 숫자는 잘 안 읽혀 양 안내는 줄였어요. 나트륨·당류 등은 아래 영양 정보를 봐 주세요.';
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
      return beverageIntakeLine(defaultDrinkUnit(normalizedServingSizeText));
    }
    const solidKind = slotKind === 'beverage' ? 'general' : slotKind;
    return lowKcalSolidLine(solidKind);
  }

  // 음료·100ml당 저열량 액체표: ml 나눗셈은 비현실적이라 병·캔 단위 안내
  if (beverage || likelySweetDrinkPer100ml) {
    const du = defaultDrinkUnit(normalizedServingSizeText);
    return beverageIntakeLine(du);
  }

  const servings = budgetKcal / caloriesKcal;
  const servingsRoundedDown = Math.max(1, Math.floor(servings));
  const unitLabel = retailUnitFromServing(normalizedServingSizeText);

  const capLiquidSugarDrink = beverage || sodaLikeHint;
  if (isLiquidRetailUnit(unitLabel) && servingsRoundedDown >= 3 && capLiquidSugarDrink) {
    const du = unitLabel || defaultDrinkUnit(normalizedServingSizeText);
    return beverageIntakeLine(du);
  }

  const solidKindForLine: IntakeSlotKind =
    slotKind === 'beverage' ? 'general' : slotKind;

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
          return beverageIntakeLine(u);
        }
        return solidIntakeLine(n, u, solidKindForLine);
      }
    }
    const u =
      unitLabel ??
      (basisIsPerServing === false && scaleMlForKcal == null
        ? '회'
        : defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText));
    return solidIntakeLine(servingsRoundedDown, u, solidKindForLine);
  }

  if (unitLabel) {
    return solidIntakeLine(servingsRoundedDown, unitLabel, solidKindForLine);
  }

  const fallbackU = defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText);
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
