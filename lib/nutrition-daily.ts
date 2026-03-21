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

export function buildPersonalizedIntakeNote(
  bmi: number | null,
  bmiCategory: string | null,
  caloriesKcal: number | null,
  servingSizeText?: string | null,
  basisIsPerServing?: boolean | null
): string | null {
  const target = roughDailyKcalTarget(bmi, bmiCategory);
  if (target <= 0) return null;

  if (caloriesKcal == null || !Number.isFinite(caloriesKcal)) {
    if (servingSizeText && String(servingSizeText).trim()) {
      return `일일 권장 섭취량(참고): 영양성분 표의 열량(kcal)을 읽지 못해서 계산을 생략했어요. ${servingSizeText} 기준으로 다시 열량이 보이게 촬영해 주세요.`;
    }
    return `일일 권장 섭취량(참고): 영양성분 표의 열량(kcal) 판독이 어려워 계산을 생략했어요. 열량이 보이게 다시 찍어주세요.`;
  }

  // 0kcal·저열량(제로 음료 등): 열량은 유효하게 “0”으로 읽힌 경우. 나눗셈(목표kcal/열량)은 쓰지 않음.
  if (caloriesKcal >= 0 && caloriesKcal < 0.5) {
    const bmiPart0 =
      bmi != null && bmiCategory
        ? `현재 BMI는 약 ${bmi.toFixed(1)}(${bmiCategory})이라서, 참고용 하루 열량 목표를 ${target}kcal로 가정했어요.`
        : `참고용 하루 열량 목표를 ${target}kcal로 가정했어요.`;
    return `일일 권장 섭취량(참고): 표에 나온 이 분량은 **0kcal**(또는 거의 0kcal)로 읽혔어요. 하루 참고 열량(${target}kcal 가정) 기준으로는 **열량 부담이 거의 없는 편**이에요. 다만 나트륨·당류 등은 같은 표의 다른 수치를 함께 보세요. ${bmiPart0} 개인 활동량·전체 식단에 따라 달라질 수 있어요.`;
  }

  const servings = target / caloriesKcal; // “표의 기준 1개(또는 100ml 등)”를 하루에 몇 번 먹을 수 있는지(참고)
  const servingsRoundedDown = Math.max(1, Math.floor(servings));

  const normalizedServingSizeText = servingSizeText ? String(servingSizeText).trim() : '';
  const unitLabel = (() => {
    const t = normalizedServingSizeText;
    if (!t) return null;
    // 병/캔/팩 등 형태가 포함되면 그대로 사용
    if (t.includes('병')) return '병';
    if (t.includes('캔')) return '캔';
    if (t.includes('팩')) return '팩';
    if (t.includes('컵')) return '컵';
    if (t.includes('잔')) return '잔';
    return null;
  })();

  const volumeMl = (() => {
    const t = normalizedServingSizeText;
    if (!t) return null;
    // 예: "1병(355ml)", "500ml 중 100ml", "100ml당"
    const m = t.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return Number.isFinite(v) ? v : null;
  })();

  const bmiPart =
    bmi != null && bmiCategory
      ? `현재 BMI는 약 ${bmi.toFixed(1)}(${bmiCategory})이라서, 참고용 하루 열량 목표를 ${target}kcal로 가정했어요.`
      : `참고용 하루 열량 목표를 ${target}kcal로 가정했어요.`;

  // “하루 권장 섭취량: 2병 이내”처럼 용량/개수 중심으로 보여줘요.
  if (basisIsPerServing === false || (unitLabel == null && volumeMl != null)) {
    if (volumeMl != null) {
      const dailyMl = Math.round(servingsRoundedDown * volumeMl);
      const mlPart = dailyMl >= 1000 ? `${Math.round(dailyMl / 10) / 100}L` : `${dailyMl}ml`;
      return `일일 권장 섭취량(참고): 약 ${mlPart} 이내로 섭취하는 수준을 참고할 수 있어요. ${bmiPart} 개인 활동량·성장기·전체 식단에 따라 달라질 수 있어요.`;
    }
    return `일일 권장 섭취량(참고): 하루에 약 ${servingsRoundedDown}회 이내를 참고할 수 있어요. ${bmiPart} 개인 활동량·성장기·전체 식단에 따라 달라질 수 있어요.`;
  }

  if (unitLabel) {
    return `일일 권장 섭취량(참고): ${servingsRoundedDown}${unitLabel} 이내를 참고할 수 있어요. ${bmiPart} 개인 활동량·성장기·전체 식단에 따라 달라질 수 있어요.`;
  }

  return `일일 권장 섭취량(참고): 하루에 약 ${servingsRoundedDown}회 이내를 참고할 수 있어요. ${bmiPart} 개인 활동량·성장기·전체 식단에 따라 달라질 수 있어요.`;
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
