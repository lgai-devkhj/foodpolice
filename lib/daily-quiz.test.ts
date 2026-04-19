import { describe, it, expect } from 'vitest';
import type { DailyOxQuizPayload } from './daily-quiz';
import { parseDailyOxQuizSolvedStored } from './daily-quiz';

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

  it('parseDailyOxQuizSolvedStored 유효 객체', () => {
    const s = parseDailyOxQuizSolvedStored({
      dateYmd: '2026-04-19',
      questionType: 2,
      question: '테스트?',
      correctAnswer: 'x',
      userPick: 'O',
      explanation: '해설',
      foodKeyword: '우유',
    });
    expect(s).not.toBeNull();
    expect(s?.correctAnswer).toBe('X');
    expect(s?.userPick).toBe('O');
  });

  it('parseDailyOxQuizSolvedStored 무효 시 null', () => {
    expect(parseDailyOxQuizSolvedStored(null)).toBeNull();
    expect(parseDailyOxQuizSolvedStored({})).toBeNull();
  });
});
