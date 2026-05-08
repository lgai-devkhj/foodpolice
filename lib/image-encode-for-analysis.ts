
const MAX_EDGE_PX = 800;
const MAX_EDGE_COMPARE_PX = 704;
const MAX_EDGE_NUTRITION_PX = 1400;
const JPEG_QUALITY = 0.68;
const JPEG_QUALITY_COMPARE = 0.68;
const JPEG_QUALITY_NUTRITION = 0.84;

function dataUrlBase64Part(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : '';
}

function canvasToJpegBase64(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const b64 = dataUrlBase64Part(dataUrl);
    if (b64) return Promise.resolve(b64);
  } catch {
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('toBlob'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          resolve(dataUrlBase64Part(String(reader.result || '')));
        };
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function normalizeMime(mime: string): string {
  const m = (mime || 'image/jpeg').toLowerCase();
  return m.startsWith('image/') ? m : 'image/jpeg';
}

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
      void canvasToJpegBase64(canvas, JPEG_QUALITY)
        .then((part) => resolve({ base64: part || base64, mimeType: 'image/jpeg' }))
        .catch(() => resolve({ base64, mimeType: mime }));
    };
    img.onerror = () => resolve({ base64, mimeType: mime });
    img.src = dataUrl;
  });
}

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
      void canvasToJpegBase64(canvas, JPEG_QUALITY_COMPARE)
        .then((part) => resolve({ base64: part || base64, mimeType: 'image/jpeg' }))
        .catch(() => resolve({ base64, mimeType: mime }));
    };
    img.onerror = () => resolve({ base64, mimeType: mime });
    img.src = dataUrl;
  });
}

export async function encodeImageForNutritionAnalysis(
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
      const scale = maxSide > MAX_EDGE_NUTRITION_PX ? MAX_EDGE_NUTRITION_PX / maxSide : 1;
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
      void canvasToJpegBase64(canvas, JPEG_QUALITY_NUTRITION)
        .then((part) => resolve({ base64: part || base64, mimeType: 'image/jpeg' }))
        .catch(() => resolve({ base64, mimeType: mime }));
    };
    img.onerror = () => resolve({ base64, mimeType: mime });
    img.src = dataUrl;
  });
}
