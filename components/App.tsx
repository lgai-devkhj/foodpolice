'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type MutableRefObject,
  type CSSProperties,
} from 'react';
import { getClientId } from '@/lib/clientId';
import type { BmiTier } from '@/lib/gemini-prompts';
import {
  loadState,
  setProfile as saveProfile,
  getProfile,
  getHistory,
  addToHistory,
  updateHistoryResult,
  updateProductName,
  deleteFromHistory,
  clearAllData,
  addBodyMeasurement,
  removeBodyMeasurement,
  compareBodyMeasurementsAsc,
  compareBodyMeasurementsDesc,
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
  CAPTURE_GUIDE_INGREDIENT_EXAMPLES,
  CAPTURE_GUIDE_NUTRIENT_EXAMPLES,
} from '@/lib/constants';
import {
  ALTERNATIVE_NOT_FOUND_MESSAGE,
  ALT_FOOD_OPTION_LINE_RE,
  ALT_FOOD_REASON_LINE_RE,
} from '@/lib/alternative-food-normalize';
import type { AlternativeFoodJsonRoot } from '@/lib/alternative-food-json';
import { isSameProductLineOrWeightOnlyVariant, productIdentityCore } from '@/lib/alternative-food-json';
import { DAILY_REFERENCE } from '@/lib/nutrition-daily';
import type { NutritionDailyPercent, NutritionFacts } from '@/lib/store';
import {
  IconLeaf,
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

/** bodyMeasurements 중 최신 기록(날짜 → 같은 날이면 마지막에 추가한 순). 없으면 profile 값 */
function getLatestHeightWeight(profile: Profile): { heightCm?: number | null; weightKg?: number | null } {
  const list = profile.bodyMeasurements || [];
  if (list.length === 0) return { heightCm: profile.heightCm, weightKg: profile.weightKg };
  const sorted = [...list].sort(compareBodyMeasurementsDesc);
  const latest = sorted[0];
  return { heightCm: latest.heightCm, weightKg: latest.weightKg };
}

/** 표시·BMI용: 최신 기록 반영한 프로필 */
function getProfileWithLatestMeasurement(profile: Profile): Profile {
  const { heightCm, weightKg } = getLatestHeightWeight(profile);
  return { ...profile, heightCm, weightKg };
}

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

/** API·생성 문구에 남은 ** 표기 제거 */
function stripMarkdownBold(s: string): string {
  if (!s) return '';
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
}

type CoachRect = { top: number; left: number; width: number; height: number };

/** 튜토리얼 진행 단계 (코치 말풍선은 fab·미리보기 두 구간만) */
const TUTORIAL_PHASE_SEQUENCE = [
  'fab',
  'overlay_ingredient',
  'camera_ingredient',
  'preview_ingredient',
  'overlay_nutrient',
  'camera_nutrient',
  'preview_analyze',
] as const;

type TutorialPhase = (typeof TUTORIAL_PHASE_SEQUENCE)[number];

const TUTORIAL_COACH_PHASES = new Set<TutorialPhase>([
  'fab',
  'preview_ingredient',
  'preview_analyze',
]);

/** 미리보기 안내는 촬영 화면이 아닐 때·미리보기가 실제로 떴을 때만 (phase만으로 코치 켜지면 문구가 어긋남) */
function shouldShowTutorialCoach(
  phase: TutorialPhase,
  opts: {
    showCamera: boolean;
    capturedPreviewDataUrl: string | null;
    captureStep: 1 | 2;
  },
): boolean {
  if (!TUTORIAL_COACH_PHASES.has(phase)) return false;
  if (phase === 'fab') {
    return !opts.showCamera && !opts.capturedPreviewDataUrl;
  }
  if (phase === 'preview_ingredient') {
    return (
      !!opts.capturedPreviewDataUrl &&
      opts.captureStep === 1 &&
      !opts.showCamera
    );
  }
  if (phase === 'preview_analyze') {
    return (
      !!opts.capturedPreviewDataUrl &&
      opts.captureStep === 2 &&
      !opts.showCamera
    );
  }
  return false;
}

function tutorialPhaseIndex(phase: TutorialPhase): number {
  return TUTORIAL_PHASE_SEQUENCE.indexOf(phase);
}

function tutorialCoachMessage(phase: TutorialPhase, desk: boolean): string {
  switch (phase) {
    case 'fab':
      return desk
        ? '아래 업로드를 눌러 주세요. 예시 보고 원재료 → 영양표 순으로 두 장 고르면 돼요.'
        : '아래 촬영을 눌러 주세요. 예시 확인하고 원재료 → 영양표 순으로 찍으면 돼요.';
    case 'preview_ingredient':
      return desk
        ? '이 사진으로 갈까요? 다음을 누르면 영양표 사진 고르는 단계예요.'
        : '괜찮으면 다음을 눌러 주세요. 이어서 영양표를 찍을게요.';
    case 'preview_analyze':
      return desk
        ? '마지막이에요. 분석하기를 누르면 결과가 나와요.'
        : '분석하기를 누르면 NOVA랑 영양 비율을 볼 수 있어요.';
    default:
      return '';
  }
}

type TutorialFocusDecoration =
  | { kind: 'arrow'; rect: CoachRect }
  | { kind: 'ring'; rect: CoachRect }
  | null;

/** 화살표·말풍선만 (스포트라이트 딤 없음) */
function TutorialCoachOverlay({
  active,
  holeRect,
  focusDecoration,
  message,
  stepIndex,
  stepTotal,
  onSkip,
}: {
  active: boolean;
  holeRect: CoachRect | null;
  /** 셔터: 화살표 | null: 추가 강조 없음(확인 버튼 등) */
  focusDecoration: TutorialFocusDecoration;
  message: string;
  stepIndex: number;
  stepTotal: number;
  onSkip: () => void;
}) {
  if (!active) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const pad = 10;

  const gap = 14;
  const safeTop = 12;
  const safeBottom = Math.max(20, 12);
  const estBubbleH = 200;
  const bubbleW = Math.min(420, Math.max(16, vw - 32));
  const halfW = bubbleW / 2;

  const deco = focusDecoration;
  const arrowRect =
    deco?.kind === 'arrow' && deco.rect.width > 0 && deco.rect.height > 0
      ? deco.rect
      : null;
  const bubbleAnchor: CoachRect | null =
    arrowRect ??
    (holeRect && holeRect.width > 0 && holeRect.height > 0 ? holeRect : null);

  let bubbleClass = 'tutorial-coach-bubble';
  let bubbleStyle: CSSProperties = {};

  if (bubbleAnchor) {
    const holeTop = Math.max(0, bubbleAnchor.top - pad);
    const holeBottom = Math.min(vh, bubbleAnchor.top + bubbleAnchor.height + pad);
    const spaceBelow = vh - holeBottom - safeBottom;
    const spaceAbove = holeTop - safeTop;
    const midY = bubbleAnchor.top + bubbleAnchor.height / 2;
    let placeBelow = midY < vh * 0.52;
    if (spaceBelow < estBubbleH && spaceAbove > spaceBelow) {
      placeBelow = false;
    }
    if (spaceAbove < estBubbleH && spaceBelow > spaceAbove) {
      placeBelow = true;
    }
    const cx = bubbleAnchor.left + bubbleAnchor.width / 2;
    const clampedCx = Math.min(Math.max(cx, halfW + 16), vw - halfW - 16);

    bubbleClass += ' tutorial-coach-bubble--near';
    bubbleStyle = {
      width: bubbleW,
      left: clampedCx,
      transform: 'translateX(-50%)',
    };
    if (placeBelow) {
      bubbleStyle.top = holeBottom + gap;
      bubbleStyle.bottom = 'auto';
    } else {
      bubbleStyle.bottom = vh - holeTop + gap;
      bubbleStyle.top = 'auto';
    }
  } else {
    bubbleClass += ' tutorial-coach-bubble--dock';
  }

  const showRing =
    deco?.kind === 'ring' &&
    deco.rect.width > 0 &&
    deco.rect.height > 0;
  const showArrow =
    deco?.kind === 'arrow' &&
    deco.rect.width > 0 &&
    deco.rect.height > 0;
  const arrowTarget = showArrow ? deco.rect : null;
  const ringTarget = showRing ? deco.rect : null;

  return (
    <div className="tutorial-coach-root" aria-live="polite">
      {showRing && ringTarget && (
        <div
          className="tutorial-coach-ring"
          style={{
            top: ringTarget.top - pad,
            left: ringTarget.left - pad,
            width: ringTarget.width + pad * 2,
            height: ringTarget.height + pad * 2,
          }}
          aria-hidden
        />
      )}
      {showArrow && arrowTarget && (
        <div
          className="tutorial-coach-arrow"
          style={{
            left: arrowTarget.left + arrowTarget.width / 2,
            top: arrowTarget.top - 6,
          }}
          aria-hidden
        >
          <svg width="36" height="44" viewBox="0 0 36 44" className="tutorial-coach-arrow-svg">
            <path
              className="tutorial-coach-arrow-shape"
              d="M18 42 L5 14 L31 14 Z"
            />
          </svg>
        </div>
      )}
      <div className={bubbleClass} style={bubbleStyle}>
        <div className="tutorial-coach-bubble-head">
          <p className="tutorial-coach-step">
            {stepIndex + 1} / {stepTotal}
          </p>
          <button
            type="button"
            className="tutorial-coach-close"
            aria-label="튜토리얼 닫기"
            onClick={onSkip}
          >
            ×
          </button>
        </div>
        {message.trim() !== '' && <p className="tutorial-coach-msg">{message}</p>}
      </div>
    </div>
  );
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
  const hasDaily = daily && Object.keys(daily).length > 0;
  const hasServingLine = !!(nutrition?.servingSizeText);
  const tableRows = nutrition?.tableRows?.filter((r) => r && (r.name || r.amount)) ?? [];
  const hasTableRows = tableRows.length > 0;
  if (!hasDaily && !hasTableRows) return '';

  let html = '<div class="result-details-body result-nutrition">';
  html += hasTableRows
    ? '<p class="meta nutrition-intro-meta">라벨에 적힌 항목을 그대로 막대로 보여줘요. %가 적힌 항목은 그 비율로 표시해요.</p>'
    : '<p class="meta nutrition-intro-meta">막대는 일일 참고치 대비 비율이에요(열량 2000kcal 등 근사 기준).</p>';

  if (nutrition?.servingSizeText) {
    html +=
      '<div class="nutrition-serving-line"><span class="nutrition-leading" aria-hidden="true"></span><span>' +
      escapeHtml(nutrition.servingSizeText) +
      (nutrition.basisIsPerServing === false
        ? ' <span class="meta">(100g·100ml 등 기준일 수 있음)</span>'
        : '') +
      '</span></div>';
  }

  if (hasTableRows) {
    html += '<p class="nutrition-daily-heading">라벨 전체 항목</p>';
    tableRows.forEach((tr) => {
      const name = (tr.name || '').trim() || '항목';
      const amount = (tr.amount || '').trim() || '—';
      const pm = amount.match(/(-?\d+(?:\.\d+)?)\s*%/);
      const pct = pm ? parseFloat(pm[1]) : null;
      const safePct =
        pct != null && Number.isFinite(pct) ? Math.max(0, Math.min(100, Number(pct))) : 0;
      html += '<div style="margin-bottom:14px;">';
      html +=
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;"><span style="color:var(--text);font-weight:500;">' +
        escapeHtml(name) +
        '</span><span style="color:var(--text2);font-size:0.95rem;">' +
        escapeHtml(amount) +
        '</span></div>';
      html +=
        '<div class="nutrition-pct-bar"><div class="' +
        nutritionPctBarClass(safePct) +
        '" style="width:' +
        safePct +
        '%;"></div></div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  type Row = { key: keyof NutritionDailyPercent; label: string; unit: string; dv: number };
  const rows: Row[] = [
    { key: 'calories', label: '열량', unit: '%', dv: DAILY_REFERENCE.caloriesKcal },
    { key: 'sodium', label: '나트륨', unit: '%', dv: DAILY_REFERENCE.sodiumMg },
    { key: 'carbs', label: '탄수화물', unit: '%', dv: DAILY_REFERENCE.carbsG },
    { key: 'sugar', label: '당류', unit: '%', dv: DAILY_REFERENCE.sugarG },
    { key: 'fat', label: '지방', unit: '%', dv: DAILY_REFERENCE.fatG },
    { key: 'saturatedFat', label: '포화지방', unit: '%', dv: DAILY_REFERENCE.saturatedFatG },
    { key: 'transFat', label: '트랜스지방', unit: '%', dv: DAILY_REFERENCE.transFatG },
    { key: 'cholesterol', label: '콜레스테롤', unit: '%', dv: DAILY_REFERENCE.cholesterolMg },
    { key: 'protein', label: '단백질', unit: '%', dv: DAILY_REFERENCE.proteinG },
    { key: 'dietaryFiber', label: '식이섬유', unit: '%', dv: DAILY_REFERENCE.dietaryFiberG },
  ];

  const nutritionAmountPrefix = (r: Row, n: NutritionFacts | null | undefined): string => {
    if (!n) return '';
    if (r.key === 'calories' && n.caloriesKcal != null && Number.isFinite(n.caloriesKcal)) {
      return escapeHtml(String(n.caloriesKcal)) + 'kcal · ';
    }
    if (r.key === 'sodium' && n.sodiumMg != null && Number.isFinite(n.sodiumMg)) {
      return escapeHtml(String(n.sodiumMg)) + 'mg · ';
    }
    if (r.key === 'carbs' && n.carbsG != null && Number.isFinite(n.carbsG)) {
      return escapeHtml(String(n.carbsG)) + 'g · ';
    }
    if (r.key === 'protein' && n.proteinG != null && Number.isFinite(n.proteinG)) {
      return escapeHtml(String(n.proteinG)) + 'g · ';
    }
    if (r.key === 'sugar' && n.sugarG != null && Number.isFinite(n.sugarG)) {
      return escapeHtml(String(n.sugarG)) + 'g · ';
    }
    if (r.key === 'fat' && n.fatG != null && Number.isFinite(n.fatG)) {
      return escapeHtml(String(n.fatG)) + 'g · ';
    }
    if (r.key === 'transFat' && n.transFatG != null && Number.isFinite(n.transFatG)) {
      return escapeHtml(String(n.transFatG)) + 'g · ';
    }
    if (r.key === 'saturatedFat' && n.saturatedFatG != null && Number.isFinite(n.saturatedFatG)) {
      return escapeHtml(String(n.saturatedFatG)) + 'g · ';
    }
    if (r.key === 'cholesterol' && n.cholesterolMg != null && Number.isFinite(n.cholesterolMg)) {
      return escapeHtml(String(n.cholesterolMg)) + 'mg · ';
    }
    if (r.key === 'dietaryFiber' && n.dietaryFiberG != null && Number.isFinite(n.dietaryFiberG)) {
      return escapeHtml(String(n.dietaryFiberG)) + 'g · ';
    }
    return '';
  };

  if (hasDaily && daily) {
    html += '<p class="nutrition-daily-heading">일일 참고치 대비</p>';
    rows.forEach((r) => {
      const pct = daily[r.key];
      if (pct == null || !Number.isFinite(pct)) return;
      const w = Math.min(100, pct);
      const amountPrefix = nutritionAmountPrefix(r, nutrition ?? null);
      html += '<div style="margin-bottom:14px;">';
      html +=
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;"><span style="color:var(--text);font-weight:500;">' +
        escapeHtml(r.label) +
        '</span><span style="color:var(--text2);font-size:0.95rem;">' +
        amountPrefix +
        escapeHtml(String(pct)) +
        escapeHtml(r.unit) +
        ' <span class="meta">(일일 ' +
        escapeHtml(String(r.dv)) +
        (r.key === 'calories'
          ? 'kcal'
          : r.key === 'sodium' || r.key === 'cholesterol'
            ? 'mg'
            : 'g') +
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

/** Perplexity 등 검색 인용 표기 `[1]` `[12]` 제거 */
function stripWebCitationMarkers(text: string): string {
  return text
    .replace(/\[\d+\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function buildAlternativeFoodHtml(
  altText: string,
  fromWebSearch?: boolean,
  scannedProductName?: string
): string {
  if (!altText) return '';

  const scanned = (scannedProductName || '').trim();
  const trimmed = stripWebCitationMarkers(altText).trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as AlternativeFoodJsonRoot;
      const alts = parsed?.alternatives;
      if (Array.isArray(alts) && alts.length > 0) {
        const tierLabel: Record<string, string> = {
          slight: '조금 개선',
          better: '더 나은 선택',
          best: '최적 선택',
        };
        const topMeta: string[] = [];
        const cf = (parsed.currentFood || '').trim();
        const st = (parsed.processingStage || '').trim();
        if (cf) topMeta.push(`<div class="alt-meta">현재 식품: ${escapeHtml(cf)}</div>`);
        if (st) topMeta.push(`<div class="alt-meta">가공 단계: ${escapeHtml(st)}</div>`);
        const seen = new Set<string>();
        const gridItems = alts
          .filter((it) => it && String(it.productName || '').trim() && String(it.reason || '').trim())
          .filter((it) => {
            const name = String(it.productName).trim();
            if (scanned && isSameProductLineOrWeightOnlyVariant(name, scanned)) return false;
            const core = productIdentityCore(name);
            if (!core || seen.has(core)) return false;
            seen.add(core);
            return true;
          })
          .slice(0, 3);
        if (gridItems.length >= 1) {
          const grid = gridItems
            .map((it) => {
              const kicker = escapeHtml(tierLabel[it.tier] || it.tier || '');
              const reason = escapeHtml(String(it.reason || '').trim());
              return (
                '<div class="alt-item">' +
                '<div class="alt-item-row">' +
                '<div class="alt-item-main">' +
                (kicker ? `<div class="alt-kicker">${kicker}</div>` : '') +
                `<div class="alt-product">${escapeHtml(String(it.productName || '').trim())}</div>` +
                (reason ? `<div class="alt-reason">${reason}</div>` : '') +
                '</div></div></div>'
              );
            })
            .join('');
          const disclaimer =
            '<p class="alt-disclaimer">' +
            (fromWebSearch
              ? '검색 결과를 바탕으로 모아둔 제안이에요. 시점·매장마다 품목이 달라질 수 있어요. 사기 전에 라벨만 한번 볼까요?'
              : '먹는 맥락(유형)·라벨 분석을 바탕으로 한 참고용 유형 제안이에요. 특정 브랜드 SKU가 아니라, 마트에서 같은 축으로 찾을 만한 방향이에요. 링크는 검색용이에요.') +
            '</p>';
          return '<div class="alt-block">' + topMeta.join('') + `<div class="alt-grid">${grid}</div>` + disclaimer + '</div>';
        }
      }
    } catch {
      /* 텍스트 형식으로 이어감 */
    }
  }

  const raw = trimmed;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const currentFoodLine = lines.find((l) => /^현재 식품\s*:\s*/.test(l)) || '';
  const stageLine = lines.find((l) => /^가공 단계\s*:\s*/.test(l)) || '';
  const currentFood = currentFoodLine.replace(/^현재 식품\s*:\s*/, '').trim();
  const stage = stageLine.replace(/^가공 단계\s*:\s*/, '').trim();

  const optionRe = ALT_FOOD_OPTION_LINE_RE;
  const reasonRe = ALT_FOOD_REASON_LINE_RE;
  const sourceRe = /^[-–—•]\s*(?:출처|source)\s*[:：]\s*(https?:\/\/\S+)$/i;
  const safeExternalUrl = (value: string): string | null => {
    const src = String(value || '').trim();
    if (!/^https?:\/\//i.test(src)) return null;
    try {
      const u = new URL(src);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  };
  const isValidAlternativeProductText = (value: string): boolean => {
    const cleaned = value.replace(/\*\*/g, '').replace(/[“”"'`]/g, '').trim();
    if (!cleaned) return false;
    if (/^[:：•·\-\–—,./\\|(){}\[\]]+$/.test(cleaned)) return false;
    if (/^(이유|없음|미상|N\/A)$/i.test(cleaned)) return false;
    return /[가-힣A-Za-z0-9]/.test(cleaned) && cleaned.length >= 2;
  };
  const normalizeProductKey = (value: string): string =>
    String(value || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9가-힣]/gi, '')
      .trim();

  type Item = { label: string; product: string; reason: string; sourceUrl: string };
  const items: Item[] = [];
  let lastIdx: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const om = line.match(optionRe);
    if (om) {
      const label = om[2] || '';
      const product = (om[3] || '').trim();
      if (!isValidAlternativeProductText(product)) {
        lastIdx = null;
        continue;
      }
      items.push({ label, product, reason: '', sourceUrl: '' });
      lastIdx = items.length - 1;
      continue;
    }
    const rm = line.match(reasonRe);
    if (rm && lastIdx != null) {
      items[lastIdx].reason = (rm[1] || '').trim();
      continue;
    }
    const sm = line.match(sourceRe);
    if (sm && lastIdx != null) {
      const url = safeExternalUrl(sm[1] || '');
      if (url) items[lastIdx].sourceUrl = url;
      continue;
    }
  }

  const top = [];
  if (currentFood) top.push(`<div class="alt-meta">현재 식품: ${escapeHtml(currentFood)}</div>`);
  if (stage) top.push(`<div class="alt-meta">가공 단계: ${escapeHtml(stage)}</div>`);

  const currentKey = normalizeProductKey(currentFood || scanned);
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const key = normalizeProductKey(it.product);
    if (!key) return false;
    if (scanned && isSameProductLineOrWeightOnlyVariant(it.product, scanned)) return false;
    if (currentKey && (key === currentKey || key.includes(currentKey) || currentKey.includes(key))) {
      return false;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const shown = deduped.slice(0, 3);
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
    const proseParts = lines.filter(
      (l) => !/^현재 식품\s*:/.test(l) && !/^가공 단계\s*:/.test(l) && !/👉\s*더 나은 선택/.test(l)
    );
    const prose = proseParts.join('<br/>').trim();
    if (prose) fallbackNote = prose;
  }

  const disclaimer =
    '<p class="alt-disclaimer">' +
    (fromWebSearch
      ? '검색 결과를 바탕으로 모아둔 제안이에요. 시점·매장마다 품목이 달라질 수 있어요. 사기 전에 라벨만 한번 볼까요?'
      : 'AI가 참고용으로 골라둔 제안이에요. 실제 매장이랑 다를 수 있어요. 사기 전에 라벨을 확인해 주세요.') +
    '</p>';

  return (
    '<div class="alt-block">' +
    top.join('') +
    (grid ? `<div class="alt-grid">${grid}</div>` : '') +
    (fallbackNote ? `<div class="alt-fallback">${fallbackNote.split('<br/>').map((p) => escapeHtml(p)).join('<br/>')}</div>` : '') +
    disclaimer +
    '</div>'
  );
}

/** NOVA 1~2: 웹 대체 추천 없음 — 로딩 없이 바로 표시 */
const ALT_NOVA_1_2_NOTICE =
  'NOVA 1~2단계예요. 이미 덜 가공된 편이라, 여기서는 대체 식품 추천은 안 드려요. 채소·과일·통곡물을 곁들여 보시면 좋아요.';

/** 결과 카드 상단·기준 시트에서 공통으로 쓰는 NOVA(분류) 자체 설명 */
const NOVA_CLASSIFICATION_INTRO =
  '한국형 NOVA는 가공 정도를 1~4단계로 나눈 거예요. 첨가물 개수만 보지 않고, 원재료가 얼마나 변했는지를 봐요. 숫자가 클수록 산업적으로 더 가공된 편에 가깝다고 보면 돼요.';

function withAlternativesClientState(raw: AnalysisResult): AnalysisResult {
  const g = raw.novaGroup;
  if (g === 1 || g === 2) {
    return {
      ...raw,
      alternativeFoodLoaded: true,
      alternativeFoodNotice: ALT_NOVA_1_2_NOTICE,
      alternativeFoodText: null,
      alternativeFoodFromWebSearch: false,
      alternativeFoodUserRequested: false,
    };
  }
  if (g === 3 || g === 4) {
    return {
      ...raw,
      alternativeFoodLoaded: false,
      alternativeFoodNotice: null,
    };
  }
  return {
    ...raw,
    alternativeFoodLoaded: true,
    alternativeFoodNotice: null,
  };
}

function applyAlternativesFetchResult(
  clientId: string,
  historyId: string,
  baseResult: AnalysisResult,
  analysisSeconds: number,
  altRaw: string,
  httpOk: boolean,
  refreshHistory: () => void,
  currentHistoryIdRef: MutableRefObject<string | null>,
  setCurrentResult: (r: AnalysisResult) => void,
  renderResult: (
    r: AnalysisResult,
    historyItem: HistoryItem | null,
    opts?: { analysisSeconds: number; historyId: string; keepAltOpen?: boolean }
  ) => void,
  /** 서버가 Perplexity 등 실제 검색 근거 응답을 줬을 때만 true */
  fromWebSearch?: boolean
): void {
  const alt = altRaw.trim();
  const merged: AnalysisResult = {
    ...baseResult,
    alternativeFoodNotice: null,
    alternativeFoodText: alt || null,
    alternativeFoodFromWebSearch: Boolean(httpOk && alt && fromWebSearch),
    alternativeFoodLoaded: true,
  };
  updateHistoryResult(clientId, historyId, {
    alternativeFoodNotice: null,
    alternativeFoodText: merged.alternativeFoodText,
    alternativeFoodFromWebSearch: merged.alternativeFoodFromWebSearch,
    alternativeFoodLoaded: true,
  });
  refreshHistory();
  if (currentHistoryIdRef.current !== historyId) return;
  const resultContainer = document.getElementById('resultContent');
  const altDetails = resultContainer
    ? Array.from(resultContainer.querySelectorAll('details.result-details')).find((el) => {
        const summary = el.querySelector('summary');
        return (summary?.textContent || '').trim() === '대체 식품';
      })
    : null;
  const keepAltOpen = !!altDetails && (altDetails as HTMLDetailsElement).open;
  setCurrentResult(merged);
  renderResult(merged, null, {
    analysisSeconds,
    historyId,
    keepAltOpen,
  });
}

function requestAlternativesFromApi(
  clientId: string,
  historyId: string,
  baseResult: AnalysisResult,
  profile: Profile,
  analysisSeconds: number,
  refreshHistory: () => void,
  currentHistoryIdRef: MutableRefObject<string | null>,
  setCurrentResult: (r: AnalysisResult) => void,
  renderResult: (
    r: AnalysisResult,
    historyItem: HistoryItem | null,
    opts?: { analysisSeconds: number; historyId: string; keepAltOpen?: boolean }
  ) => void
): void {
  void fetch('/api/alternatives', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productName: baseResult.product?.productName || '',
      companyName: baseResult.product?.companyName || '',
      foodCategory: baseResult.foodCategory || null,
      novaGroup: baseResult.novaGroup,
      novaSubgroup: baseResult.novaSubgroup || null,
      briefDescription: baseResult.briefDescription || null,
      rawMaterials: baseResult.product?.rawMaterials || '',
      bmiTier: profileToBmiTier(profile),
      concernIngredients: baseResult.concernIngredients ?? [],
      nutrition: baseResult.nutrition
        ? {
            caloriesKcal: baseResult.nutrition.caloriesKcal ?? null,
            sodiumMg: baseResult.nutrition.sodiumMg ?? null,
            sugarG: baseResult.nutrition.sugarG ?? null,
            saturatedFatG: baseResult.nutrition.saturatedFatG ?? null,
            transFatG: baseResult.nutrition.transFatG ?? null,
            proteinG: baseResult.nutrition.proteinG ?? null,
            fatG: baseResult.nutrition.fatG ?? null,
            carbsG: baseResult.nutrition.carbsG ?? null,
            dietaryFiberG: baseResult.nutrition.dietaryFiberG ?? null,
          }
        : null,
    }),
  })
    .then(async (r) => {
      let d: Record<string, unknown> = {};
      try {
        d = (await r.json()) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      const alt =
        r.ok && d.alternativeFoodText != null ? String(d.alternativeFoodText).trim() : '';
      const fromWebSearch = d.alternativeFoodFromWebSearch === true;
      applyAlternativesFetchResult(
        clientId,
        historyId,
        baseResult,
        analysisSeconds,
        alt,
        r.ok,
        refreshHistory,
        currentHistoryIdRef,
        setCurrentResult,
        renderResult,
        fromWebSearch
      );
    })
    .catch(() => {
      applyAlternativesFetchResult(
        clientId,
        historyId,
        baseResult,
        analysisSeconds,
        '',
        false,
        refreshHistory,
        currentHistoryIdRef,
        setCurrentResult,
        renderResult,
        false
      );
    });
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

function profileToBmiTier(profile: Profile): BmiTier | null {
  const p = getProfileWithLatestMeasurement(profile);
  const b = computeBmi(p.heightCm ?? 0, p.weightKg ?? 0);
  if (b == null) return null;
  if (b < 18.5) return 'underweight';
  if (b <= 22.9) return 'normal';
  if (b <= 24.9) return 'overweight';
  return 'obese';
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

function getBirthYearFromProfile(p: Profile): number | null {
  if (p.birthYear != null && Number.isFinite(p.birthYear)) {
    const y = Math.round(Number(p.birthYear));
    const cy = new Date().getFullYear();
    if (y >= 1900 && y <= cy) return y;
  }
  if (p.birthDate) {
    const m = String(p.birthDate).match(/^(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** 출생연도 + 한국 나이(현재연도 − 출생연도 + 1) */
function birthYearDisplayFromProfile(p: Profile): string {
  const y = getBirthYearFromProfile(p);
  if (y == null) return '—';
  const cy = new Date().getFullYear();
  const age = cy - y + 1;
  if (age < 1 || age > 130) return `${y}년생`;
  return `${y}년생 (한국나이 ${age}세)`;
}

function BirthYearSelect({
  value,
  onChange,
  minYear = 1900,
}: {
  value: number;
  onChange: (y: number) => void;
  minYear?: number;
}) {
  const maxYear = new Date().getFullYear();
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  return (
    <select
      id="obBirthYear"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="출생연도"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}년
        </option>
      ))}
    </select>
  );
}

export default function App() {
  const [clientId, setClientId] = useState('');
  const [isLikelyDesktop, setIsLikelyDesktop] = useState(false);
  const [showDesktopRecommendModal, setShowDesktopRecommendModal] = useState(false);
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
  const [loadingText, setLoadingText] = useState('라벨 읽는 중');
  const [error, setError] = useState('');
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [lastAnalysisSeconds, setLastAnalysisSeconds] = useState<number | null>(null);
  const [lastAnalysisForId, setLastAnalysisForId] = useState<string | null>(null);
  const [resultContentHtml, setResultContentHtml] = useState('');
  const [showDeleteArea, setShowDeleteArea] = useState(false);
  const [profileGender, setProfileGender] = useState('male');
  const [profileHeight, setProfileHeight] = useState('');
  const [profileWeight, setProfileWeight] = useState('');
  const [obStep, setObStep] = useState(0);
  const [obBirthYear, setObBirthYear] = useState(() => Math.max(1900, new Date().getFullYear() - 15));
  const [obGender, setObGender] = useState('male');
  const [obPrivacyAgreed, setObPrivacyAgreed] = useState(false);
  const [obHeight, setObHeight] = useState('');
  const [obWeight, setObWeight] = useState('');
  const [obSummaryBirth, setObSummaryBirth] = useState('—');
  const [obSummaryGender, setObSummaryGender] = useState('—');
  const [obSummaryHeight, setObSummaryHeight] = useState('—');
  const [obSummaryWeight, setObSummaryWeight] = useState('—');
  const [showPrivacyConsentGate, setShowPrivacyConsentGate] = useState(false);
  const [privacyGateChecked, setPrivacyGateChecked] = useState(false);
  const [privacyGateConsentError, setPrivacyGateConsentError] = useState(false);
  const [obPrivacyConsentError, setObPrivacyConsentError] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);
  const [showMeasurementHistory, setShowMeasurementHistory] = useState(false);
  const [showBmiGraph, setShowBmiGraph] = useState(false);
  const [cameraOrientation, setCameraOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [capturedPreviewDataUrl, setCapturedPreviewDataUrl] = useState<string | null>(null);
  const [capturedPreviewMimeType, setCapturedPreviewMimeType] = useState<string>('image/jpeg');
  const [captureStep, setCaptureStep] = useState<1 | 2>(1);
  const [captureStepGuide, setCaptureStepGuide] = useState<null | 1 | 2>(null);
  const [cameraStepChipPulse, setCameraStepChipPulse] = useState(false);
  const [rawImageBase64, setRawImageBase64] = useState<string | null>(null);
  const [rawImageMimeType, setRawImageMimeType] = useState<string>('image/jpeg');
  const [nutritionImageBase64, setNutritionImageBase64] = useState<string | null>(null);
  const [nutritionImageMimeType, setNutritionImageMimeType] = useState<string>('image/jpeg');
  const [showOnboardingCompleteModal, setShowOnboardingCompleteModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>('fab');
  const [tutorialLayoutTick, setTutorialLayoutTick] = useState(0);
  const [tutorialHoleRect, setTutorialHoleRect] = useState<CoachRect | null>(null);
  const [tutorialFocusDecoration, setTutorialFocusDecoration] = useState<TutorialFocusDecoration>(null);
  const showTutorialRef = useRef(false);
  const tutorialPhaseRef = useRef<TutorialPhase>('fab');
  useEffect(() => {
    showTutorialRef.current = showTutorial;
    tutorialPhaseRef.current = tutorialPhase;
  }, [showTutorial, tutorialPhase]);

  const TUTORIAL_STEP_TOTAL = TUTORIAL_PHASE_SEQUENCE.length;
  const tutorialCoachActive =
    showTutorial &&
    shouldShowTutorialCoach(tutorialPhase, {
      showCamera,
      capturedPreviewDataUrl,
      captureStep,
    });
  const tutorialMessage = tutorialCoachActive ? tutorialCoachMessage(tutorialPhase, isLikelyDesktop) : '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploadSource, setUploadSource] = useState<'camera' | 'gallery'>('camera');
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraGuideRef = useRef<HTMLDivElement>(null);
  const resultScrollRef = useRef<HTMLDivElement>(null);
  const captureStepRef = useRef<1 | 2>(1);
  const rawImageBase64Ref = useRef<string | null>(null);
  const currentHistoryIdRef = useRef<string | null>(null);

  useEffect(() => {
    setClientId(getClientId());
  }, []);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isMobileUa =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const hasTouch =
      typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number'
        ? navigator.maxTouchPoints > 0
        : false;
    const narrowViewport = typeof window !== 'undefined' ? window.innerWidth <= 1024 : false;
    const isLikelyMobile = isMobileUa || (hasTouch && narrowViewport);
    setIsLikelyDesktop(!isLikelyMobile);
  }, []);

  useEffect(() => {
    if (!isLikelyDesktop || !clientId) return;
    try {
      if (sessionStorage.getItem('fp_desktopRecommendDismissed') === '1') return;
    } catch {
      /* 비공개 창 등 */
    }
    setShowDesktopRecommendModal(true);
  }, [isLikelyDesktop, clientId]);

  useEffect(() => {
    if (!clientId) return;
    const state = loadState(clientId);
    setProfileState(state.profile || {});
    setHistoryList(state.history || []);
    setOnboardingCompleted(state.onboardingCompleted);
    setShowOnboarding(!state.onboardingCompleted);
    setShowPrivacyConsentGate(
      !!(state.onboardingCompleted && state.profile?.privacyConsentAccepted !== true),
    );
    setPrivacyGateChecked(false);
  }, [clientId]);

  useEffect(() => {
    if (showPrivacyConsentGate) setPrivacyGateConsentError(false);
  }, [showPrivacyConsentGate]);

  useEffect(() => {
    if (obStep !== 3) setObPrivacyConsentError(false);
  }, [obStep]);

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
    captureStepRef.current = captureStep;
  }, [captureStep]);

  useEffect(() => {
    if (captureStep !== 2) {
      setCameraStepChipPulse(false);
      return;
    }
    setCameraStepChipPulse(true);
    const t = window.setTimeout(() => setCameraStepChipPulse(false), 720);
    return () => clearTimeout(t);
  }, [captureStep]);

  useEffect(() => {
    rawImageBase64Ref.current = rawImageBase64;
  }, [rawImageBase64]);
  useEffect(() => {
    currentHistoryIdRef.current = currentHistoryId;
  }, [currentHistoryId]);

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
      setLoadingText('분석하고 있어요');
      setError('');
      try {
        const p = getProfileWithLatestMeasurement(profile);
        const profilePayload =
          p.heightCm != null && p.weightKg != null && p.heightCm > 0 && p.weightKg > 0
            ? {
                heightCm: p.heightCm,
                weightKg: p.weightKg,
                ...(p.birthYear != null ? { birthYear: p.birthYear } : {}),
                ...(!p.birthYear && p.birthDate ? { birthDate: p.birthDate } : {}),
                ...(p.gender ? { gender: p.gender } : {}),
              }
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
        if (!res.ok) throw new Error(data.error || '잠깐 문제가 생겼어요. 다시 한번 눌러 주세요.');
        const rawResult = data as AnalysisResult;
        const result = withAlternativesClientState(rawResult);
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
        /* Gemini(`/api/analyze`) 완료 직후 결과 창을 연 뒤, 대체 식품만 비동기로 요청 */
        setShowHome(false);
        setShowResult(true);
        setShowDeleteArea(true);
        setCaptureStep(1);
        setRawImageBase64(null);
        setNutritionImageBase64(null);
        setCapturedPreviewDataUrl(null);
        if (result.novaGroup === 3 || result.novaGroup === 4) {
          requestAlternativesFromApi(
            clientId,
            id,
            result,
            profile,
            sec,
            refreshHistory,
            currentHistoryIdRef,
            setCurrentResult,
            renderResult
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '잠깐 문제가 생겼어요. 다시 한번 눌러 주세요.');
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
      setLoadingText('분석하고 있어요');
      setError('');
      try {
        const p = getProfileWithLatestMeasurement(profile);
        const profilePayload =
          p.heightCm != null && p.weightKg != null && p.heightCm > 0 && p.weightKg > 0
            ? {
                heightCm: p.heightCm,
                weightKg: p.weightKg,
                ...(p.birthYear != null ? { birthYear: p.birthYear } : {}),
                ...(!p.birthYear && p.birthDate ? { birthDate: p.birthDate } : {}),
                ...(p.gender ? { gender: p.gender } : {}),
              }
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
        if (!res.ok) throw new Error(data.error || '잠깐 문제가 생겼어요. 다시 한번 눌러 주세요.');
        const rawResult = data as AnalysisResult;
        const result = withAlternativesClientState(rawResult);
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
        /* Gemini(`/api/analyze`) 완료 직후 결과 창을 연 뒤, 대체 식품만 비동기로 요청 */
        setShowHome(false);
        setShowResult(true);
        setShowDeleteArea(true);
        setCaptureStep(1);
        setRawImageBase64(null);
        setNutritionImageBase64(null);
        setCapturedPreviewDataUrl(null);
        if (result.novaGroup === 3 || result.novaGroup === 4) {
          requestAlternativesFromApi(
            clientId,
            id,
            result,
            profile,
            sec,
            refreshHistory,
            currentHistoryIdRef,
            setCurrentResult,
            renderResult
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '잠깐 문제가 생겼어요. 다시 한번 눌러 주세요.');
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
      opts?: { analysisSeconds: number; historyId: string; keepAltOpen?: boolean }
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
      const reason = stripMarkdownBold(result.judgmentReason || '');
      const concerns = (result.concernIngredients || []).map((c) => ({
        ...c,
        explanation: stripMarkdownBold(c.explanation || ''),
        name: stripMarkdownBold(c.name || ''),
      }));
      const advice = stripMarkdownBold(result.consumptionAdvice || '');
      const personalizedIntakeNote = stripMarkdownBold((result.personalizedIntakeNote || '').trim());
      const personalizedIntakeFootnote = stripMarkdownBold((result.personalizedIntakeFootnote || '').trim());
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
      html +=
        '<div class="nova-result-title-row">' +
        '<div class="card-title nova-result-title">한국형 NOVA 분류</div>' +
        '<button type="button" class="nova-help-btn" id="novaCriteriaHelpBtn" aria-label="한국형 NOVA 기준 안내" title="기준 안내">?</button>' +
        '</div>' +
        '<p class="nova-result-intro">' +
        escapeHtml(NOVA_CLASSIFICATION_INTRO) +
        '</p>';
      html +=
        '<div class="nova-badge nova-' +
        nova +
        '"><img src="' +
        (NOVA_IMG[nova] || '') +
        '" alt="" class="nova-icon" referrerpolicy="no-referrer">' +
        NOVA_NAMES[nova];
      if (nova === 4) {
        const subGraphItems: Array<'4A' | '4B' | '4C'> = ['4A', '4B', '4C'];
        html += '<div class="nova-subgroup-graph" role="img" aria-label="4A, 4B, 4C 단계 중 현재 분류">';
        subGraphItems.forEach((k) => {
          const label = subKey === k && NOVA_SUBGROUP_NAMES[k] ? NOVA_SUBGROUP_NAMES[k] : k;
          html +=
            '<span class="nova-subgroup-node' +
            (subKey === k ? ' active' : '') +
            '">' +
            escapeHtml(label) +
            '</span>';
          if (k !== '4C') html += '<span class="nova-subgroup-link" aria-hidden="true"> - </span>';
        });
        html += '</div>';
      }
      html += '</div>';
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

      html += '<div class="card"><div class="card-title">맞춤 참고</div>';
      if (personalizedIntakeNote) {
        html +=
          '<div class="advice-box advice-box--with-leading"><span class="advice-leading advice-leading--target-mask" aria-hidden="true"></span><span class="advice-text">' +
          escapeHtml(personalizedIntakeNote) +
          '</span></div>';
        if (personalizedIntakeFootnote) {
          html +=
            '<p class="advice-kcal-footnote">' + escapeHtml(personalizedIntakeFootnote) + '</p>';
        }
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
        html += '<div class="card card-concern-ingredients">';
        html +=
          '<div class="nova-result-title-row">' +
          '<div class="card-title concern-ingredient-heading">주의 원재료</div>' +
          '<button type="button" class="nova-help-btn ingredient-help-btn" id="concernIngredientHelpBtn" aria-label="어떤 성분을 주의해서 보는지 안내" title="성분 안내">?</button>' +
          '</div>';
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

      const showAlternativeSection = nova >= 1 && nova <= 4;
      if (showAlternativeSection) {
        if (nova === 1 || nova === 2) {
          const altPending = result.alternativeFoodLoaded === false;
          const altHtml = altText
            ? buildAlternativeFoodHtml(
                altText,
                result.alternativeFoodFromWebSearch === true,
                (result.product?.productName || '').trim()
              )
            : '';
          const showNoticeWithButton = !result.alternativeFoodUserRequested;
          if (altPending) {
            html += `<details class="result-details"${opts?.keepAltOpen ? ' open' : ''}><summary>대체 식품</summary>`;
            html +=
              '<div class="result-details-body"><div class="alt-block"><div class="alt-fallback">웹 검색으로 대안을 찾는 중이에요. 20초 안팎이 걸릴 수 있어요.</div></div></div>';
            html += '</details>';
          } else if (altHtml) {
            html += `<details class="result-details"${opts?.keepAltOpen ? ' open' : ''}><summary>대체 식품</summary>`;
            html += `<div class="result-details-body">${altHtml}</div>`;
            html += '</details>';
          } else if (showNoticeWithButton) {
            const notice =
              (result.alternativeFoodNotice || '').trim() || ALT_NOVA_1_2_NOTICE;
            html += `<details class="result-details"${opts?.keepAltOpen ? ' open' : ''}><summary>대체 식품</summary>`;
            html +=
              '<div class="result-details-body"><div class="alt-block"><div class="alt-fallback">' +
              escapeHtml(notice) +
              '</div>' +
              '<div style="margin-top:12px"><button type="button" class="edit-row save" id="altForceFetchBtn"><span class="edit-name-btn-inner"><span class="edit-leading" aria-hidden="true"></span>그래도 받기</span></button></div>' +
              '</div></div></details>';
          } else {
            const emptyDisc =
              '<p class="alt-disclaimer">검색·모델 따라 비어 있을 수 있어요. 사기 전에 라벨만 한번 볼까요?</p>';
            html += `<details class="result-details"${opts?.keepAltOpen ? ' open' : ''}><summary>대체 식품</summary>`;
            html +=
              '<div class="result-details-body"><div class="alt-block"><div class="alt-fallback">' +
              escapeHtml(ALTERNATIVE_NOT_FOUND_MESSAGE) +
              '</div>' +
              emptyDisc +
              '</div></div>';
            html += '</details>';
          }
        } else {
          const altPending = result.alternativeFoodLoaded === false;
          const altHtml = altText
            ? buildAlternativeFoodHtml(
                altText,
                result.alternativeFoodFromWebSearch === true,
                (result.product?.productName || '').trim()
              )
            : '';
          if (altPending) {
            html += `<details class="result-details"${opts?.keepAltOpen ? ' open' : ''}><summary>대체 식품</summary>`;
            html +=
              '<div class="result-details-body"><div class="alt-block"><div class="alt-fallback">웹 검색으로 대안을 찾는 중이에요. 20초 안팎이 걸릴 수 있어요.</div></div></div>';
            html += '</details>';
          } else if (altHtml) {
            html += `<details class="result-details"${opts?.keepAltOpen ? ' open' : ''}><summary>대체 식품</summary>`;
            html += `<div class="result-details-body">${altHtml}</div>`;
            html += '</details>';
          } else {
            const emptyDisc =
              '<p class="alt-disclaimer">검색·모델 따라 비어 있을 수 있어요. 사기 전에 라벨만 한번 볼까요?</p>';
            html += `<details class="result-details"${opts?.keepAltOpen ? ' open' : ''}><summary>대체 식품</summary>`;
            html +=
              '<div class="result-details-body"><div class="alt-block"><div class="alt-fallback">' +
              escapeHtml(ALTERNATIVE_NOT_FOUND_MESSAGE) +
              '</div>' +
              emptyDisc +
              '</div></div>';
            html += '</details>';
          }
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
        html += '<details class="result-details"><summary>영양 정보 보기</summary>' + nutritionHtml + '</details>';
      }
      setResultContentHtml(html);
    },
    [profile, currentHistoryId, lastAnalysisForId, lastAnalysisSeconds]
  );

  const handleAltForceFetch = useCallback(() => {
    if (!clientId || !currentHistoryId || !currentResult) return;
    const r = currentResult;
    if (r.novaGroup !== 1 && r.novaGroup !== 2) return;
    if (r.alternativeFoodLoaded === false) return;
    if (r.alternativeFoodUserRequested) return;

    const sec = lastAnalysisSeconds ?? 0;
    const patched: AnalysisResult = {
      ...r,
      alternativeFoodNotice: null,
      alternativeFoodLoaded: false,
      alternativeFoodUserRequested: true,
    };
    updateHistoryResult(clientId, currentHistoryId, {
      alternativeFoodNotice: null,
      alternativeFoodLoaded: false,
      alternativeFoodUserRequested: true,
    });
    refreshHistory();
    setCurrentResult(patched);
    renderResult(patched, null, {
      analysisSeconds: sec,
      historyId: currentHistoryId,
      keepAltOpen: true,
    });
    requestAlternativesFromApi(
      clientId,
      currentHistoryId,
      patched,
      profile,
      sec,
      refreshHistory,
      currentHistoryIdRef,
      setCurrentResult,
      renderResult
    );
  }, [
    clientId,
    currentHistoryId,
    currentResult,
    lastAnalysisSeconds,
    profile,
    refreshHistory,
    renderResult,
  ]);

  useEffect(() => {
    if (!resultContentHtml) return;
    const container = document.getElementById('resultContent');
    if (!container) return;
    container.innerHTML = resultContentHtml;
    const cleanups: Array<() => void> = [];

    const editBtn = container.querySelector('#editNameBtn');
    if (editBtn && currentHistoryId) {
      const historyItem = history.find((i) => i.id === currentHistoryId) || null;
      const name = displayName(historyItem);
      const handler = () => {
        setEditNameValue(name);
        setEditingName(name);
      };
      editBtn.addEventListener('click', handler);
      cleanups.push(() => editBtn.removeEventListener('click', handler));
    }

    const altBtn = container.querySelector('#altForceFetchBtn');
    if (altBtn && currentHistoryId) {
      altBtn.addEventListener('click', handleAltForceFetch);
      cleanups.push(() => altBtn.removeEventListener('click', handleAltForceFetch));
    }

    const novaHelpBtn = container.querySelector('#novaCriteriaHelpBtn');
    if (novaHelpBtn) {
      const openNovaHelp = () => setShowInfoCriteria(true);
      novaHelpBtn.addEventListener('click', openNovaHelp);
      cleanups.push(() => novaHelpBtn.removeEventListener('click', openNovaHelp));
    }

    const concernIngredientHelpBtn = container.querySelector('#concernIngredientHelpBtn');
    if (concernIngredientHelpBtn) {
      const openIngredientHelp = () => setShowInfoIngredient(true);
      concernIngredientHelpBtn.addEventListener('click', openIngredientHelp);
      cleanups.push(() =>
        concernIngredientHelpBtn.removeEventListener('click', openIngredientHelp),
      );
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [
    resultContentHtml,
    currentHistoryId,
    history,
    handleAltForceFetch,
    showInfoCriteria,
    showInfoIngredient,
  ]);

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
        if (captureStepRef.current === 1) {
          setCaptureStepGuide(1);
        }
      })
      .catch(() => fileInputRef.current?.click());
    return true;
  }, []);

  const triggerUpload = useCallback(() => {
    if (showTutorial && tutorialPhase === 'fab') {
      setTutorialPhase('overlay_ingredient');
    }
    setCapturedPreviewDataUrl(null);
    setError('');
    // 홈 FAB(촬영): 항상 새 제품 스캔 — 1/2(원재료)부터. 분석 직후 captureStep=2·이전 원재료가 남아 있어도 여기서 초기화.
    setCaptureStep(1);
    captureStepRef.current = 1;
    setRawImageBase64(null);
    setNutritionImageBase64(null);
    if (isLikelyDesktop) {
      setUploadSource('gallery');
      // 튜토리얼 중 데스크톱: 예시 오버레이 먼저 → 확인 후 앨범
      if (showTutorial) {
        setCaptureStepGuide(1);
        return;
      }
      window.setTimeout(() => galleryInputRef.current?.click(), 0);
      return;
    }
    setUploadSource('camera');
    if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
      startCamera();
    } else {
      fileInputRef.current?.click();
    }
  }, [startCamera, isLikelyDesktop, showTutorial, tutorialPhase]);

  const dismissDesktopRecommend = useCallback(() => {
    try {
      sessionStorage.setItem('fp_desktopRecommendDismissed', '1');
    } catch {
      /* ignore */
    }
    setShowDesktopRecommendModal(false);
  }, []);

  const finishTutorial = useCallback(() => {
    setShowTutorial(false);
    setTutorialPhase('fab');
    setTutorialHoleRect(null);
    setTutorialFocusDecoration(null);
  }, []);

  useLayoutEffect(() => {
    if (!tutorialCoachActive) {
      setTutorialHoleRect(null);
      setTutorialFocusDecoration(null);
      return;
    }
    const measure = () => {
      let hole: CoachRect | null = null;
      let decoration: TutorialFocusDecoration = null;

      const setFromEl = (
        node: HTMLElement | null,
        decoMode: 'arrow' | 'ring' | 'none' = 'arrow'
      ) => {
        if (!node) return;
        const r = node.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const h = { top: r.top, left: r.left, width: r.width, height: r.height };
        hole = h;
        decoration =
          decoMode === 'arrow'
            ? { kind: 'arrow', rect: h }
            : decoMode === 'ring'
              ? { kind: 'ring', rect: h }
              : null;
      };

      switch (tutorialPhase) {
        case 'fab': {
          const el = document.getElementById('fabUpload');
          if (el) {
            const r = el.getBoundingClientRect();
            hole = { top: r.top, left: r.left, width: r.width, height: r.height };
            decoration = { kind: 'arrow', rect: hole };
          }
          break;
        }
        case 'preview_ingredient':
          setFromEl(document.getElementById('tutorial-capture-preview-confirm'), 'arrow');
          break;
        case 'preview_analyze':
          setFromEl(document.getElementById('tutorial-capture-preview-confirm'), 'arrow');
          break;
        default:
          break;
      }
      if (!hole) {
        setTutorialHoleRect(null);
        setTutorialFocusDecoration(null);
        return;
      }
      setTutorialHoleRect(hole);
      setTutorialFocusDecoration(decoration);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const t = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 400);
    const ro = new ResizeObserver(() => measure());
    ro.observe(document.body);
    const overlayCard = document.getElementById('tutorial-capture-overlay-card');
    if (overlayCard) ro.observe(overlayCard);
    const previewRoot = document.querySelector('.capture-preview-view');
    if (previewRoot) ro.observe(previewRoot);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [
    tutorialCoachActive,
    tutorialPhase,
    tutorialLayoutTick,
    showCamera,
    captureStep,
    capturedPreviewDataUrl,
  ]);

  /** 카메라로 찍은 뒤 미리보기가 뜨면 코치 단계로 전환 */
  useLayoutEffect(() => {
    if (!showTutorial) return;
    if (tutorialPhase === 'camera_ingredient' && capturedPreviewDataUrl && captureStep === 1) {
      setTutorialPhase('preview_ingredient');
    }
    if (tutorialPhase === 'camera_nutrient' && capturedPreviewDataUrl && captureStep === 2) {
      setTutorialPhase('preview_analyze');
    }
  }, [showTutorial, tutorialPhase, capturedPreviewDataUrl, captureStep]);

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
      rawImageBase64Ref.current = base64 || '';
      setRawImageMimeType(mime);
      if (showTutorial && tutorialPhase === 'preview_ingredient') {
        setTutorialPhase('overlay_nutrient');
      }
      setCaptureStep(2);
      captureStepRef.current = 2;
      setCaptureStepGuide(2);
      startCamera();
      return;
    }
    if (!rawImageBase64) {
      setError('먼저 원재료 사진을 골라 주세요');
      return;
    }
    if (showTutorial) {
      finishTutorial();
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
    showTutorial,
    tutorialPhase,
    finishTutorial,
  ]);

  const retakePhoto = useCallback(() => {
    setCapturedPreviewDataUrl(null);
    if (showTutorial) {
      if (captureStep === 1) setTutorialPhase('camera_ingredient');
      else if (captureStep === 2) setTutorialPhase('camera_nutrient');
    }
    startCamera();
  }, [startCamera, showTutorial, captureStep]);

  const analyzeWithoutNutrition = useCallback(() => {
    if (!rawImageBase64Ref.current) {
      setError('먼저 원재료 사진을 골라 주세요');
      return;
    }
    stopCamera();
    if (showTutorial) {
      finishTutorial();
    }
    runAnalyze(rawImageBase64Ref.current, rawImageMimeType);
  }, [rawImageMimeType, runAnalyze, stopCamera, showTutorial, finishTutorial]);

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
        const currentStep = captureStepRef.current;
        if (currentStep === 1) {
          setRawImageBase64(base64 || '');
          rawImageBase64Ref.current = base64 || '';
          setRawImageMimeType(normalizedMime);
          if (showTutorialRef.current && tutorialPhaseRef.current === 'camera_ingredient') {
            setTutorialPhase('overlay_nutrient');
          }
          setCaptureStep(2);
          captureStepRef.current = 2;
          setCaptureStepGuide(2);
          // 다음 단계(2/2)를 이어서 진행: 카메라로 가지 않고, 선택한 소스(앨범/촬영)에서 계속 진행
          if (uploadSource === 'gallery') {
            setCapturedPreviewDataUrl(null);
            // 튜토리얼: 영양표 예시 오버레이 후 두 번째 선택
            if (!showTutorialRef.current) {
              window.setTimeout(() => galleryInputRef.current?.click(), 0);
            }
          } else {
            // 카메라 소스인 경우만 카메라로 이어집니다.
            if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
              startCamera();
            } else {
              fileInputRef.current?.click();
            }
          }
        } else {
          if (!rawImageBase64Ref.current) {
            setError('먼저 원재료 사진을 골라 주세요');
            return;
          }
          stopCamera();
          setNutritionImageBase64(base64 || '');
          setNutritionImageMimeType(normalizedMime);
          if (showTutorialRef.current) {
            finishTutorial();
          }
          runAnalyzeTwoImages(rawImageBase64Ref.current, rawImageMimeType, base64 || '', normalizedMime);
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
      stopCamera,
      startCamera,
      finishTutorial,
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

  const settingsProfileSubtitle =
    getBirthYearFromProfile(profile) != null
      ? birthYearDisplayFromProfile(profile)
      : '아직 안 적었어요';

  if (!clientId) return null;

  if (showPrivacyConsentGate) {
    return (
      <div className="privacy-consent-gate" role="dialog" aria-modal="true" aria-labelledby="privacy-gate-title">
        <div className="privacy-consent-panel">
          <h2 id="privacy-gate-title" className="privacy-gate-title">
            개인정보 동의
          </h2>
          <p className="privacy-gate-body">
            출생연도·성별·키·몸무게는 이 기기에만 저장돼요. 맞춤 참고·BMI에만 쓰고, 팔거나 넘기지 않아요. 동의 없으면
            이용이 어려워요.
          </p>
          <label
            className={`ob-privacy-check privacy-gate-check${privacyGateConsentError ? ' ob-privacy-check--error' : ''}`}
          >
            <input
              type="checkbox"
              checked={privacyGateChecked}
              onChange={(e) => {
                const on = e.target.checked;
                setPrivacyGateChecked(on);
                if (on) setPrivacyGateConsentError(false);
              }}
            />
            <span>내용 확인했어요. 개인정보 수집·이용에 동의해요.</span>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-full"
            disabled={!clientId}
            onClick={() => {
              if (!clientId) return;
              if (!privacyGateChecked) {
                setPrivacyGateConsentError(true);
                return;
              }
              const cur = getProfile(clientId);
              const next = { ...cur, privacyConsentAccepted: true };
              saveProfile(clientId, next);
              setProfileState(next);
              setShowPrivacyConsentGate(false);
              setPrivacyGateChecked(false);
              setPrivacyGateConsentError(false);
            }}
          >
            동의하고 시작하기
          </button>
        </div>
      </div>
    );
  }

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

      {showDesktopRecommendModal && (
        <div
          className="modal modal--center-dialog visible"
          role="dialog"
          aria-labelledby="desktop-recommend-title"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && dismissDesktopRecommend()}
        >
          <div className="modal-panel modal-panel--center-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2 id="desktop-recommend-title" className="sheet-title" style={{ textAlign: 'left' }}>
                폰으로 하면 더 편해요
              </h2>
              <button
                type="button"
                className="sheet-close-x"
                aria-label="닫기"
                onClick={() => dismissDesktopRecommend()}
              >
                ×
              </button>
            </div>
            <p
              style={{
                margin: '0 0 16px',
                color: 'var(--text2)',
                fontSize: '1.05rem',
                lineHeight: 1.55,
                textAlign: 'left',
              }}
            >
              QR로 열고 촬영하거나, PC면 아래 업로드에서 사진만 고르면 돼요.
            </p>
            <img
              src="/images/qrcode.png"
              alt="이 페이지를 스마트폰에서 열기 위한 QR 코드"
              style={{
                width: '100%',
                maxWidth: 260,
                height: 'auto',
                display: 'block',
                margin: '0 auto 18px',
                borderRadius: 16,
              }}
            />
            <button type="button" className="btn btn-full" onClick={() => dismissDesktopRecommend()}>
              확인
            </button>
          </div>
        </div>
      )}

      {showCamera && (
        <div
          id="tutorial-camera-view"
          className="camera-view"
          aria-label="촬영"
        >
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
              <button type="button" className="camera-x" aria-label="닫기" onClick={stopCamera}>
                ×
              </button>
            </div>
            <div className="camera-guide-wrap">
              <div
                ref={cameraGuideRef}
                className={`camera-guide-frame ${cameraOrientation}`}
                aria-hidden
              />
              <span className="camera-guide-label">
                {captureStep === 1 ? '원재료명이 보이게 찍어 주세요' : '영양정보 표가 보이게 찍어 주세요'}
              </span>
            </div>
            <div
              className={`camera-step-chip${cameraStepChipPulse ? ' camera-step-chip-pulse' : ''}`}
              aria-live="polite"
            >
              <span className={`step-dot ${captureStep === 1 ? 'active' : ''}`}>1</span>
              <span className="step-sep">/</span>
              <span className={`step-dot ${captureStep === 2 ? 'active' : ''}`}>2</span>
              <span className="step-text">
                {captureStep === 1 ? '1단계 · 원재료 촬영' : '2단계 · 영양정보 표 촬영'}
              </span>
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
              <button
                type="button"
                id="tutorial-camera-shutter"
                className="camera-shutter"
                onClick={captureFromCamera}
                aria-label="촬영"
              />
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
            {captureStep === 2 && (
              <button
                type="button"
                className="camera-no-nutrition-btn"
                aria-label="영양정보 표 없음"
                onClick={analyzeWithoutNutrition}
              >
                영양정보 표 없음
              </button>
            )}
            <p className="camera-hint">
              {captureStep === 1 ? '1/2: 포장 뒷면(원재료) 촬영' : '2/2: 영양정보 표 촬영'}
            </p>
            <p className="camera-hint-sub">지금은 한국어만 분석할 수 있어요</p>
          </div>
        </div>
      )}

      {captureStepGuide != null && (
        <div
          className="capture-step-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={
            captureStepGuide === 1 ? 'capture-step-overlay-title-1' : 'capture-step-overlay-title-2'
          }
        >
          <div id="tutorial-capture-overlay-card" className="capture-step-overlay-card">
            <p className="capture-step-overlay-badge" aria-hidden>
              {captureStepGuide === 1 ? '1 / 2' : '2 / 2'}
            </p>
            {captureStepGuide === 1 ? (
              <>
                <h2 id="capture-step-overlay-title-1" className="capture-step-overlay-title">
                  원재료 촬영
                </h2>
                <div className="capture-step-overlay-example-row" role="group" aria-label="원재료 촬영 예시">
                  {CAPTURE_GUIDE_INGREDIENT_EXAMPLES.map((src, i) => (
                    <img
                      key={src}
                      className="capture-step-overlay-example"
                      src={src}
                      alt={`원재료 촬영 예시 ${i + 1}`}
                      decoding="async"
                      onLoad={() => showTutorial && setTutorialLayoutTick((n) => n + 1)}
                    />
                  ))}
                </div>
                <p className="capture-step-overlay-caption">촬영 예시 · 원재료</p>
                <p className="capture-step-overlay-body">
                  뒷면 원재료명이 한 화면에 들어오게 찍어 주세요. 글자 안 흐리게 초점만 맞춰 주세요.
                </p>
              </>
            ) : (
              <>
                <h2 id="capture-step-overlay-title-2" className="capture-step-overlay-title">
                  영양정보 표 촬영
                </h2>
                <div className="capture-step-overlay-example-row" role="group" aria-label="영양정보 표 촬영 예시">
                  {CAPTURE_GUIDE_NUTRIENT_EXAMPLES.map((src, i) => (
                    <img
                      key={src}
                      className="capture-step-overlay-example"
                      src={src}
                      alt={`영양정보 표 촬영 예시 ${i + 1}`}
                      decoding="async"
                      onLoad={() => showTutorial && setTutorialLayoutTick((n) => n + 1)}
                    />
                  ))}
                </div>
                <p className="capture-step-overlay-caption">촬영 예시 · 영양정보 표</p>
                <p className="capture-step-overlay-body">
                  원재료는 저장됐어요. 이제 영양정보 표가 한 화면에 들어오게 찍어 주세요.
                </p>
              </>
            )}
            <button
              type="button"
              id="tutorial-capture-overlay-confirm"
              className="capture-step-overlay-btn"
              onClick={() => {
                const g = captureStepGuide;
                if (showTutorial) {
                  if (g === 1) setTutorialPhase('camera_ingredient');
                  if (g === 2) setTutorialPhase('camera_nutrient');
                }
                setCaptureStepGuide(null);
                if (isLikelyDesktop && uploadSource === 'gallery' && (g === 1 || g === 2)) {
                  window.setTimeout(() => galleryInputRef.current?.click(), 0);
                }
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {capturedPreviewDataUrl && (
        <div className="capture-preview-view" aria-label="촬영 미리보기">
          <img
            src={capturedPreviewDataUrl}
            alt="촬영한 사진"
            className="capture-preview-img"
            onLoad={() => showTutorial && setTutorialLayoutTick((n) => n + 1)}
          />
          <p style={{ margin: '14px 0 0', color: 'var(--text2)', fontWeight: 700, textAlign: 'center' }}>
            {captureStep === 1 ? '1/2 · 원재료' : '2/2 · 영양정보 표'}
          </p>
          <div className="capture-preview-actions">
            <button type="button" className="capture-preview-btn retake" onClick={retakePhoto}>
              다시 촬영
            </button>
            <button
              type="button"
              id="tutorial-capture-preview-confirm"
              className="capture-preview-btn confirm"
              onClick={confirmCapturedImage}
            >
              {captureStep === 1 ? '다음(영양정보 표)' : '분석하기'}
            </button>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div id="onboardingView" className={showOnboarding ? '' : 'hidden'} role="main" aria-label="시작하기">
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
                  원재료랑 NOVA,
                  <br />
                  사진 두 장이면 분석해 드려요
                </p>
                <div className="ob-welcome-features">
                  <div className="ob-welcome-feature-item">
                    <span className="ico">
                      <IconCamera size={22} />
                    </span>{' '}
                    ① 원재료 → ② 영양표 순으로
                  </div>
                  <div className="ob-welcome-feature-item">
                    <span className="ico">
                      <IconUser size={22} />
                    </span>{' '}
                    키·몸무게로 맞춤 안내
                  </div>
                  <div className="ob-welcome-feature-item">
                    <span className="ico">
                      <IconAlert size={22} />
                    </span>{' '}
                    비만이면 초가공 안내를 더 드려요
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
                  <h2>프로필</h2>
                  <p className="ob-lead">맞춤 안내에만 써요</p>
                </div>
                <div className="form-group">
                  <label>출생연도</label>
                  <BirthYearSelect value={obBirthYear} onChange={setObBirthYear} />
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
                  이 기기에만 저장돼요
                </p>
                <div className="ob-step-actions">
                  <button type="button" className="btn btn-ghost btn-full" onClick={() => setObStep(0)}>
                    이전
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    onClick={() => {
                      const cy = new Date().getFullYear();
                      if (!Number.isFinite(obBirthYear) || obBirthYear < 1900 || obBirthYear > cy) {
                        alert('출생연도를 먼저 골라 주세요');
                        return;
                      }
                      const nextProfile = {
                        ...profile,
                        birthYear: obBirthYear,
                        birthDate: null,
                        gender: obGender,
                      };
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
                  <h2>키·몸무게</h2>
                  <p className="ob-lead">BMI랑 맞춤 안내에 써요. 나중에 설정에서 바꿀 수 있어요</p>
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
                  이 기기에만 저장돼요
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
                        alert('키랑 몸무게를 입력해 주세요');
                        return;
                      }
                      setObSummaryBirth(
                        birthYearDisplayFromProfile({
                          ...profile,
                          birthYear: profile.birthYear ?? obBirthYear,
                        }),
                      );
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
                <h2 className="ob-confirm-title">입력한 정보, 맞을까요?</h2>
                <div className="ob-summary-card">
                  <div className="ob-summary-row">
                    <span className="label">출생연도</span>
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
                  출생연도·성별은 나중에 바꾸기 어려워요. 키·몸무게는 설정에서 언제든 고칠 수 있어요
                </p>
                <label
                  className={`ob-privacy-check${obPrivacyConsentError ? ' ob-privacy-check--error' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={obPrivacyAgreed}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setObPrivacyAgreed(on);
                      if (on) setObPrivacyConsentError(false);
                    }}
                  />
                  <span>
                    개인정보 수집·이용에 동의해요. 출생연도·성별·키·몸무게는 이 기기에만 저장하고, 팔거나 넘기지 않아요.
                    동의 없으면 이용이 어려워요.
                  </span>
                </label>
                <p className="ob-safety">
                  <span className="ob-safety-ico" aria-hidden>
                    <IconLock size={16} />
                  </span>
                  이 기기에만 저장돼요
                </p>
                <div className="ob-confirm-actions">
                  <button type="button" className="btn btn-ghost btn-full" onClick={() => setObStep(2)}>
                    수정
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    onClick={() => {
                      if (!obPrivacyAgreed) {
                        setObPrivacyConsentError(true);
                        return;
                      }
                      if (!clientId) return;
                      const finalized = {
                        ...profile,
                        onboardingLocked: true,
                        privacyConsentAccepted: true,
                      };
                      setProfileState(finalized);
                      saveProfile(clientId, finalized);
                      setOnboardingCompleted(true);
                      setShowOnboarding(false);
                      setShowOnboardingCompleteModal(true);
                      setShowPrivacyConsentGate(false);
                      refreshHistory();
                      /* 토스트(약 2.2초) 이후 코치 튜토리얼 자동 시작 */
                      window.setTimeout(() => {
                        setTutorialPhase('fab');
                        setShowTutorial(true);
                      }, 2350);
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
          <span className="onboarding-complete-text">저장했어요</span>
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
              !showInfoPhoto &&
              !showAddMeasurement &&
              !showMeasurementHistory &&
              !showBmiGraph && (
                <div className="home-top-bar">
                  <button
                    type="button"
                    className="btn-tutorial-text"
                    onClick={() => {
                      setTutorialPhase('fab');
                      setShowTutorial(true);
                    }}
                  >
                    사용법
                  </button>
                  <button
                    type="button"
                    id="tutorial-target-settings"
                    className="btn-settings-home"
                    title="설정"
                    aria-label="설정"
                    onClick={openSettings}
                  >
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
                원재료·NOVA·영양 비율을 알려 드릴게요
              </h2>
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
                <h2 className="history-list-title">최근에 본 분석</h2>
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
                  <button
                    type="button"
                    className="fab"
                    id="fabUpload"
                    aria-label={isLikelyDesktop ? '포장 사진 파일 업로드' : '카메라로 포장 촬영'}
                    onClick={triggerUpload}
                  >
                    <span className="fab-pulse" aria-hidden />
                    <span className="fab-pulse fab-pulse--2" aria-hidden />
                    <span className="fab-pulse fab-pulse--3" aria-hidden />
                    {isLikelyDesktop ? <IconImage size={34} /> : <IconCamera size={34} />}
                  </button>
                  <span className="fab-label">{isLikelyDesktop ? '업로드' : '촬영'}</span>
                </div>
              </div>
              <span className="fab-label" style={{ marginTop: 4 }}>
                {captureStep === 1
                  ? uploadSource === 'gallery'
                    ? '1/2 · 원재료(앨범 선택)'
                    : '1/2 · 원재료(촬영)'
                  : uploadSource === 'gallery'
                    ? '2/2 · 영양정보 표(앨범 선택)'
                    : '2/2 · 영양정보 표(촬영)'}
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
              참고용 정보예요.
              <br />
              정확한 상담은 병원에서 함께해 주세요.
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
                  <button
                    type="button"
                    id="tutorial-target-settings-close"
                    className="settings-close-x"
                    aria-label="닫기"
                    onClick={() => setShowSettings(false)}
                  >
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
                    if (
                      !window.confirm(
                        '스캔 기록이랑 프로필(출생연도·성별·키·몸무게)까지 전부 지울까요?\n한번 지우면 되돌릴 수 없어요.',
                      )
                    )
                      return;
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
                    setObStep(0);
                    setObBirthYear(Math.max(1900, new Date().getFullYear() - 15));
                    setObPrivacyAgreed(false);
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
                <button
                  type="button"
                  id="tutorial-target-settings-back-display"
                  className="settings-back"
                  onClick={() => setSettingsPage('list')}
                >
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
                  <button
                    type="button"
                    id="tutorial-target-settings-close-profile"
                    className="settings-close-x"
                    aria-label="닫기"
                    onClick={() => setShowSettings(false)}
                  >
                    ×
                  </button>
                </div>
                <h2>개인 맞춤화</h2>
                <div className="form-group settings-readonly-row">
                  <span className="label">출생연도</span>
                  <span className="value">{birthYearDisplayFromProfile(profile)}</span>
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
                        : '아직 없어요';
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
          aria-label="한국형 NOVA 기준 안내"
          onClick={(e) => e.target === e.currentTarget && setShowInfoCriteria(false)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2 className="sheet-title">한국형 NOVA 기준</h2>
              <button type="button" className="sheet-close-x" aria-label="닫기" onClick={() => setShowInfoCriteria(false)}>×</button>
            </div>
            <div className="sheet-icon-wrap" aria-hidden>
              <div className="sheet-icon">
                <IconHeart size={48} />
              </div>
            </div>
            <div className="info-knova-intro">
              <p className="info-knova-intro-line">
                NOVA는 식품 가공 정도를 단계로 나눈 개념이에요. 한국형(K-NOVA)은 우리나라 표기·먹는 환경에 맞춰 쓰는 거예요.
              </p>
              <p className="info-knova-intro-line">
                {NOVA_CLASSIFICATION_INTRO}
              </p>
              <p className="info-knova-intro-line">
                Group IV는 4A·4B·4C로 더 나눠서 봐요. 4A는 재료 기반 경계형, 4B는 기능성 재구성형, 4C는 복합 첨가가 강한 고도형에 가까워요.
              </p>
              <p className="info-knova-intro-line info-knova-intro-line--muted">
                참고로 SIGA 체계도 초가공 식품을 세분해 보는 접근이에요. 이 앱은 한국형 NOVA를 기본으로 쓰되, Group IV 설명 톤은 SIGA 취지를 참고해요.
              </p>
              <p className="info-knova-intro-line info-knova-intro-line--muted">
                아래는 그룹별로 자주 쓰는 설명이에요. 세부 기준은 논문·정책 문서랑 다를 수 있어요.
              </p>
            </div>
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
                    {n === 4 &&
                      '원재료 형태가 많이 사라진 초가공이에요. 세부는 4A·4B·4C로 나눠요.'}
                  </li>
                </ul>
              </div>
            ))}
            <p style={{ margin: '12px 0 0', color: 'var(--text2)', fontSize: '1.05rem', lineHeight: 1.5 }}>
              프로필 넣으면 맞춤 안내가 붙어요. 나트륨·당은 결과 막대에서 볼 수 있어요.
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
              <button type="button" className="sheet-close-x" aria-label="닫기" onClick={() => setShowInfoPhoto(false)}>
                ×
              </button>
            </div>
            <div className="sheet-icon-wrap" aria-hidden>
              <div className="sheet-icon">
                <IconCamera size={48} />
              </div>
            </div>
            <div className="guide-step">
              <span className="num">1</span>
              <span className="txt">뒷면 원재료명이 보이게.</span>
            </div>
            <div className="guide-step">
              <span className="num">2</span>
              <span className="txt">글자 선명하게, 가까이.</span>
            </div>
            <div className="guide-step">
              <span className="num">3</span>
              <span className="txt">이어서 영양표만 따로 한 장.</span>
            </div>
            <div className="guide-step">
              <span className="num">4</span>
              <span className="txt">밝은 곳, 그림자 피하기.</span>
            </div>
            <div className="photo-guide-example-wrap">
              <div className="photo-guide-example-title">촬영 예시</div>
              <div className="photo-guide-example-subtitle">원재료</div>
              <div className="photo-guide-example-row">
                {CAPTURE_GUIDE_INGREDIENT_EXAMPLES.map((src, idx) => (
                  <img
                    key={src}
                    className="photo-guide-example-img"
                    src={src}
                    alt={`원재료 촬영 예시 ${idx + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
              <div className="photo-guide-example-subtitle">영양정보 표</div>
              <div className="photo-guide-example-row">
                {CAPTURE_GUIDE_NUTRIENT_EXAMPLES.map((src, idx) => (
                  <img
                    key={src}
                    className="photo-guide-example-img"
                    src={src}
                    alt={`영양정보 표 촬영 예시 ${idx + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
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
          measurements={[...(profile.bodyMeasurements || [])].sort(compareBodyMeasurementsDesc)}
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
          measurements={[...(profile.bodyMeasurements || [])].sort(compareBodyMeasurementsAsc)}
          onClose={() => setShowBmiGraph(false)}
        />
      )}

      {/* 캡처 안내·미리보기·분석 확인: 앱 UI만 보이게 코치(딤/말풍선) 숨김 */}
      <TutorialCoachOverlay
        active={tutorialCoachActive}
        holeRect={tutorialHoleRect}
        focusDecoration={tutorialFocusDecoration}
        message={tutorialMessage}
        stepIndex={tutorialPhaseIndex(tutorialPhase)}
        stepTotal={TUTORIAL_STEP_TOTAL}
        onSkip={finishTutorial}
      />
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
  const [date, setDate] = useState(() => todayYmdLocal());
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
          <input
            type="date"
            value={date}
            min="1900-01-01"
            max={todayYmdLocal()}
            onChange={(e) => setDate(e.target.value)}
          />
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
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={!canAdd}
            onClick={() => canAdd && onAdd(date, parseFloat(height), parseFloat(weight))}
          >
            추가
          </button>
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
    const ymd = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[1]}. ${ymd[2]}. ${ymd[3]}.`;
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
                  <tr
                    key={`${m.date}-${m.recordedAt ?? idx}-${m.heightCm}-${m.weightKg}`}
                    style={{ borderBottom: '1px solid var(--card-stroke)' }}
                  >
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
  const sorted = measurements.length ? [...measurements].sort(compareBodyMeasurementsAsc) : [];
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
