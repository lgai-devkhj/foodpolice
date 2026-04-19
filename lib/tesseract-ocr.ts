/**
 * 서버(Node)에서 Tesseract.js로 라벨 이미지 OCR.
 * 언어: `TESSERACT_LANG` (기본 `kor+eng`).
 */
import { createWorker, type Worker } from 'tesseract.js';

function tessLang(): string {
  const raw = process.env.TESSERACT_LANG?.trim();
  return raw && raw.length > 0 ? raw : 'kor+eng';
}

export type TesseractOcrItem = { label: string; base64: string };

/**
 * base64(JPEG/PNG 등) 이미지들을 순서대로 인식해 라벨과 함께 이어붙인다.
 */
export async function tesseractExtractFromBase64Images(
  items: TesseractOcrItem[],
): Promise<{ text: string } | { error: { message: string; code: string } }> {
  if (items.length === 0) return { text: '' };

  let worker: Worker | null = null;
  try {
    worker = await createWorker(tessLang(), undefined, {
      logger: () => {
        /* 시연·프로덕션 로그 생략 */
      },
    });

    const parts: string[] = [];
    for (const it of items) {
      const buffer = Buffer.from(it.base64, 'base64');
      const {
        data: { text },
      } = await worker.recognize(buffer);
      const t = (text || '').trim();
      if (t) parts.push(`${it.label}\n${t}`);
    }

    return { text: parts.join('\n\n').trim() };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Tesseract OCR 실패';
    return {
      error: {
        message,
        code: 'TESSERACT_FAILED',
      },
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore */
      }
    }
  }
}
