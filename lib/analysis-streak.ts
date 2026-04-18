/**
 * 로컬 달력 기준 연속 분석 일수(듀오링고 스트릭과 유사).
 * 하루에 첫 분석 성공 시에만 일수가 오르고, 같은 날 여러 번은 카운트하지 않음.
 */

export interface AnalysisStreak {
  /** 마지막으로 스트릭이 갱신된 로컬 날짜 YYYY-MM-DD */
  lastStreakDate: string;
  /** 저장된 연속 일수(끊긴 뒤에도 DB에는 남을 수 있음 — 표시는 getEffectiveAnalysisStreak 사용) */
  current: number;
  /** 역대 최장 연속 */
  longest: number;
}

export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function emptyAnalysisStreak(): AnalysisStreak {
  return { current: 0, longest: 0, lastStreakDate: '' };
}

export function normalizeAnalysisStreak(s: unknown): AnalysisStreak {
  if (s == null || typeof s !== 'object') return emptyAnalysisStreak();
  const raw = s as Partial<AnalysisStreak>;
  const last =
    typeof raw.lastStreakDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastStreakDate)
      ? raw.lastStreakDate
      : '';
  let current =
    typeof raw.current === 'number' && Number.isFinite(raw.current) && raw.current >= 0
      ? Math.floor(raw.current)
      : 0;
  let longest =
    typeof raw.longest === 'number' && Number.isFinite(raw.longest) && raw.longest >= 0
      ? Math.floor(raw.longest)
      : 0;
  if (!last && current > 0) current = 0;
  longest = Math.max(longest, current);
  return { lastStreakDate: last, current, longest };
}

/** 오늘·어제 안에 활동이 있으면 current를 표시, 그렇지 않으면 끊긴 것으로 0 */
export function getEffectiveAnalysisStreak(streak: AnalysisStreak): {
  displayCurrent: number;
  longest: number;
} {
  const s = normalizeAnalysisStreak(streak);
  const today = toLocalYmd(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = toLocalYmd(y);
  const last = s.lastStreakDate;
  if (!last) return { displayCurrent: 0, longest: s.longest };
  if (last === today || last === yesterday) {
    return { displayCurrent: s.current, longest: s.longest };
  }
  return { displayCurrent: 0, longest: s.longest };
}

/**
 * 분석 1건이 기록될 때 호출. 같은 로컬 날에 두 번째 분석이면 일수는 그대로.
 */
export function advanceStreakAfterAnalysis(prev: AnalysisStreak, now: Date): AnalysisStreak {
  const raw = normalizeAnalysisStreak(prev);
  const today = toLocalYmd(now);
  const y = new Date(now.getTime());
  y.setDate(y.getDate() - 1);
  const yesterday = toLocalYmd(y);

  let nextCurrent = raw.current;
  if (raw.lastStreakDate === today) {
    /* 이미 오늘 반영됨 */
  } else if (raw.lastStreakDate === yesterday) {
    nextCurrent = raw.current + 1;
  } else if (!raw.lastStreakDate) {
    nextCurrent = 1;
  } else {
    nextCurrent = 1;
  }

  const nextLongest = Math.max(raw.longest, nextCurrent);
  return {
    lastStreakDate: today,
    current: nextCurrent,
    longest: nextLongest,
  };
}
