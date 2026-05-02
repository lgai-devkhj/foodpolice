/** 브라우저/Node 로컬 타임존 기준 YYYY-MM-DD (날짜 퀘스트·스트릭 등 공통). */
export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
