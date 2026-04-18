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
