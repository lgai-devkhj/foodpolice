import { describe, it, expect } from 'vitest';
import { quizApiErrorFromGeminiUpstream } from './gemini-http-error';

describe('quizApiErrorFromGeminiUpstream', () => {
  it('월 spending cap 메시지면 GEMINI_SPEND_CAP', () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        message:
          'Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.',
        status: 'RESOURCE_EXHAUSTED',
      },
    });
    const r = quizApiErrorFromGeminiUpstream(429, body);
    expect(r.httpStatus).toBe(503);
    expect(r.errorCode).toBe('GEMINI_SPEND_CAP');
    expect(r.message).toContain('월 사용 한도');
  });

  it('429 일반 쿼터는 GEMINI_QUOTA', () => {
    const r = quizApiErrorFromGeminiUpstream(429, '{"error":{"message":"Rate limited"}}');
    expect(r.errorCode).toBe('GEMINI_QUOTA');
    expect(r.httpStatus).toBe(503);
  });
});
