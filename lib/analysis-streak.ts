
export interface AnalysisStreak {
  lastStreakDate: string;
  current: number;
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

export function advanceStreakAfterAnalysis(prev: AnalysisStreak, now: Date): AnalysisStreak {
  const raw = normalizeAnalysisStreak(prev);
  const today = toLocalYmd(now);
  const y = new Date(now.getTime());
  y.setDate(y.getDate() - 1);
  const yesterday = toLocalYmd(y);

  let nextCurrent = raw.current;
  if (raw.lastStreakDate === today) {
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
