/**
 * 일일 OX 퀴즈 — `/api/quiz`가 Gemini로 문항을 생성한다.
 */

export type DailyOxQuizPayload = {
  questionType: 1 | 2 | 3;
  question: string;
  correctAnswer: 'O' | 'X';
  explanation: string;
  foodKeyword: string;
};

/** 오늘 퀴즈 완료 후 저장 — 다시 열었을 때 동일 문항·선택 표시 */
export type DailyOxQuizSolvedStored = DailyOxQuizPayload & {
  dateYmd: string;
  userPick: 'O' | 'X';
};

export function parseDailyOxQuizSolvedStored(raw: unknown): DailyOxQuizSolvedStored | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const dateYmd = typeof o.dateYmd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.dateYmd) ? o.dateYmd : '';
  if (!dateYmd) return null;
  const qt = Number(o.questionType);
  const questionType = qt === 1 || qt === 2 || qt === 3 ? (qt as 1 | 2 | 3) : null;
  const question = typeof o.question === 'string' ? o.question.trim() : '';
  const ca = String(o.correctAnswer ?? '')
    .trim()
    .toUpperCase();
  const correctAnswer: 'O' | 'X' = ca === 'X' ? 'X' : 'O';
  const up = String(o.userPick ?? '')
    .trim()
    .toUpperCase();
  const userPick: 'O' | 'X' = up === 'X' ? 'X' : 'O';
  const explanation = typeof o.explanation === 'string' ? o.explanation : '';
  const foodKeyword = typeof o.foodKeyword === 'string' ? o.foodKeyword : '';
  if (!questionType || !question) return null;
  return {
    dateYmd,
    questionType,
    question,
    correctAnswer,
    explanation,
    foodKeyword,
    userPick,
  };
}
