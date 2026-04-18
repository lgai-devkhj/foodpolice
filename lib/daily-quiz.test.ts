import { describe, it, expect } from 'vitest';
import type { DailyOxQuizPayload } from './daily-quiz';

describe('daily-quiz types', () => {
  it('DailyOxQuizPayload 구조', () => {
    const p: DailyOxQuizPayload = {
      questionType: 1,
      question: '테스트',
      correctAnswer: 'O',
      explanation: '설명',
      foodKeyword: '요거트',
    };
    expect(p.correctAnswer).toBe('O');
  });
});
