/**
 * 일일 OX 퀴즈 — 문항은 `/api/quiz`(Gemini)에서 생성.
 */

export type DailyOxQuizPayload = {
  questionType: 1 | 2 | 3;
  question: string;
  correctAnswer: 'O' | 'X';
  explanation: string;
  foodKeyword: string;
};
