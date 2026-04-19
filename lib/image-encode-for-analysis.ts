/**
 * 분석 API 전송 전 이미지 축소·JPEG 재압축 — 업로드 크기·멀티모달 처리 시간을 줄인다.
 * (브라우저 전용; App.tsx 등 클라이언트에서만 import)
 */

/** 라벨·영양표 OCR에는 충분하면서 멀티모달 토큰·업로드 시간을 줄인다(너무 크면 분석 API가 느려짐). */
const MAX_EDGE_PX = 896;
/** 비교는 이미지 4장을 한 번에 보내므로 한 장당 해상도를 더 낮춰 응답 지연을 줄인다. */
const MAX_EDGE_COMPARE_PX = 768;
const JPEG_QUALITY = 0.72;
const JPEG_QUALITY_COMPARE = 0.72;

function normalizeMime(mime: string): string {
  const m = (mime || 'image/jpeg').toLowerCase();
  return m.startsWith('image/') ? m : 'image/jpeg';
}

/**
 * 긴 변 기준 MAX_EDGE_PX 이하로 맞추고 JPEG로 보낸다. 라벨 판독에는 충분한 해상도다.
 */
export async function encodeImageForAnalysis(
  base64: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string }> {
  const mime = normalizeMime(mimeType);
  const dataUrl = `data:${mime};base64,${base64}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        resolve({ base64, mimeType: mime });
        return;
      }
      const maxSide = Math.max(w, h);
      const scale = maxSide > MAX_EDGE_PX ? MAX_EDGE_PX / maxSide : 1;
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));

      if (scale >= 0.999 && mime === 'image/jpeg') {
        resolve({ base64, mimeType: 'image/jpeg' });
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ base64, mimeType: mime });
        return;
      }
      ctx.drawImage(img, 0, 0, tw, th);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ base64, mimeType: mime });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const r = reader.result as string;
            const part = r.includes(',') ? r.split(',')[1] : '';
            resolve({ base64: part || base64, mimeType: 'image/jpeg' });
          };
          reader.onerror = () => resolve({ base64, mimeType: mime });
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => resolve({ base64, mimeType: mime });
    img.src = dataUrl;
  });
}

/**
 * 비교 API 전용: 긴 변 기준 더 작게 축소·JPEG 압축(4장 동시 전송 시 업로드·추론 시간 단축).
 */
export async function encodeImageForCompare(
  base64: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string }> {
  const mime = normalizeMime(mimeType);
  const dataUrl = `data:${mime};base64,${base64}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        resolve({ base64, mimeType: mime });
        return;
      }
      const maxSide = Math.max(w, h);
      const scale = maxSide > MAX_EDGE_COMPARE_PX ? MAX_EDGE_COMPARE_PX / maxSide : 1;
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));

      if (scale >= 0.999 && mime === 'image/jpeg') {
        resolve({ base64, mimeType: 'image/jpeg' });
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ base64, mimeType: mime });
        return;
      }
      ctx.drawImage(img, 0, 0, tw, th);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ base64, mimeType: mime });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const r = reader.result as string;
            const part = r.includes(',') ? r.split(',')[1] : '';
            resolve({ base64: part || base64, mimeType: 'image/jpeg' });
          };
          reader.onerror = () => resolve({ base64, mimeType: mime });
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        JPEG_QUALITY_COMPARE
      );
    };
    img.onerror = () => resolve({ base64, mimeType: mime });
    img.src = dataUrl;
  });
}
