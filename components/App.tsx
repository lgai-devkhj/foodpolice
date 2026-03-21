'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getClientId } from '@/lib/clientId';
import {
  loadState,
  setProfile as saveProfile,
  getProfile,
  getHistory,
  addToHistory,
  updateProductName,
  deleteFromHistory,
  clearAllData,
  addBodyMeasurement,
  removeBodyMeasurement,
  type Profile,
  type HistoryItem,
  type AnalysisResult,
  type BodyMeasurement,
} from '@/lib/store';
import {
  NOVA_NAMES,
  NOVA_IMG,
  NOVA_SHORT_REASON,
  NOVA_SUBGROUP_NAMES,
  NOVA_SUBGROUP_HINTS,
  PHOTO_GUIDE_EXAMPLE_URL,
} from '@/lib/constants';
import { DAILY_REFERENCE } from '@/lib/nutrition-daily';
import type { NutritionDailyPercent, NutritionFacts } from '@/lib/store';
import {
  IconLeaf,
  IconSearch,
  IconHeart,
  IconCamera,
  IconImage,
  IconAlert,
  IconSpinner,
  IconSettings,
  IconUser,
  IconTrash,
  IconSun,
  IconClipboard,
  IconChart,
  IconPlus,
  IconFlask,
  IconDroplet,
  IconPalette,
  IconLock,
  IconCheck,
} from '@/components/ui-icons';

