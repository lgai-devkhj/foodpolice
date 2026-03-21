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
  dailyPct: NutritionDailyPercent | null,
  caloriesKcal: number | null
): string | null {
  if (!dailyPct && (caloriesKcal == null || !Number.isFinite(caloriesKcal))) return null;
  const target = roughDailyKcalTarget(bmi, bmiCategory);
  const parts: string[] = [];
  parts.push(
    `일반적인 영양성분 표 기준(약 ${DAILY_REFERENCE.caloriesKcal}kcal·나트륨 ${DAILY_REFERENCE.sodiumMg}mg 등)으로 볼 때, 표에 나온 **1회(또는 표기 기준) 분량**이 하루 권장 치에 차지하는 비율을 위에 %로 보여 드렸어요.`
  );
  if (caloriesKcal != null && Number.isFinite(caloriesKcal) && target > 0) {
    const one = Math.round((caloriesKcal / target) * 1000) / 10;
    if (bmiCategory && bmi != null) {
      parts.push(
        `현재 BMI는 약 ${bmi.toFixed(1)}(${bmiCategory})이므로, **참고용**으로 하루 열량을 대략 ${target}kcal 전후로 가정했을 때 이 분량의 열량은 그중 약 ${one}%에 해당한다고 볼 수 있어요(개인 활동량·성장기 등에 따라 실제 필요량은 달라집니다).`
      );
    } else {
      parts.push(
        `키·몸무게 정보가 없어 BMI 맞춤은 생략했어요. 대략 ${DAILY_REFERENCE.caloriesKcal}kcal 기준으로 보면 이 분량의 열량은 약 ${Math.round((caloriesKcal / DAILY_REFERENCE.caloriesKcal) * 1000) / 10}% 수준이에요.`
      );
    }
  } else if (bmiCategory && bmi != null) {
    parts.push(
      `BMI는 약 ${bmi.toFixed(1)}(${bmiCategory})예요. 가공 식품·나트륨·당류가 많은 편이면 전체 식단에서 조절하는 것이 좋아요.`
    );
  }
  parts.push('정확한 섭취량은 영양사·의사와 상담하세요.');
  return parts.join(' ');
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
