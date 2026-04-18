import { describe, it, expect } from 'vitest';
import { parseGeminiModelObject } from './parse-gemini-model-json';

describe('parseGeminiModelObject', () => {
  it('후행 쉼표가 있어도 파싱한다', () => {
    const o = parseGeminiModelObject('{"a":1,"b":2,}');
    expect(o).toEqual({ a: 1, b: 2 });
  });

  it('잘린 객체 괄호를 보정한다', () => {
    const o = parseGeminiModelObject('{"productName":"x","novaGroup":3');
    expect(o?.productName).toBe('x');
    expect(o?.novaGroup).toBe(3);
  });
});