/** bodyMeasurements 중 날짜 기준 가장 최신 기록의 키·몸무게, 없으면 profile 값 */
function getLatestHeightWeight(profile: Profile): { heightCm?: number | null; weightKg?: number | null } {
  const list = profile.bodyMeasurements || [];
  if (list.length === 0) return { heightCm: profile.heightCm, weightKg: profile.weightKg };
  const sorted = [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = sorted[0];
  return { heightCm: latest.heightCm, weightKg: latest.weightKg };
}

/** 표시·BMI용: 최신 기록 반영한 프로필 */
function getProfileWithLatestMeasurement(profile: Profile): Profile {
  const { heightCm, weightKg } = getLatestHeightWeight(profile);
  return { ...profile, heightCm, weightKg };
}

/** 연령 무관: 저체중 <18.5, 정상 18.5~22.9, 과체중 23~24.9, 비만 25 이상 */
function getBMICategory(p: Profile): { bmi: number; category: string } | null {
  const bmi = computeBmi(p.heightCm ?? 0, p.weightKg ?? 0);
  if (bmi == null) return null;
  if (bmi < 18.5) return { bmi, category: '저체중' };
  if (bmi <= 22.9) return { bmi, category: '정상' };
  if (bmi <= 24.9) return { bmi, category: '과체중' };
  return { bmi, category: '비만' };
}

function escapeHtml(s: string): string {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function nutritionPctBarClass(pct: number): string {
  if (pct >= 40) return 'nutrition-pct-fill high';
  if (pct >= 20) return 'nutrition-pct-fill warn';
  return 'nutrition-pct-fill';
}

function buildNutritionResultHtml(
  nutrition: NutritionFacts | null | undefined,
  daily: NutritionDailyPercent | null | undefined
): string {
  const hasNums =
    nutrition &&
    (nutrition.servingSizeText ||
      nutrition.caloriesKcal != null ||
      nutrition.sodiumMg != null ||
      nutrition.carbsG != null ||
      nutrition.sugarG != null ||
      nutrition.proteinG != null ||
      nutrition.fatG != null ||
      nutrition.saturatedFatG != null ||
      nutrition.transFatG != null);
  const hasDaily = daily && Object.keys(daily).length > 0;
  if (!hasNums && !hasDaily) return '';

  let html = '<div class="result-details-body result-nutrition">';
  html +=
    '<p class="meta" style="margin:0 0 10px;line-height:1.5;">표에 나온 분량을 기준으로, 하루 참고치(2000kcal) 대비 %를 보여드려요.</p>';

  if (nutrition?.servingSizeText) {
    html +=
      '<div class="nutrition-serving-line"><span class="nutrition-leading" aria-hidden="true"></span><span>' +
      escapeHtml(nutrition.servingSizeText) +
      (nutrition.basisIsPerServing === false
        ? ' <span class="meta">(100g·100ml 등 기준일 수 있음)</span>'
        : '') +
      '</span></div>';
  }

  if (nutrition?.caloriesKcal != null && Number.isFinite(nutrition.caloriesKcal)) {
    html +=
      '<div style="margin-bottom:12px;font-size:1.05rem;color:var(--text);"><strong>열량</strong> ' +
      escapeHtml(String(nutrition.caloriesKcal)) +
      ' kcal</div>';
  }

  type Row = { key: keyof NutritionDailyPercent; label: string; unit: string; dv: number };
  // 너무 많은 항목을 한 번에 보여주지 않고, 핵심만 먼저 보여요.
  const rows: Row[] = [
    { key: 'calories', label: '열량', unit: '%', dv: DAILY_REFERENCE.caloriesKcal },
    { key: 'sodium', label: '나트륨', unit: '%', dv: DAILY_REFERENCE.sodiumMg },
    { key: 'sugar', label: '당류', unit: '%', dv: DAILY_REFERENCE.sugarG },
    { key: 'saturatedFat', label: '포화지방', unit: '%', dv: DAILY_REFERENCE.saturatedFatG },
  ];

  if (hasDaily && daily) {
    rows.forEach((r) => {
      const pct = daily[r.key];
      if (pct == null || !Number.isFinite(pct)) return;
      const w = Math.min(100, pct);
      html += '<div style="margin-bottom:14px;">';
      html +=
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;"><span style="color:var(--text);font-weight:500;">' +
        escapeHtml(r.label) +
        '</span><span style="color:var(--text2);font-size:0.95rem;">' +
        escapeHtml(String(pct)) +
        escapeHtml(r.unit) +
        ' <span class="meta">(일일 ' +
        escapeHtml(String(r.dv)) +
        (r.key === 'calories' ? 'kcal' : r.key === 'sodium' ? 'mg' : 'g') +
        ')</span></span></div>';
      html +=
        '<div class="nutrition-pct-bar"><div class="' +
        nutritionPctBarClass(pct) +
        '" style="width:' +
        w +
        '%;"></div></div>';
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

function buildAlternativeFoodHtml(altText: string, fromWebSearch?: boolean): string {
  if (!altText) return '';

  const lines = altText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const currentFoodLine = lines.find((l) => /^현재 식품\s*:\s*/.test(l)) || '';
  const stageLine = lines.find((l) => /^가공 단계\s*:\s*/.test(l)) || '';
  const currentFood = currentFoodLine.replace(/^현재 식품\s*:\s*/, '').trim();
  const stage = stageLine.replace(/^가공 단계\s*:\s*/, '').trim();

  const optionRe = /^(\d+)\.\s*(조금 개선|더 나은 선택|최적 선택)\s*:\s*(.*)$/;
  const reasonRe = /^-\s*이유\s*:\s*(.*)$/;

  type Item = { label: string; product: string; reason: string };
  const items: Item[] = [];
  let lastIdx: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const om = line.match(optionRe);
    if (om) {
      const label = om[2] || '';
      const product = (om[3] || '').trim();
      if (!product) {
        lastIdx = null;
        continue;
      }
      items.push({ label, product, reason: '' });
      lastIdx = items.length - 1;
      continue;
    }
    const rm = line.match(reasonRe);
    if (rm && lastIdx != null) {
      items[lastIdx].reason = (rm[1] || '').trim();
      continue;
    }
  }

  const top = [];
  if (currentFood) top.push(`<div class="alt-meta">현재 식품: ${escapeHtml(currentFood)}</div>`);
  if (stage) top.push(`<div class="alt-meta">가공 단계: ${escapeHtml(stage)}</div>`);

  const shown = items.slice(0, 3);
  const grid = shown
    .map((it) => {
      const kicker = it.label ? escapeHtml(it.label) : '';
      const reason = it.reason ? escapeHtml(it.reason) : '';
      return (
        '<div class="alt-item">' +
        '<div class="alt-item-row">' +
        '<div class="alt-item-main">' +
        (kicker ? `<div class="alt-kicker">${kicker}</div>` : '') +
        `<div class="alt-product">${escapeHtml(it.product)}</div>` +
        (reason ? `<div class="alt-reason">${reason}</div>` : '') +
        '</div></div></div>'
      );
    })
    .join('');

  let fallbackNote = '';
  if (shown.length === 0) {
    const arrowIdx = lines.findIndex((l) => /👉\s*더 나은 선택/.test(l));
    const start = arrowIdx >= 0 ? arrowIdx + 1 : 0;
    const proseParts: string[] = [];
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      if (optionRe.test(l) || reasonRe.test(l)) break;
      if (/^현재 식품\s*:/.test(l) || /^가공 단계\s*:/.test(l)) continue;
      if (l.length > 0) proseParts.push(l);
    }
    const prose = proseParts.join(' ').trim();
    if (prose) fallbackNote = prose;
  }

  const disclaimer =
    '<p class="alt-disclaimer">' +
    (fromWebSearch
      ? '웹 검색 결과를 참고한 AI 제안이에요. 검색 시점·지역·매장에 따라 품목·명칭이 다를 수 있어요. 구매 전 라벨을 확인해 주세요.'
      : 'AI 참고 제안이에요. 실제 매장 품목·명칭·판매 여부와 다를 수 있으니, 구매 전 라벨을 확인해 주세요.') +
    '</p>';

  return (
    '<div class="alt-block">' +
    top.join('') +
    (grid ? `<div class="alt-grid">${grid}</div>` : '') +
    (fallbackNote ? `<div class="alt-fallback">${escapeHtml(fallbackNote)}</div>` : '') +
    disclaimer +
    '</div>'
  );
}

function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sec = (now.getTime() - d.getTime()) / 1000;
  if (sec < 60) return '방금 전';
  if (sec < 3600) return Math.floor(sec / 60) + '분 전';
  if (sec < 86400) return Math.floor(sec / 3600) + '시간 전';
  if (sec < 2592000) return Math.floor(sec / 86400) + '일 전';
  return d.toLocaleDateString('ko-KR');
}

function computeAgeFullYears(birthDateStr: string): number | null {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function computeBmi(heightCm: number, weightKg: number): number | null {
  if (!heightCm || !weightKg) return null;
  return weightKg / ((heightCm / 100) ** 2);
}

function isObeseByProfile(p: Profile): boolean {
  if (!p) return false;
  const bmi = computeBmi(p.heightCm ?? 0, p.weightKg ?? 0);
  return bmi != null && bmi >= 25;
}

function displayName(item: HistoryItem | null): string {
  return (item?.customProductName || item?.productName || '').trim() || '';
}

function birthDisplay(birthDateStr: string): string {
  if (!birthDateStr) return '—';
  const d = new Date(birthDateStr);
  if (isNaN(d.getTime())) return '—';
  const year = d.getFullYear();
  const now = new Date();
  let age = now.getFullYear() - year;
  const m = now.getMonth(), day = now.getDate();
  const bm = d.getMonth(), bd = d.getDate();
  if (m < bm || (m === bm && day < bd)) age -= 1;
  return year + '년생 (만 ' + age + '세)';
}

function daysInMonth(year: number, month: number): number {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 31;
  return new Date(year, month, 0).getDate();
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const m = (value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number): string {
  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(Math.max(1, day), maxDay);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function clampIsoDate(value: string, min: string, max: string): string {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function WheelColumn({
  values,
  selected,
  suffix,
  onSelect,
}: {
  values: number[];
  selected: number;
  suffix: string;
  onSelect: (v: number) => void;
}) {
  const rowH = 40;
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const idx = Math.max(0, values.indexOf(selected));
    if (ref.current) ref.current.scrollTop = idx * rowH;
  }, [selected, values]);

  return (
    <div
      className="ymd-wheel-col"
      ref={ref}
      onScroll={(e) => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          const top = (e.currentTarget as HTMLDivElement).scrollTop;
          const idx = Math.round(top / rowH);
          const v = values[Math.min(values.length - 1, Math.max(0, idx))];
          if (v != null) onSelect(v);
        }, 60);
      }}
    >
      {values.map((v) => (
        <button
          type="button"
          key={v}
          className={`ymd-wheel-item ${v === selected ? 'active' : ''}`}
          onClick={() => onSelect(v)}
        >
          {v}
          {suffix}
        </button>
      ))}
    </div>
  );
}

function YmdWheelPicker({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  min: string;
  max: string;
}) {
  const minParts = parseIsoDate(min);
  const maxParts = parseIsoDate(max);
  const parsed = parseIsoDate(value) || maxParts || { year: 2000, month: 1, day: 1 };
  const minYear = minParts?.year ?? 1900;
  const maxYear = maxParts?.year ?? new Date().getFullYear();
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => {
    if (parsed.year === minYear && minParts && m < minParts.month) return false;
    if (parsed.year === maxYear && maxParts && m > maxParts.month) return false;
    return true;
  });
  const maxDay = daysInMonth(parsed.year, parsed.month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1).filter((d) => {
    if (minParts && parsed.year === minParts.year && parsed.month === minParts.month && d < minParts.day) return false;
    if (maxParts && parsed.year === maxParts.year && parsed.month === maxParts.month && d > maxParts.day) return false;
    return true;
  });

  return (
    <div className="ymd-wheel-wrap">
      <div className="ymd-wheel-highlight" aria-hidden />
      <WheelColumn
        values={years}
        selected={parsed.year}
        suffix="년"
        onSelect={(y) => onChange(clampIsoDate(toIsoDate(y, parsed.month, parsed.day), min, max))}
      />
      <WheelColumn
        values={months}
        selected={parsed.month}
        suffix="월"
        onSelect={(m) => onChange(clampIsoDate(toIsoDate(parsed.year, m, parsed.day), min, max))}
      />
      <WheelColumn
        values={days}
        selected={Math.min(parsed.day, maxDay)}
        suffix="일"
        onSelect={(d) => onChange(clampIsoDate(toIsoDate(parsed.year, parsed.month, d), min, max))}
      />
    </div>
  );
}

export default function App() {
  const [clientId, setClientId] = useState('');
  const [profile, setProfileState] = useState<Profile>({});
  const [history, setHistoryList] = useState<HistoryItem[]>([]);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showHome, setShowHome] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'list' | 'display' | 'profile'>('list');
  const [showCamera, setShowCamera] = useState(false);
  const [showInfoIngredient, setShowInfoIngredient] = useState(false);
  const [showInfoCriteria, setShowInfoCriteria] = useState(false);
  const [showInfoPhoto, setShowInfoPhoto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('글자 읽는 중');
  const [error, setError] = useState('');
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [lastAnalysisSeconds, setLastAnalysisSeconds] = useState<number | null>(null);
  const [lastAnalysisForId, setLastAnalysisForId] = useState<string | null>(null);
  const [resultContentHtml, setResultContentHtml] = useState('');
  const [showDeleteArea, setShowDeleteArea] = useState(false);
  const todayDate = new Date().toISOString().slice(0, 10);
  const [profileGender, setProfileGender] = useState('male');
  const [profileHeight, setProfileHeight] = useState('');
  const [profileWeight, setProfileWeight] = useState('');
  const [obStep, setObStep] = useState(0);
  const [obBirth, setObBirth] = useState(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });
  const [obGender, setObGender] = useState('male');
  const [obHeight, setObHeight] = useState('');
  const [obWeight, setObWeight] = useState('');
  const [obSummaryBirth, setObSummaryBirth] = useState('—');
  const [obSummaryGender, setObSummaryGender] = useState('—');
  const [obSummaryHeight, setObSummaryHeight] = useState('—');
  const [obSummaryWeight, setObSummaryWeight] = useState('—');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);
  const [showMeasurementHistory, setShowMeasurementHistory] = useState(false);
  const [showBmiGraph, setShowBmiGraph] = useState(false);
  const [cameraOrientation, setCameraOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [capturedPreviewDataUrl, setCapturedPreviewDataUrl] = useState<string | null>(null);
  const [capturedPreviewMimeType, setCapturedPreviewMimeType] = useState<string>('image/jpeg');
  const [captureStep, setCaptureStep] = useState<1 | 2>(1);
  const [rawImageBase64, setRawImageBase64] = useState<string | null>(null);
  const [rawImageMimeType, setRawImageMimeType] = useState<string>('image/jpeg');
  const [nutritionImageBase64, setNutritionImageBase64] = useState<string | null>(null);
  const [nutritionImageMimeType, setNutritionImageMimeType] = useState<string>('image/jpeg');
  const [showOnboardingCompleteModal, setShowOnboardingCompleteModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploadSource, setUploadSource] = useState<'camera' | 'gallery'>('camera');
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraGuideRef = useRef<HTMLDivElement>(null);
  const resultScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClientId(getClientId());
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const state = loadState(clientId);
    setProfileState(state.profile || {});
    setHistoryList(state.history || []);
    setOnboardingCompleted(state.onboardingCompleted);
    setShowOnboarding(!state.onboardingCompleted);
  }, [clientId]);

  useEffect(() => {
    if (showResult && resultScrollRef.current) {
      resultScrollRef.current.scrollTop = 0;
    }
  }, [showResult, currentHistoryId]);

  useEffect(() => {
    if (!showOnboardingCompleteModal) return;
    const t = setTimeout(() => setShowOnboardingCompleteModal(false), 2200);
    return () => clearTimeout(t);
  }, [showOnboardingCompleteModal]);

  useEffect(() => {
    const mode = profile.appearanceMode || 'system';
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
    } else {
      const dark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
  }, [profile.appearanceMode]);

  useEffect(() => {
    const mode = profile.appearanceMode || 'system';
    if (mode !== 'system' && mode !== undefined) return;
    const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!mq) return;
    const apply = () => {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [profile.appearanceMode]);

  const applyAppearance = useCallback((mode: string) => {
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
    } else {
      const dark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
  }, []);

  const refreshHistory = useCallback(() => {
    if (!clientId) return;
    setHistoryList(getHistory(clientId));
  }, [clientId]);

  const runAnalyze = useCallback(
    async (base64: string, mimeType: string) => {
      if (!clientId) return;
      const startedAt = performance.now();
      setLoading(true);
      setLoadingText('분석하는 중');
      setError('');
      try {
        const p = getProfileWithLatestMeasurement(profile);
        const profilePayload =
          p.heightCm != null && p.weightKg != null && p.heightCm > 0 && p.weightKg > 0
            ? { heightCm: p.heightCm, weightKg: p.weightKg }
            : undefined;
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            imageBase64: base64,
            mimeType,
            ...(profilePayload ? { profile: profilePayload } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '분석 중 오류가 났어요.');
        const result = data as AnalysisResult;
        const endedAt = performance.now();
        const sec = Math.max(0, (endedAt - startedAt) / 1000);
        setLastAnalysisSeconds(sec);
        const { id, item } = addToHistory(clientId, result);
        setCurrentResult(result);
        setCurrentHistoryId(id);
        setLastAnalysisForId(id);
        setProfileState(getProfile(clientId));
        refreshHistory();
        renderResult(result, item, { analysisSeconds: sec, historyId: id });
        setShowHome(false);
        setShowResult(true);
        setShowDeleteArea(true);
        setCaptureStep(1);
        setRawImageBase64(null);
        setNutritionImageBase64(null);
        setCapturedPreviewDataUrl(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '분석 중 오류가 났어요.');
      } finally {
        setLoading(false);
      }
    },
    [clientId, refreshHistory, profile]
  );

  const runAnalyzeTwoImages = useCallback(
    async (
      rawBase64: string,
      rawMimeType: string,
      nutritionBase64: string,
      nutritionMimeType: string
    ) => {
      if (!clientId) return;
      const startedAt = performance.now();
      setLoading(true);
      setLoadingText('분석하는 중');
      setError('');
      try {
        const p = getProfileWithLatestMeasurement(profile);
        const profilePayload =
          p.heightCm != null && p.weightKg != null && p.heightCm > 0 && p.weightKg > 0
            ? { heightCm: p.heightCm, weightKg: p.weightKg }
            : undefined;
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            rawImageBase64: rawBase64,
            rawMimeType,
            nutritionImageBase64: nutritionBase64,
            nutritionMimeType,
            ...(profilePayload ? { profile: profilePayload } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '분석 중 오류가 났어요.');
        const result = data as AnalysisResult;
        const endedAt = performance.now();
        const sec = Math.max(0, (endedAt - startedAt) / 1000);
        setLastAnalysisSeconds(sec);
        const { id, item } = addToHistory(clientId, result);
        setCurrentResult(result);
        setCurrentHistoryId(id);
        setLastAnalysisForId(id);
        setProfileState(getProfile(clientId));
        refreshHistory();
        renderResult(result, item, { analysisSeconds: sec, historyId: id });
        setShowHome(false);
        setShowResult(true);
        setShowDeleteArea(true);
        setCaptureStep(1);
        setRawImageBase64(null);
        setNutritionImageBase64(null);
        setCapturedPreviewDataUrl(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '분석 중 오류가 났어요.');
      } finally {
        setLoading(false);
      }
    },
    [clientId, refreshHistory, profile]
  );

  const renderResult = useCallback(
    (
      result: AnalysisResult,
      historyItem: HistoryItem | null,
      opts?: { analysisSeconds: number; historyId: string }
    ) => {
      const product = result.product || {};
      const name = historyItem
        ? (displayName(historyItem) || '알 수 없음')
        : ((product.productName || '').trim() || '알 수 없음');
      const company = (product.companyName || '').trim();
      const raw = (product.rawMaterials || '').trim();
      const nova = result.novaGroup || 4;
      const sub = (result.novaSubgroup || '').trim().toUpperCase();
      const subKey = sub === '4A' || sub === '4B' || sub === '4C' ? sub : '';
      const reason = result.judgmentReason || '';
      const concerns = result.concernIngredients || [];
      const advice = result.consumptionAdvice || '';
      const personalizedIntakeNote = (result.personalizedIntakeNote || '').trim();
      const altText = (result.alternativeFoodText || '').trim();
      const isUltra = nova === 4;
      const isObese = isObeseByProfile(getProfileWithLatestMeasurement(profile));
      const ultraMsg = isObese
        ? '초가공 식품입니다. 비만 위험을 높일 수 있으므로 섭취를 줄이는 것이 좋습니다.'
        : '초가공 식품입니다. 섭취 빈도를 줄이는 것이 좋습니다.';

      const showTime =
        opts?.analysisSeconds != null &&
        opts?.historyId != null &&
        (opts.historyId === currentHistoryId || (historyItem?.id && opts.historyId === historyItem.id));

      let html = '';
      if (showTime && opts) {
        html += `<div class="result-analysis-time">${opts.analysisSeconds.toFixed(1)}초 만에 분석되었어요</div>`;
      } else if (
        currentHistoryId &&
        lastAnalysisForId === currentHistoryId &&
        lastAnalysisSeconds != null
      ) {
        html += `<div class="result-analysis-time">${lastAnalysisSeconds.toFixed(1)}초 만에 분석되었어요</div>`;
      }
      /* 순서: 제목 → NOVA → 맞춤 안내 → 주의 원재료 → 대체 식품 → 원재료 보기 → 영양 비율 */
      html += '<div class="card" id="productNameCard">';
      html += '<div class="card-title" id="productNameDisplay">' + escapeHtml(name) + '</div>';
      if (company) html += '<div class="meta">' + escapeHtml(company) + '</div>';
      if (currentHistoryId)
        html +=
          '<div style="margin-top:8px;"><button type="button" class="edit-row save" id="editNameBtn"><span class="edit-name-btn-inner"><span class="edit-leading" aria-hidden="true"></span>이름 수정</span></button></div>';
      html += '</div>';

      html += '<div class="card card-nova card-nova-' + nova + '">';
      html += '<div class="nova-result-slab">';
      html += '<div class="card-title nova-result-title">한국형 NOVA 분류</div>';
      html +=
        '<span class="nova-badge nova-' +
        nova +
        '"><img src="' +
        (NOVA_IMG[nova] || '') +
        '" alt="" class="nova-icon" referrerpolicy="no-referrer">' +
        NOVA_NAMES[nova];
      if (subKey && NOVA_SUBGROUP_NAMES[subKey]) {
        html += '<span class="nova-subtag">' + escapeHtml(NOVA_SUBGROUP_NAMES[subKey]) + '</span>';
      }
      html += '</span>';
      if (subKey && NOVA_SUBGROUP_HINTS[subKey]) {
        html +=
          '<div class="nova-result-hint">' + escapeHtml(NOVA_SUBGROUP_HINTS[subKey]) + '</div>';
      }
      if (reason) {
        html += '<div class="nova-result-reason">' + escapeHtml(reason) + '</div>';
      } else {
        html +=
          '<div class="nova-result-reason">' +
          escapeHtml(NOVA_SHORT_REASON[nova] || NOVA_SHORT_REASON[4]) +
          '</div>';
      }
      html += '</div></div>';

      html += '<div class="card"><div class="card-title">맞춤 안내</div>';
      if (personalizedIntakeNote) {
        html +=
          '<div class="advice-box advice-box--with-leading"><span class="advice-leading advice-leading--target-mask" aria-hidden="true"></span><span class="advice-text">' +
          escapeHtml(personalizedIntakeNote) +
          '</span></div>';
      } else if (advice) {
        html +=
          '<div class="advice-box advice-box--with-leading"><span class="advice-leading advice-leading--utensil-mask" aria-hidden="true"></span><span class="advice-text">' +
          escapeHtml(advice) +
          '</span></div>';
      }
      if (isUltra)
        html +=
          '<div class="advice-box advice-warning advice-box--with-leading"><span class="advice-leading advice-leading--warn-mask" aria-hidden="true"></span><span class="advice-text">' +
          escapeHtml(ultraMsg) +
          '</span></div>';
      if (!personalizedIntakeNote && !advice && !isUltra)
        html += '<div class="advice-box">과도한 섭취를 피하는 것이 좋습니다.</div>';
      html += '</div>';

      if (concerns.length > 0) {
        html += '<div class="card"><div class="card-title">주의 원재료</div>';
        html += '<div class="concern-panel">';
        concerns.forEach((c) => {
          html +=
            '<div class="concern-card">' +
            '<div class="concern-card-icon" aria-hidden="true"></div>' +
            '<div class="concern-card-body">' +
            '<div class="concern-card-name">' +
            escapeHtml(c.name) +
            '</div>' +
            '<div class="concern-card-desc">' +
            escapeHtml(c.explanation) +
            '</div></div></div>';
        });
        html += '</div></div>';
      }

      if (altText) {
        const altHtml = buildAlternativeFoodHtml(altText, result.alternativeFoodFromWebSearch === true);
        if (altHtml) {
          html += '<details class="result-details"><summary>대체 식품</summary>';
          html += `<div class="result-details-body">${altHtml}</div>`;
          html += '</details>';
        }
      }

      html += '<details class="result-details result-details-raw"><summary>원재료 보기</summary>';
      html += raw
        ? '<div class="result-details-body result-raw-body"><div style="font-size:1.02rem;color:var(--text2);line-height:1.6;">' +
          escapeHtml(raw) +
          '</div></div>'
        : '<div class="result-details-body"><div class="meta">원재료 정보가 없어요</div></div>';
      html += '</details>';

      const nutritionHtml = buildNutritionResultHtml(
        result.nutrition ?? undefined,
        result.nutritionDailyPercent ?? undefined
      );
      if (nutritionHtml) {
        html += '<details class="result-details"><summary>영양 비율 보기</summary>' + nutritionHtml + '</details>';
      }
      setResultContentHtml(html);
    },
    [profile, currentHistoryId, lastAnalysisForId, lastAnalysisSeconds]
  );

  useEffect(() => {
    if (!resultContentHtml) return;
    const container = document.getElementById('resultContent');
    if (!container) return;
    container.innerHTML = resultContentHtml;
    const editBtn = container.querySelector('#editNameBtn');
    if (editBtn && currentHistoryId) {
      const historyItem = history.find((i) => i.id === currentHistoryId) || null;
      const name = displayName(historyItem);
      const handler = () => {
        setEditNameValue(name);
        setEditingName(name);
      };
      editBtn.addEventListener('click', handler);
      return () => editBtn.removeEventListener('click', handler);
    }
  }, [resultContentHtml, currentHistoryId, history]);

  const startCamera = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      })
      .then((stream) => {
        cameraStreamRef.current = stream;
        setShowCamera(true);
      })
      .catch(() => fileInputRef.current?.click());
    return true;
  }, []);

  const triggerUpload = useCallback(() => {
    setCapturedPreviewDataUrl(null);
    setError('');
    // 홈 FAB(촬영): 항상 새 제품 스캔 — 1/2(원재료)부터. 분석 직후 captureStep=2·이전 원재료가 남아 있어도 여기서 초기화.
    setCaptureStep(1);
    setRawImageBase64(null);
    setNutritionImageBase64(null);
    setUploadSource('camera');
    if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
      startCamera();
    } else {
      fileInputRef.current?.click();
    }
  }, [startCamera]);

  useEffect(() => {
    if (!showCamera) return;
    const video = cameraVideoRef.current;
    const stream = cameraStreamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    return () => {
      if (!cameraStreamRef.current) return;
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    };
  }, [showCamera]);

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setShowCamera(false);
  }, []);

  const captureFromCamera = useCallback(() => {
    const v = cameraVideoRef.current;
    const guideEl = cameraGuideRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;
    const vW = v.videoWidth;
    const vH = v.videoHeight;
    const videoRect = v.getBoundingClientRect();
    const scale = Math.max(videoRect.width / vW, videoRect.height / vH);
    const displayedW = vW * scale;
    const displayedH = vH * scale;
    const offsetX = (displayedW - videoRect.width) / 2;
    const offsetY = (displayedH - videoRect.height) / 2;

    let cropX = 0;
    let cropY = 0;
    let cropW = vW;
    let cropH = vH;

    if (guideEl) {
      const guideRect = guideEl.getBoundingClientRect();
      const guideLeft = guideRect.left - videoRect.left + offsetX;
      const guideTop = guideRect.top - videoRect.top + offsetY;
      cropX = Math.max(0, Math.floor(guideLeft / scale));
      cropY = Math.max(0, Math.floor(guideTop / scale));
      cropW = Math.min(vW - cropX, Math.floor(guideRect.width / scale));
      cropH = Math.min(vH - cropY, Math.floor(guideRect.height / scale));
      if (cropW <= 0 || cropH <= 0) {
        cropX = 0;
        cropY = 0;
        cropW = vW;
        cropH = vH;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    stopCamera();
    setCapturedPreviewMimeType('image/jpeg');
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          fileInputRef.current?.click();
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setCapturedPreviewDataUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      0.92
    );
  }, [stopCamera]);

  const confirmCapturedImage = useCallback(() => {
    if (!capturedPreviewDataUrl) return;
    const base64 = capturedPreviewDataUrl.split(',')[1];
    const mime = capturedPreviewMimeType || 'image/jpeg';
    setCapturedPreviewDataUrl(null);
    if (captureStep === 1) {
      setRawImageBase64(base64 || '');
      setRawImageMimeType(mime);
      setCaptureStep(2);
      startCamera();
      return;
    }
    if (!rawImageBase64) {
      setError('원재료 사진을 먼저 선택해 주세요');
      return;
    }
    runAnalyzeTwoImages(rawImageBase64, rawImageMimeType, base64 || '', mime);
  }, [
    capturedPreviewDataUrl,
    capturedPreviewMimeType,
    captureStep,
    rawImageBase64,
    rawImageMimeType,
    runAnalyzeTwoImages,
    startCamera,
  ]);

  const retakePhoto = useCallback(() => {
    setCapturedPreviewDataUrl(null);
    startCamera();
  }, [startCamera]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        const mime = (file.type || 'image/jpeg').toLowerCase();
        const normalizedMime = mime.startsWith('image/') ? mime : 'image/jpeg';
        if (captureStep === 1) {
          setRawImageBase64(base64 || '');
          setRawImageMimeType(normalizedMime);
          setCaptureStep(2);
          // 다음 단계(2/2)를 이어서 진행: 카메라로 가지 않고, 선택한 소스(앨범/촬영)에서 계속 진행
          if (uploadSource === 'gallery') {
            setCapturedPreviewDataUrl(null);
            galleryInputRef.current?.click();
          } else {
            // 카메라 소스인 경우만 카메라로 이어집니다.
            if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
              startCamera();
            } else {
              fileInputRef.current?.click();
            }
          }
        } else {
          if (!rawImageBase64) {
            setError('원재료 사진을 먼저 선택해 주세요');
            return;
          }
          setNutritionImageBase64(base64 || '');
          setNutritionImageMimeType(normalizedMime);
          runAnalyzeTwoImages(rawImageBase64, rawImageMimeType, base64 || '', normalizedMime);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [
      captureStep,
      rawImageBase64,
      rawImageMimeType,
      runAnalyzeTwoImages,
      startCamera,
    ]
  );

  const openSettings = useCallback(() => {
    setProfileGender(profile.gender || 'male');
    setProfileHeight(profile.heightCm != null ? String(profile.heightCm) : '');
    setProfileWeight(profile.weightKg != null ? String(profile.weightKg) : '');
    setSettingsPage('list');
    setShowSettings(true);
  }, [profile]);

  const settingsDisplaySubtitle =
    profile.appearanceMode === 'light'
      ? '라이트 모드'
      : profile.appearanceMode === 'dark'
        ? '다크 모드'
        : '시스템 설정';

  const settingsProfileSubtitle = (() => {
    if (profile.birthDate) {
      const year = profile.birthDate.substring(0, 4);
      const age = computeAgeFullYears(profile.birthDate);
      return age != null ? year + '년생 (만 ' + age + '세)' : year + '년생';
    }
    return '설정되지 않음';
  })();

  if (!clientId) return null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {showCamera && (
        <div className="camera-view" aria-label="촬영">
          <video
            ref={cameraVideoRef}
            className="camera-video"
            autoPlay
            playsInline
            muted
          />
          <div className="camera-ui">
            <div className="camera-top-bar">
              <span style={{ width: 44, height: 44 }} aria-hidden />
              <button type="button" className="camera-x" aria-label="닫기" onClick={stopCamera}>×</button>
            </div>
            <div className="camera-guide-wrap">
              <div
                ref={cameraGuideRef}
                className={`camera-guide-frame ${cameraOrientation}`}
                aria-hidden
              >
                <span className="camera-guide-label">
                  {captureStep === 1 ? '원재료명이 보이게 찍어주세요' : '영양성분표가 보이게 찍어주세요'}
                </span>
              </div>
            </div>
            <div className="camera-bottom-row">
              <button
                type="button"
                className={`camera-orient-btn ${cameraOrientation === 'landscape' ? 'active' : ''}`}
                onClick={() => setCameraOrientation('landscape')}
              >
                <span className="camera-orient-icon" aria-hidden>▭</span>
                가로
              </button>
              <button type="button" className="camera-shutter" onClick={captureFromCamera} aria-label="촬영" />
              <button
                type="button"
                className={`camera-orient-btn ${cameraOrientation === 'portrait' ? 'active' : ''}`}
                onClick={() => setCameraOrientation('portrait')}
              >
                <span className="camera-orient-icon" aria-hidden>▯</span>
                세로
              </button>
            </div>
            <button
              type="button"
              className="camera-album-btn"
              aria-label="앨범에서 선택"
              onClick={() => {
                setUploadSource('gallery');
                galleryInputRef.current?.click();
              }}
            >
              <IconImage size={20} />
              앨범
            </button>
            <p className="camera-hint">
              {captureStep === 1 ? '1/2: 포장 뒷면(원재료) 촬영' : '2/2: 영양성분표 촬영'}
            </p>
            <p className="camera-hint-sub">지금은 한국어만 분석할 수 있어요</p>
          </div>
        </div>
      )}

      {capturedPreviewDataUrl && (
        <div className="capture-preview-view" aria-label="촬영 미리보기">
          <img src={capturedPreviewDataUrl} alt="촬영한 사진" className="capture-preview-img" />
          <p style={{ margin: '14px 0 0', color: 'var(--text2)', fontWeight: 700, textAlign: 'center' }}>
            {captureStep === 1 ? '1/2 · 원재료' : '2/2 · 영양성분표'}
          </p>
          <div className="capture-preview-actions">
            <button type="button" className="capture-preview-btn retake" onClick={retakePhoto}>
              다시 촬영
            </button>
            <button type="button" className="capture-preview-btn confirm" onClick={confirmCapturedImage}>
              {captureStep === 1 ? '다음(영양성분표)' : '분석하기'}
            </button>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div id="onboardingView" className={showOnboarding ? '' : 'hidden'} role="main" aria-label="사전 조사">
          <div className="onboarding-inner">
            {obStep === 0 && (
              <div id="onboardingStep0">
                <div className="ob-welcome-visual" aria-hidden>
                  <span className="ob-welcome-core">
                    <IconLeaf size={44} />
                  </span>
                </div>
                <h2 className="ob-welcome-title">FoodPolice</h2>
                <p className="ob-welcome-desc">
                  포장만 찍으면 원재료와 NOVA 등급을
                  <br />
                  바로 알려줄게요
                </p>
                <div className="ob-welcome-features">
                  <div className="ob-welcome-feature-item">
                    <span className="ico">
                      <IconCamera size={22} />
                    </span>{' '}
                    원재료·NOVA 한 번에
                  </div>
                  <div className="ob-welcome-feature-item">
                    <span className="ico">
                      <IconUser size={22} />
                    </span>{' '}
                    키·몸무게로 BMI·비만 여부
                  </div>
                  <div className="ob-welcome-feature-item">
                    <span className="ico">
                      <IconAlert size={22} />
                    </span>{' '}
                    비만일 땐 초가공 경고 강하게
                  </div>
                </div>
                <button type="button" className="btn btn-primary btn-full" onClick={() => setObStep(1)}>
                  시작하기
                </button>
              </div>
            )}
            {obStep === 1 && (
              <div id="onboardingStep1" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="ob-form-header">
                  <h2>몇 가지만 알려주세요</h2>
                  <p className="ob-lead">나이·성별에 맞는 안내를 드리려고 해요</p>
                </div>
                <div className="form-group">
                  <label>생년월일</label>
                  <YmdWheelPicker value={obBirth} min="1900-01-01" max={todayDate} onChange={setObBirth} />
                </div>
                <div className="form-group">
                  <label>성별</label>
                  <select id="obGender" value={obGender} onChange={(e) => setObGender(e.target.value)}>
                    <option value="male">남성</option>
                    <option value="female">여성</option>
                  </select>
                </div>
                <p className="ob-safety">
                  <span className="ob-safety-ico" aria-hidden>
                    <IconLock size={16} />
                  </span>
                  입력한 정보는 기기에만 안전하게 저장돼요
                </p>
                <div className="ob-step-actions">
                  <button type="button" className="btn btn-ghost btn-full" onClick={() => setObStep(0)}>
                    이전
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    onClick={() => {
                      if (!obBirth) {
                        alert('생년월일을 선택해 주세요');
                        return;
                      }
                      const nextProfile = { ...profile, birthDate: obBirth, gender: obGender };
                      setProfileState(nextProfile);
                      if (clientId) saveProfile(clientId, nextProfile);
                      setObStep(2);
                    }}
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
            {obStep === 2 && (
              <div id="onboardingStep2" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="ob-form-header">
                  <h2>키와 몸무게를 알려주세요</h2>
                  <p className="ob-lead">BMI·비만 여부 판단에 쓸게요. 나중에 설정에서 수정할 수 있어요</p>
                </div>
                {/* 키·몸무게 입력란 너비 동일하게 (form-group-wide → CSS min-width) */}
                <div className="form-group form-group-wide">
                  <label>키 (cm)</label>
                  <input
                    type="number"
                    id="obHeight"
                    placeholder="예: 170.5"
                    min={1}
                    max={250}
                    value={obHeight}
                    onChange={(e) => setObHeight(e.target.value)}
                  />
                </div>
                <div className="form-group form-group-wide">
                  <label>몸무게 (kg)</label>
                  <input
                    type="number"
                    id="obWeight"
                    placeholder="예: 61.7"
                    min={1}
                    max={300}
                    step={0.1}
                    value={obWeight}
                    onChange={(e) => setObWeight(e.target.value)}
                  />
                </div>
                <p className="ob-safety">
                  <span className="ob-safety-ico" aria-hidden>
                    <IconLock size={16} />
                  </span>
                  입력한 정보는 기기에만 안전하게 저장돼요
                </p>
                <div className="ob-step-actions">
                  <button type="button" className="btn btn-ghost btn-full" onClick={() => setObStep(1)}>
                    이전
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    onClick={() => {
                      const h = parseFloat(obHeight);
                      const w = parseFloat(obWeight);
                      if (!isFinite(h) || !isFinite(w) || h <= 0 || w <= 0) {
                        alert('키와 몸무게를 입력해 주세요');
                        return;
                      }
                      setObSummaryBirth(birthDisplay(profile.birthDate || obBirth));
                      const nextProfile = { ...profile, heightCm: h, weightKg: w };
                      setProfileState(nextProfile);
                      if (clientId) saveProfile(clientId, nextProfile);
                      setObSummaryGender(obGender === 'female' ? '여성' : '남성');
                      setObSummaryHeight(obHeight + ' cm');
                      setObSummaryWeight(obWeight + ' kg');
                      setObStep(3);
                    }}
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
            {obStep === 3 && (
              <div id="onboardingStep3" style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 className="ob-confirm-title">입력한 정보가 맞나요?</h2>
                <div className="ob-summary-card">
                  <div className="ob-summary-row">
                    <span className="label">생년월일</span>
                    <span className="value">{obSummaryBirth}</span>
                  </div>
                  <div className="ob-summary-row">
                    <span className="label">성별</span>
                    <span className="value">{obSummaryGender}</span>
                  </div>
                  <div className="ob-summary-row">
                    <span className="label">키</span>
                    <span className="value">{obSummaryHeight}</span>
                  </div>
                  <div className="ob-summary-row">
                    <span className="label">몸무게</span>
                    <span className="value">{obSummaryWeight}</span>
                  </div>
                </div>
                <p className="ob-confirm-note">
                  생년월일·성별은 한 번 설정하면 바꿀 수 없어요. 키·몸무게는 설정에서 수정할 수 있어요
                </p>
                <p className="ob-safety">
                  <span className="ob-safety-ico" aria-hidden>
                    <IconLock size={16} />
                  </span>
                  입력한 정보는 기기에만 안전하게 저장돼요
                </p>
                <div className="ob-confirm-actions">
                  <button type="button" className="btn btn-ghost btn-full" onClick={() => setObStep(2)}>
                    수정
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    onClick={() => {
                      setProfileState((p) => ({ ...p, onboardingLocked: true }));
                      saveProfile(clientId, { ...profile, onboardingLocked: true });
                      setOnboardingCompleted(true);
                      setShowOnboarding(false);
                      setShowOnboardingCompleteModal(true);
                      refreshHistory();
                    }}
                  >
                    완료
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showOnboardingCompleteModal && (
        <div className="onboarding-complete-toast" role="status" aria-live="polite">
          <span className="onboarding-complete-icon" aria-hidden>
            <IconCheck size={26} strokeWidth={2.5} />
          </span>
          <span className="onboarding-complete-text">반영 완료</span>
        </div>
      )}

      <div id="app">
        <div id="homeView" className={showHome ? '' : 'hidden'}>
          <div className="home-scroll" id="homeScroll">
            {showHome &&
              !showResult &&
              !showCamera &&
              !capturedPreviewDataUrl &&
              !showSettings &&
              !showInfoIngredient &&
              !showInfoCriteria &&
              !showInfoPhoto &&
              !showAddMeasurement &&
              !showMeasurementHistory &&
              !showBmiGraph && (
                <div className="home-top-bar">
                  <button type="button" className="btn-settings-home" title="설정" aria-label="설정" onClick={openSettings}>
                    <IconSettings size={22} />
                  </button>
                </div>
              )}
            <div className="hero-section" aria-label="소개">
              <div className="hero-icon-cluster" aria-hidden>
                <div className="hero-icon-core">
                  <IconLeaf size={52} />
                </div>
              </div>
              <h2 className="hero-title">
                포장만 찍으면
                <br />
                원재료·NOVA·영양표까지 알려줄게요
              </h2>
            </div>
            <div className="info-cards-wrap">
              <button type="button" className="info-card" aria-label="이런 성분을 분석해요" onClick={() => setShowInfoIngredient(true)}>
                <span className="icon-wrap" aria-hidden>
                  <IconSearch size={32} />
                </span>
                <span className="label">이런 성분을 분석해요</span>
                <span className="chevron" aria-hidden>›</span>
              </button>
              <button type="button" className="info-card" aria-label="내 건강에 맞게 판단해요" onClick={() => setShowInfoCriteria(true)}>
                <span className="icon-wrap" aria-hidden>
                  <IconHeart size={32} />
                </span>
                <span className="label">내 건강에 맞게 판단해요</span>
                <span className="chevron" aria-hidden>›</span>
              </button>
              <button type="button" className="info-card" aria-label="이렇게 촬영해요" onClick={() => setShowInfoPhoto(true)}>
                <span className="icon-wrap" aria-hidden>
                  <IconCamera size={32} />
                </span>
                <span className="label">이렇게 촬영해요</span>
                <span className="chevron" aria-hidden>›</span>
              </button>
            </div>
            {loading && (
              <div className="loading-callout-wrap">
                <div className="card" id="loadingCard">
                  <div className="loading">
                    <span className="loading-spinner" aria-hidden>
                      <IconSpinner size={28} />
                    </span>
                    <span id="loadingText">{loadingText}</span>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="error-msg" id="errorCard">
                <span className="error-icon" aria-hidden>
                  <IconAlert size={28} />
                </span>
                <span className="error-text">{error}</span>
              </div>
            )}
            {history.length > 0 && (
              <div id="historyList" className="history-list-wrap">
                <h2 className="history-list-title">스캔한 기록</h2>
                {history.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="history-item"
                      data-id={item.id}
                      onClick={() => {
                        setCurrentResult(item.result);
                        setCurrentHistoryId(item.id);
                        renderResult(item.result, item);
                        setShowHome(false);
                        setShowResult(true);
                        setShowDeleteArea(true);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {NOVA_IMG[item.maxRiskScore] ? (
                        <img src={NOVA_IMG[item.maxRiskScore]} alt="" className="history-nova-icon" referrerPolicy="no-referrer" />
                      ) : (
                        <span className={`risk-dot risk-${item.maxRiskScore}`} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="product-name">
                          {(item.customProductName || item.productName || '').trim() || '제품명 없음'}
                        </div>
                        <div className="meta">
                          {item.companyName ? item.companyName + ' · ' : ''}
                          {formatRelativeTime(item.scannedAt)}
                        </div>
                      </div>
                      <span className="meta">›</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="bottom-bar">
            <div className="fab-wrap">
              <div className="fab-row">
                <div className="fab-col">
                  <button type="button" className="fab" id="fabUpload" aria-label="카메라로 포장 촬영" onClick={triggerUpload}>
                    <span className="fab-pulse" aria-hidden />
                    <span className="fab-pulse fab-pulse--2" aria-hidden />
                    <span className="fab-pulse fab-pulse--3" aria-hidden />
                    <IconCamera size={34} />
                  </button>
                  <span className="fab-label">촬영</span>
                </div>
                <div className="fab-col">
                  <button
                    type="button"
                    className="fab-secondary"
                    id="fabGallery"
                    aria-label="앨범에서 사진 선택"
                    onClick={() => {
                      setCapturedPreviewDataUrl(null);
                      setError('');
                      setUploadSource('gallery');
                      setCaptureStep(1);
                      setRawImageBase64(null);
                      setNutritionImageBase64(null);
                      galleryInputRef.current?.click();
                    }}
                  >
                    <IconImage size={26} />
                  </button>
                  <span className="fab-secondary-label">앨범</span>
                </div>
              </div>
              <span className="fab-label" style={{ marginTop: 4 }}>
                {captureStep === 1
                  ? uploadSource === 'gallery'
                    ? '1/2 · 원재료(앨범 선택)'
                    : '1/2 · 원재료(촬영)'
                  : uploadSource === 'gallery'
                    ? '2/2 · 영양성분표(앨범 선택)'
                    : '2/2 · 영양성분표(촬영)'}
              </span>
            </div>
          </div>
        </div>

        <div id="resultView" className={showResult ? 'visible' : ''} style={{ display: showResult ? 'flex' : 'none' }}>
          <div className="result-toolbar">
            <button
              type="button"
              className="result-close-x"
              aria-label="닫기"
              onClick={() => {
                setShowResult(false);
                setShowHome(true);
                setShowDeleteArea(false);
                setCurrentHistoryId(null);
              }}
            >
              ×
            </button>
          </div>
          <div ref={resultScrollRef} className={`result-scroll ${editingName !== null ? 'editing-name' : ''}`} id="resultScroll">
            {editingName !== null && (
              <div className="card" id="productNameCardEdit">
                <div className="form-group">
                  <label>식품명</label>
                  <div className="edit-row">
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      placeholder="식품명"
                    />
                    <button type="button" onClick={() => setEditingName(null)}>취소</button>
                    <button
                      type="button"
                      className="save"
                      onClick={() => {
                        const newName = editNameValue.trim();
                        if (currentHistoryId) {
                          updateProductName(clientId, currentHistoryId, newName || null);
                          const item = history.find((i) => i.id === currentHistoryId);
                          if (item) {
                            item.customProductName = newName || null;
                            if (currentResult) renderResult(currentResult, item);
                          }
                          refreshHistory();
                        }
                        setEditingName(null);
                      }}
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div id="resultContent" dangerouslySetInnerHTML={{ __html: resultContentHtml }} />
            {showDeleteArea && (
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-full"
                  style={{ background: 'transparent', color: 'var(--risk)' }}
                  onClick={() => {
                    if (!currentHistoryId) return;
                    if (!confirm('이 스캔 기록을 삭제할까요?')) return;
                    deleteFromHistory(clientId, currentHistoryId);
                    setCurrentHistoryId(null);
                    setShowResult(false);
                    setShowHome(true);
                    setShowDeleteArea(false);
                    refreshHistory();
                  }}
                >
                  이 기록 삭제
                </button>
              </div>
            )}
            <div className="disclaimer">
              이 정보는 참고용이에요.
              <br />
              정확한 건강 상담은 전문의와 함께하세요.
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div
          id="settingsModal"
          className="modal settings-modal visible"
          role="dialog"
          aria-label="설정"
          onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            {settingsPage === 'list' && (
              <div id="settingsListPage" className="settings-page visible">
                <div className="settings-list-header">
                  <h2>설정</h2>
                  <button type="button" className="settings-close-x" aria-label="닫기" onClick={() => setShowSettings(false)}>
                    ×
                  </button>
                </div>
                <button type="button" className="settings-row" aria-label="화면 설정" onClick={() => setSettingsPage('display')}>
                  <span className="row-icon" aria-hidden>
                    <IconSun size={26} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">화면 설정</span>
                    <span className="row-subtitle">{settingsDisplaySubtitle}</span>
                  </span>
                  <span className="row-chevron" aria-hidden>›</span>
                </button>
                <button type="button" className="settings-row" aria-label="개인 맞춤화" onClick={() => setSettingsPage('profile')}>
                  <span className="row-icon" aria-hidden>
                    <IconUser size={26} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">개인 맞춤화</span>
                    <span className="row-subtitle">{settingsProfileSubtitle}</span>
                  </span>
                  <span className="row-chevron" aria-hidden>›</span>
                </button>
                <button
                  type="button"
                  className="settings-row settings-row-danger"
                  aria-label="모든 기록 삭제"
                  onClick={() => {
                    if (!clientId) return;
                    if (!window.confirm('스캔 기록과 개인 맞춤화 정보(출생연도·성별·키·몸무게 등)를 모두 삭제할까요?\n삭제 후에는 복구할 수 없어요.')) return;
                    clearAllData(clientId);
                    const state = loadState(clientId);
                    setProfileState(state.profile || {});
                    setHistoryList(state.history || []);
                    setOnboardingCompleted(false);
                    setShowOnboarding(true);
                    setShowSettings(false);
                    setShowHome(true);
                    setShowResult(false);
                    setShowDeleteArea(false);
                    setCurrentHistoryId(null);
                    setCurrentResult(null);
                    const today = new Date();
                    setObStep(0);
                    setObBirth(today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0'));
                    setObGender('male');
                    setObHeight('');
                    setObWeight('');
                    setObSummaryBirth('—');
                    setObSummaryGender('—');
                    setObSummaryHeight('—');
                    setObSummaryWeight('—');
                  }}
                >
                  <span className="row-icon" aria-hidden>
                    <IconTrash size={26} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">모든 기록 삭제</span>
                    <span className="row-subtitle">스캔 기록·개인 맞춤화 정보 전체 삭제</span>
                  </span>
                  <span className="row-chevron" aria-hidden>›</span>
                </button>
              </div>
            )}
            {settingsPage === 'display' && (
              <div id="settingsDisplayPage" className="settings-page visible">
                <button type="button" className="settings-back" onClick={() => setSettingsPage('list')}>
                  ‹ 설정
                </button>
                <h2>화면 설정</h2>
                <div className="form-group">
                  <label>화면 모드</label>
                  <div className="mode-options" id="appearanceOptions">
                    {(['system', 'light', 'dark'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`mode-option ${(profile.appearanceMode || 'system') === mode ? 'selected' : ''}`}
                        data-mode={mode}
                        onClick={() => {
                          const newMode = mode === 'system' ? undefined : mode;
                          setProfileState((p) => ({ ...p, appearanceMode: newMode }));
                          applyAppearance(newMode || 'system');
                          saveProfile(clientId, { ...profile, appearanceMode: newMode });
                        }}
                      >
                        <span>
                          {mode === 'system' ? '시스템 설정' : mode === 'light' ? '라이트 모드' : '다크 모드'}
                        </span>
                        <span className="check" aria-hidden style={{ display: (profile.appearanceMode || 'system') === mode ? '' : 'none' }}>
                          <IconCheck size={22} strokeWidth={2.5} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {settingsPage === 'profile' && (
              <div id="settingsProfilePage" className="settings-page visible">
                <div className="settings-profile-header">
                  <button type="button" className="settings-back" onClick={() => setSettingsPage('list')}>
                    ‹ 설정
                  </button>
                  <button type="button" className="settings-close-x" aria-label="닫기" onClick={() => setShowSettings(false)}>
                    ×
                  </button>
                </div>
                <h2>개인 맞춤화</h2>
                <div className="form-group settings-readonly-row">
                  <span className="label">생년월일</span>
                  <span className="value">{birthDisplay(profile.birthDate || '')}</span>
                </div>
                {profile.onboardingLocked ? (
                  <div className="form-group settings-readonly-row">
                    <span className="label">성별</span>
                    <span className="value">{profile.gender === 'female' ? '여성' : '남성'}</span>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>성별</label>
                    <select
                      id="profileGender"
                      value={profileGender}
                      onChange={(e) => {
                        const v = e.target.value as 'male' | 'female';
                        setProfileGender(v);
                        if (clientId) {
                          const p = { ...profile, gender: v };
                          setProfileState(p);
                          saveProfile(clientId, p);
                        }
                      }}
                    >
                      <option value="male">남성</option>
                      <option value="female">여성</option>
                    </select>
                  </div>
                )}
                <div className="form-group" style={{ padding: '16px 20px', background: 'var(--card)', border: '1px solid var(--card-stroke)', borderRadius: 14, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>키·몸무게</span>
                    <button
                      type="button"
                      className="icon-btn-circle"
                      aria-label="기록 목록"
                      onClick={() => setShowMeasurementHistory(true)}
                      style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--card-stroke)', background: 'var(--card)', color: 'var(--accent)' }}
                    >
                      <span aria-hidden>
                        <IconClipboard size={18} />
                      </span>
                    </button>
                  </div>
                  <div style={{ color: 'var(--text2)', fontSize: '1rem', marginBottom: 12 }}>
                    {(() => {
                      const { heightCm: h, weightKg: w } = getLatestHeightWeight(profile);
                      return h != null && h > 0 && w != null && w > 0
                        ? `키 ${Math.round(h)} cm · 몸무게 ${w.toFixed(1)} kg`
                        : '기록 없음';
                    })()}
                  </div>
                  <button
                    type="button"
                    className="btn-text-accent"
                    onClick={() => setShowAddMeasurement(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0', color: 'var(--accent)', fontWeight: 500 }}
                  >
                    <IconPlus size={18} /> 키·몸무게 기록 추가
                  </button>
                </div>
                {(() => {
                  const effectiveProfile = getProfileWithLatestMeasurement(profile);
                  const bmiInfo = getBMICategory(effectiveProfile);
                  if (!bmiInfo) return null;
                  return (
                    <div className="bmi-display" style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--card)', border: '1px solid var(--card-stroke)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>BMI (현재)</span>
                        <span style={{ marginLeft: 8, color: 'var(--text2)' }}>{bmiInfo.bmi.toFixed(1)} · {bmiInfo.category}</span>
                        {isObeseByProfile(effectiveProfile) && <span style={{ marginLeft: 6, fontSize: '0.9rem', color: 'var(--risk)' }}>(비만)</span>}
                      </div>
                      <button
                        type="button"
                        className="icon-btn-circle"
                        aria-label="비만도 추이"
                        onClick={() => setShowBmiGraph(true)}
                        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--card-stroke)', background: 'var(--card)', color: 'var(--accent)' }}
                      >
                        <span aria-hidden>
                          <IconChart size={18} />
                        </span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info modals */}
      {showInfoIngredient && (
        <div
          className="modal info-sheet visible"
          role="dialog"
          aria-label="이런 성분을 분석해요"
          onClick={(e) => e.target === e.currentTarget && setShowInfoIngredient(false)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2 className="sheet-title">이런 성분을 분석해요</h2>
              <button type="button" className="sheet-close-x" aria-label="닫기" onClick={() => setShowInfoIngredient(false)}>×</button>
            </div>
            <div className="sheet-icon-wrap" aria-hidden>
              <div className="sheet-icon">
                <IconFlask size={48} />
              </div>
            </div>
            <div className="info-category">
              <h4>
                <span className="ico">
                  <IconPlus size={26} />
                </span>{' '}
                첨가물
              </h4>
              <ul><li>보존료, 산화방지제, 착향료, 증점제, 유화제 등</li></ul>
            </div>
            <div className="info-category">
              <h4>
                <span className="ico">
                  <IconDroplet size={26} />
                </span>{' '}
                감미료
              </h4>
              <ul><li>아스파탐, 수크랄로스, 아세설팜칼륨, 스테비아 등</li></ul>
            </div>
            <div className="info-category">
              <h4>
                <span className="ico">
                  <IconPalette size={26} />
                </span>{' '}
                색소
              </h4>
              <ul><li>타르색소, 카라멜색소, 코치닐 등</li></ul>
            </div>
            <div className="info-category">
              <h4>
                <span className="ico">
                  <IconAlert size={26} />
                </span>{' '}
                주의 성분
              </h4>
              <ul><li>나트륨, 당, 포화지방, 트랜스지방 등 과다 시 주의 문구</li></ul>
            </div>
          </div>
        </div>
      )}

      {showInfoCriteria && (
        <div
          className="modal info-sheet visible"
          role="dialog"
          aria-label="내 건강에 맞게 판단해요"
          onClick={(e) => e.target === e.currentTarget && setShowInfoCriteria(false)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2 className="sheet-title">내 건강에 맞게 판단해요</h2>
              <button type="button" className="sheet-close-x" aria-label="닫기" onClick={() => setShowInfoCriteria(false)}>×</button>
            </div>
            <div className="sheet-icon-wrap" aria-hidden>
              <div className="sheet-icon">
                <IconHeart size={48} />
              </div>
            </div>
            <p style={{ margin: '0 0 16px', color: 'var(--text2)', fontSize: '1.15rem', lineHeight: 1.6 }}>
              한국형 NOVA 분류를 기준으로, 원재료와 가공 정도를 보고 그룹을 판정해요.
            </p>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={`info-category info-category-nova info-category-nova-${n}`}>
                <h4>
                  <img src={NOVA_IMG[n]} alt="" className="nova-sheet-icon" referrerPolicy="no-referrer" />
                  {NOVA_NAMES[n]}
                </h4>
                <ul>
                  <li>
                    {n === 1 && '자연 그대로에 가깝고, 원재료 구조를 유지해요.'}
                    {n === 2 && '조리용 소금, 설탕, 기름처럼 요리에 쓰는 재료예요.'}
                    {n === 3 && '원재료 특성을 많이 유지한 가공 식품이에요.'}
                    {n === 4 && (
                      <>
                        원재료 구조가 사라지고, 산업적 첨가물이 많이 들어간 식품이에요.{" "}
                        초가공(Group IV)은 분석 시 <strong>4A</strong>(경계형 초가공),{' '}
                        <strong>4B</strong>(명확한 초가공), <strong>4C</strong>(고도 초가공)로
                        더 나누어 볼 수 있어요.
                      </>
                    )}
                  </li>
                </ul>
              </div>
            ))}
            <p style={{ margin: '12px 0 0', color: 'var(--text2)', fontSize: '1.05rem', lineHeight: 1.5 }}>
              나이·성별·키·몸무게로 BMI와 비만 판정을 참고해, 영양 표가 있으면 일일 기준 대비 비율·맞춤 안내를 드려요.
            </p>
          </div>
        </div>
      )}

      {showInfoPhoto && (
        <div
          className="modal info-sheet visible"
          role="dialog"
          aria-label="이렇게 촬영해요"
          onClick={(e) => e.target === e.currentTarget && setShowInfoPhoto(false)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2 className="sheet-title">이렇게 촬영해요</h2>
              <button type="button" className="sheet-close-x" aria-label="닫기" onClick={() => setShowInfoPhoto(false)}>×</button>
            </div>
            <div className="sheet-icon-wrap" aria-hidden>
              <div className="sheet-icon">
                <IconCamera size={48} />
              </div>
            </div>
            <div className="guide-step">
              <span className="num">1</span>
              <span className="txt">포장 뒷면의 원재료명이 보이게 해 주세요.</span>
            </div>
            <div className="guide-step">
              <span className="num">2</span>
              <span className="txt">글자가 선명하게 보이도록 <strong>가까이</strong> 찍어 주세요.</span>
            </div>
            <div className="guide-step">
              <span className="num">3</span>
              <span className="txt">다음 단계에서 <strong>영양성분표</strong>를 <strong>따로</strong> 찍어 주세요.</span>
            </div>
            <div className="guide-step">
              <span className="num">4</span>
              <span className="txt">
                글자가 흐리지 않게, <strong>그림자가 지지 않게</strong> 밝은 곳에서 찍어 주세요.
              </span>
            </div>
            <div className="photo-guide-example-wrap">
              <div className="photo-guide-example-title">촬영 예시</div>
              <img
                className="photo-guide-example-img"
                src={PHOTO_GUIDE_EXAMPLE_URL}
                alt="촬영 예시"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}

      {/* 키·몸무게 기록 추가 시트 */}
      {showAddMeasurement && (
        <AddBodyMeasurementSheet
          onAdd={(date, h, w) => {
            if (clientId) {
              addBodyMeasurement(clientId, date, h, w);
              setProfileState(loadState(clientId).profile || {});
            }
            setShowAddMeasurement(false);
          }}
          onCancel={() => setShowAddMeasurement(false)}
        />
      )}

      {/* 키·몸무게 기록 목록 시트 */}
      {showMeasurementHistory && (
        <BodyMeasurementHistorySheet
          measurements={[...(profile.bodyMeasurements || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())}
          onDelete={(index) => {
            if (clientId) {
              removeBodyMeasurement(clientId, index);
              setProfileState(loadState(clientId).profile || {});
            }
          }}
          onClose={() => setShowMeasurementHistory(false)}
        />
      )}

      {/* 비만도 추이 시트 */}
      {showBmiGraph && (
        <BMIGraphSheet
          measurements={[...(profile.bodyMeasurements || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())}
          onClose={() => setShowBmiGraph(false)}
        />
      )}
    </>
  );
}

function bmiFromMeasurement(m: BodyMeasurement): number {
  if (!m.heightCm || m.heightCm <= 0) return 0;
  const h = m.heightCm / 100;
  return m.weightKg / (h * h);
}

function AddBodyMeasurementSheet({
  onAdd,
  onCancel,
}: {
  onAdd: (date: string, heightCm: number, weightKg: number) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const canAdd =
    height !== '' &&
    weight !== '' &&
    (() => {
      const h = parseFloat(height);
      const w = parseFloat(weight);
      return h > 0 && h < 250 && w > 0 && w < 300;
    })();
  return (
    <div className="modal info-sheet visible" role="dialog" aria-label="키·몸무게 기록 추가" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2 className="sheet-title">키·몸무게 기록 추가</h2>
          <button type="button" className="sheet-close-x" aria-label="닫기" onClick={onCancel}>×</button>
        </div>
        <div className="form-group">
          <label>날짜</label>
          <input type="date" value={date} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>키 (cm)</label>
          <input type="number" placeholder="예: 170" min={1} max={250} value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div className="form-group">
          <label>몸무게 (kg)</label>
          <input type="number" placeholder="예: 65" min={1} max={300} step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>취소</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={!canAdd} onClick={() => canAdd && onAdd(new Date(date).toISOString(), parseFloat(height), parseFloat(weight))}>추가</button>
        </div>
      </div>
    </div>
  );
}

function BodyMeasurementHistorySheet({
  measurements,
  onDelete,
  onClose,
}: {
  measurements: BodyMeasurement[];
  onDelete: (index: number) => void;
  onClose: () => void;
}) {
  const dateStr = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ko-KR');
  };
  return (
    <div className="modal info-sheet visible" role="dialog" aria-label="기록 목록" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2 className="sheet-title">기록 목록</h2>
          <button type="button" className="sheet-close-x" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        {measurements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            <div className="empty-state-icon-wrap" aria-hidden>
              <span className="empty-state-icon">
                <IconClipboard size={40} />
              </span>
            </div>
            <div>아직 기록이 없어요</div>
          </div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-stroke)', color: 'var(--text2)', fontWeight: 600 }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>날짜</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', width: 52 }}>키</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', width: 56 }}>몸무게</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', width: 48 }}>BMI</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {measurements.map((m, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--card-stroke)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{dateStr(m.date)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text2)' }}>{Math.round(m.heightCm)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text2)' }}>{m.weightKg.toFixed(1)}</td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text2)' }}>{bmiFromMeasurement(m).toFixed(1)}</td>
                    <td style={{ padding: 4 }}>
                      <button
                        type="button"
                        aria-label="삭제"
                        style={{ color: 'var(--risk)', padding: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => onDelete(idx)}
                      >
                        <IconTrash size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BMIGraphSheet({ measurements, onClose }: { measurements: BodyMeasurement[]; onClose: () => void }) {
  const bmiMin = 15;
  const bmiMax = 35;
  const leftPad = 36;
  const bottomPad = 28;
  const sorted = measurements.length ? [...measurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) : [];
  const dateLabel = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : (d.getMonth() + 1) + '/' + d.getDate();
  };

  if (sorted.length < 2) {
    return (
      <div className="modal info-sheet visible" role="dialog" aria-label="비만도 추이" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-header">
            <h2 className="sheet-title">비만도 추이</h2>
            <button type="button" className="sheet-close-x" aria-label="닫기" onClick={onClose}>×</button>
          </div>
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            <div className="empty-state-icon-wrap" aria-hidden>
              <span className="empty-state-icon">
                <IconChart size={40} />
              </span>
            </div>
            <div>키·몸무게 기록을 2개 이상 추가하면<br />그래프를 볼 수 있어요</div>
          </div>
        </div>
      </div>
    );
  }

  const chartW = 280;
  const chartH = 220;
  const points = sorted.map((m, i) => {
    const bmi = Math.max(bmiMin, Math.min(bmiMax, bmiFromMeasurement(m)));
    const x = leftPad + (chartW * i) / Math.max(1, sorted.length - 1);
    const yNorm = (bmi - bmiMin) / (bmiMax - bmiMin);
    const y = chartH * (1 - yNorm);
    return { x, y, bmi, label: dateLabel(m.date) };
  });
  const tickValues = [15, 20, 25, 30, 35];
  const xLabels = [0, Math.floor(sorted.length / 2), sorted.length - 1].filter((_, i, arr) => arr.indexOf(_) === i);

  return (
    <div className="modal info-sheet visible" role="dialog" aria-label="비만도 추이" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2 className="sheet-title">비만도 추이</h2>
          <button type="button" className="sheet-close-x" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 12 }}>x축: 날짜 · y축: 비만도(BMI)</p>
        <div className="bmi-chart-surface">
        <svg viewBox={`0 0 ${leftPad + chartW + 8} ${chartH + bottomPad}`} style={{ width: '100%', maxWidth: 320, height: 'auto', display: 'block' }}>
          {tickValues.map((v) => {
            const yNorm = (v - bmiMin) / (bmiMax - bmiMin);
            const y = chartH * (1 - yNorm);
            return (
              <g key={v}>
                <text x={leftPad / 2} y={y} textAnchor="middle" fontSize="10" fill="var(--text2)" fontFamily="monospace">{v}</text>
                <line x1={leftPad} y1={y} x2={leftPad + chartW} y2={y} stroke="var(--card-stroke)" strokeDasharray="4 4" strokeOpacity={0.6} />
              </g>
            );
          })}
          <line x1={leftPad} y1={chartH} x2={leftPad + chartW} y2={chartH} stroke="var(--card-stroke)" strokeWidth={1} />
          <line x1={leftPad} y1={0} x2={leftPad} y2={chartH} stroke="var(--card-stroke)" strokeWidth={1} />
          <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--accent)" />
          ))}
          {xLabels.map((idx) => {
            const p = points[idx];
            if (!p) return null;
            return (
              <text key={idx} x={p.x} y={chartH + bottomPad / 2} textAnchor="middle" fontSize="10" fill="var(--text2)">{p.label}</text>
            );
          })}
        </svg>
        </div>
      </div>
    </div>
  );
}
