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

/** 대략적 하루 열량 참고(맞춤 안내 문장용, 의학적 권고 아님) */
function roughDailyKcalTarget(bmi: number | null, category: string | null): number {
  if (bmi == null || !category) return DAILY_REFERENCE.caloriesKcal;
  if (category === '비만') return 1800;
  if (category === '과체중') return 1900;
  if (category === '저체중') return 2100;
  return DAILY_REFERENCE.caloriesKcal;
}

/** 맞춤 안내에만 사용. API에서 넘길 때 선택. */
export interface PersonalizedIntakeNoteExtras {
  foodCategory?: string | null;
  /** 표기 1단위(1회·100ml당 등) 기준 당류 g, 있으면 문구에 반영 */
  sugarG?: number | null;
}

function isBeverageForIntakeNote(foodCategory: string | null | undefined, servingHint: string): boolean {
  if (foodCategory === '음료') return true;
  return /(?:탄산|콜라|사이다|에너지|스포츠\s*음료|제로\s*음료|이온|이온음료)/i.test(servingHint);
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
  extras?: PersonalizedIntakeNoteExtras | null
): string | null {
  const target = roughDailyKcalTarget(bmi, bmiCategory);
  if (target <= 0) return null;

  const normalizedServingSizeText = servingSizeText ? String(servingSizeText).trim() : '';
  const beverage = isBeverageForIntakeNote(extras?.foodCategory ?? null, normalizedServingSizeText);
  const volumeMl = (() => {
    const t = normalizedServingSizeText;
    if (!t) return null;
    const m = t.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return Number.isFinite(v) ? v : null;
  })();

  const bmiPart =
    bmi != null && bmiCategory
      ? `현재 BMI는 약 ${bmi.toFixed(1)}(${bmiCategory})이라서, 참고용 하루 열량 목표를 ${target}kcal로 가정했어요.`
      : `참고용 하루 열량 목표를 ${target}kcal로 가정했어요.`;

  if (caloriesKcal == null || !Number.isFinite(caloriesKcal)) {
    if (normalizedServingSizeText) {
      return `일일 권장 섭취량(참고): 영양성분 표의 열량(kcal)을 읽지 못해서 계산을 생략했어요. ${normalizedServingSizeText} 기준으로 다시 열량이 보이게 촬영해 주세요.`;
    }
    return `일일 권장 섭취량(참고): 영양성분 표의 열량(kcal) 판독이 어려워 계산을 생략했어요. 열량이 보이게 다시 찍어주세요.`;
  }

  // 0kcal·저열량(제로 음료 등): 열량은 유효하게 “0”으로 읽힌 경우. 나눗셈(목표kcal/열량)은 쓰지 않음.
  if (caloriesKcal >= 0 && caloriesKcal < 0.5) {
    const bevExtra = beverage
      ? ` 참고로 **하루 2${defaultDrinkUnit(normalizedServingSizeText)} 이내**·물과 번갈아 마시는 정도만 생각해 보세요. **열량이 거의 없어도** 카페인·나트륨·감미료 등은 과하면 부담이 될 수 있어요.`
      : '';
    return `일일 권장 섭취량(참고): 표에 나온 이 분량은 **0kcal**(또는 거의 0kcal)로 읽혔어요. 하루 참고 열량(${target}kcal 가정) 기준으로는 **열량 부담이 거의 없는 편**이에요.${bevExtra} 나트륨·당류 등은 같은 표의 다른 수치를 함께 보세요. ${bmiPart} 개인 활동량·전체 식단에 따라 달라질 수 있어요.`;
  }

  // 음료·100ml당 저열량 액체표: 목표kcal÷(100ml당 kcal)×100ml → 수 리터까지 나와 비현실적
  const looksLikeSeasoningOrSauce =
    /(?:간장|된장|고추장|참기름|식초|쯔유|드레싱|양념|조미|소스\b)/i.test(normalizedServingSizeText);
  const likelySweetDrinkPer100ml =
    !beverage &&
    !looksLikeSeasoningOrSauce &&
    basisIsPerServing === false &&
    volumeMl != null &&
    volumeMl >= 90 &&
    volumeMl <= 110 &&
    caloriesKcal >= 12 &&
    caloriesKcal <= 55;

  if (beverage || likelySweetDrinkPer100ml) {
    const du = defaultDrinkUnit(normalizedServingSizeText);
    const sg = extras?.sugarG;
    const sugarLine =
      sg != null && Number.isFinite(sg) && sg > 0
        ? ` 표에 나온 **당류(${Number(sg)}g)**·**나트륨**·(해당 시) **카페인**을 꼭 함께 보세요.`
        : ' 표의 **당류·나트륨**·(해당 시) **카페인**을 꼭 함께 보세요.';
    return `일일 권장 섭취량(참고): 탄산·가당 음료는 **열량만**으로 나누면 수 리터까지 나올 수 있어, **당·나트륨·카페인**을 표에서 꼭 확인하세요.${sugarLine} 참고로 **하루 2${du} 이내**·물과 번갈아 마시는 정도만 생각해 보세요. ${bmiPart} 개인 건강·전체 식단에 따라 달라질 수 있어요.`;
  }

  const servings = target / caloriesKcal; // “표의 기준 1개(또는 100ml 등)”를 하루에 몇 번 먹을 수 있는지(참고)
  const servingsRoundedDown = Math.max(1, Math.floor(servings));
  const unitLabel = retailUnitFromServing(normalizedServingSizeText);

  // 100g/ml당 표기: ml 리터로 쓰지 않고, 포장 1개 분량으로 환산해 **N병·N봉지** 형태
  if (basisIsPerServing === false || (unitLabel == null && volumeMl != null)) {
    if (volumeMl != null && volumeMl > 0) {
      const packMl = extractPackageMl(normalizedServingSizeText);
      const refMl =
        packMl != null && packMl >= volumeMl ? packMl : volumeMl >= 90 && volumeMl <= 110 ? 500 : volumeMl;
      const kcalPerPack = caloriesKcal * (refMl / volumeMl);
      if (Number.isFinite(kcalPerPack) && kcalPerPack > 0) {
        const nRaw = Math.floor(target / kcalPerPack);
        const n = Math.min(30, Math.max(1, nRaw));
        const u =
          unitLabel ?? (volumeMl >= 90 && volumeMl <= 110 ? defaultDrinkUnit(normalizedServingSizeText) : defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText));
        return `일일 권장 섭취량(참고): 참고용 하루 열량(${target}kcal 가정)으로 보면 **약 ${n}${u} 이내** 수준을 참고할 수 있어요. ${bmiPart} 전체 식단·개인차가 크므로 절대적인 기준은 아니에요.`;
      }
    }
    const u =
      unitLabel ??
      (basisIsPerServing === false && volumeMl == null
        ? '회'
        : defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText));
    return `일일 권장 섭취량(참고): 참고용 하루 열량(${target}kcal 가정)으로 보면 **약 ${servingsRoundedDown}${u} 이내**를 참고할 수 있어요. ${bmiPart} 개인 활동량·성장기·전체 식단에 따라 달라질 수 있어요.`;
  }

  if (unitLabel) {
    return `일일 권장 섭취량(참고): **약 ${servingsRoundedDown}${unitLabel} 이내**를 참고할 수 있어요. ${bmiPart} 개인 활동량·성장기·전체 식단에 따라 달라질 수 있어요.`;
  }

  const fallbackU = defaultSnackUnit(extras?.foodCategory ?? null, normalizedServingSizeText);
  return `일일 권장 섭취량(참고): **약 ${servingsRoundedDown}${fallbackU} 이내**(표기 1단위 기준)를 참고할 수 있어요. ${bmiPart} 개인 활동량·성장기·전체 식단에 따라 달라질 수 있어요.`;
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
