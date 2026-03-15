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
import { NOVA_NAMES, NOVA_IMG, NOVA_SHORT_REASON, PHOTO_GUIDE_EXAMPLE_URL } from '@/lib/constants';

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
  const [profileBirth, setProfileBirth] = useState('');
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
  const [showOnboardingCompleteModal, setShowOnboardingCompleteModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, imageBase64: base64, mimeType }),
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
      } catch (err) {
        setError(err instanceof Error ? err.message : '분석 중 오류가 났어요.');
      } finally {
        setLoading(false);
      }
    },
    [clientId, refreshHistory]
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
      const reason = result.judgmentReason || '';
      const concerns = result.concernIngredients || [];
      const advice = result.consumptionAdvice || '';
      const isUltra = nova === 4;
      const isObese = isObeseByProfile(profile);
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
      html += '<div class="card" id="productNameCard">';
      html += '<div class="card-title" id="productNameDisplay">' + escapeHtml(name) + '</div>';
      if (company) html += '<div class="meta">' + escapeHtml(company) + '</div>';
      if (currentHistoryId)
        html += '<div style="margin-top:8px;"><button type="button" class="edit-row save" id="editNameBtn">✏️ 이름 수정</button></div>';
      html += '</div>';
      html += '<div class="card"><div class="card-title">원재료</div>';
      html += raw
        ? '<div style="font-size:1.05rem; color:var(--text2);">' + escapeHtml(raw) + '</div>'
        : '<div class="meta">원재료 정보가 없어요</div>';
      html += '</div>';
      html += '<div class="card"><div class="card-title">한국형 NOVA 분류</div>';
      html +=
        '<span class="nova-badge nova-' +
        nova +
        '"><img src="' +
        (NOVA_IMG[nova] || '') +
        '" alt="" class="nova-icon" referrerpolicy="no-referrer">' +
        NOVA_NAMES[nova] +
        '</span>';
      if (reason) {
        html += '<div style="font-size:1.05rem; color:var(--text2); margin-top:8px;">' + escapeHtml(reason) + '</div>';
      } else {
        html += '<div style="font-size:1.05rem; color:var(--text2); margin-top:8px;">' + escapeHtml(NOVA_SHORT_REASON[nova] || NOVA_SHORT_REASON[4]) + '</div>';
      }
      html += '</div>';
      html += '<div class="card"><div class="card-title">맞춤 안내</div>';
      if (advice) html += '<div class="advice-box">🍴 ' + escapeHtml(advice) + '</div>';
      if (isUltra) html += '<div class="advice-box advice-warning">⚠️ ' + ultraMsg + '</div>';
      if (!advice && !isUltra) html += '<div class="advice-box">과도한 섭취를 피하는 것이 좋습니다.</div>';
      html += '</div>';
      if (concerns.length > 0) {
        html += '<div class="card"><div class="card-title">주의 원재료</div>';
        concerns.forEach(
          (c) =>
            (html +=
              '<div class="concern-item"><div class="concern-name">' +
              escapeHtml(c.name) +
              '</div><div class="concern-desc">' +
              escapeHtml(c.explanation) +
              '</div></div>')
        );
        html += '</div>';
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
    setCapturedPreviewDataUrl(null);
    runAnalyze(base64 || '', 'image/jpeg');
  }, [capturedPreviewDataUrl, runAnalyze]);

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
        runAnalyze(base64 || '', mime.startsWith('image/') ? mime : 'image/jpeg');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [runAnalyze]
  );

  const openSettings = useCallback(() => {
    setProfileBirth(profile.birthDate || '');
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
                <span className="camera-guide-label">원재료명이 보이게 찍어주세요</span>
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
            <p className="camera-hint">포장 뒷면 촬영</p>
            <p className="camera-hint-sub">지금은 한국어만 분석할 수 있어요</p>
          </div>
        </div>
      )}

      {capturedPreviewDataUrl && (
        <div className="capture-preview-view" aria-label="촬영 미리보기">
          <img src={capturedPreviewDataUrl} alt="촬영한 사진" className="capture-preview-img" />
          <div className="capture-preview-actions">
            <button type="button" className="capture-preview-btn retake" onClick={retakePhoto}>
              다시 촬영
            </button>
            <button type="button" className="capture-preview-btn confirm" onClick={confirmCapturedImage}>
              선택하기
            </button>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div id="onboardingView" className={showOnboarding ? '' : 'hidden'} role="main" aria-label="사전 조사">
          <div className="onboarding-inner">
            {obStep === 0 && (
              <div id="onboardingStep0">
                <div className="ob-welcome-icon" aria-hidden>🌿</div>
                <h2 className="ob-welcome-title">FoodPolice</h2>
                <p className="ob-welcome-desc">
                  포장만 찍으면 원재료와 NOVA 등급을
                  <br />
                  바로 알려줄게요
                </p>
                <div className="ob-welcome-features">
                  <div className="ob-welcome-feature-item">
                    <span className="ico">📷</span> 원재료·NOVA 한 번에
                  </div>
                  <div className="ob-welcome-feature-item">
                    <span className="ico">👤</span> 키·몸무게로 BMI·비만 여부
                  </div>
                  <div className="ob-welcome-feature-item">
                    <span className="ico">⚠️</span> 비만일 땐 초가공 경고 강하게
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
                  <input type="date" id="obBirth" value={obBirth} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => setObBirth(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>성별</label>
                  <select id="obGender" value={obGender} onChange={(e) => setObGender(e.target.value)}>
                    <option value="male">남성</option>
                    <option value="female">여성</option>
                  </select>
                </div>
                <p className="ob-safety">입력한 정보는 기기에만 안전하게 저장돼요</p>
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
                <p className="ob-safety">입력한 정보는 기기에만 안전하게 저장돼요</p>
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
                <p className="ob-safety">입력한 정보는 기기에만 안전하게 저장돼요</p>
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
          <span className="onboarding-complete-icon" aria-hidden>✓</span>
          <span className="onboarding-complete-text">반영 완료</span>
        </div>
      )}

      <div id="app">
        <header className={`header ${showSettings || showInfoIngredient || showInfoCriteria || showInfoPhoto || showAddMeasurement || showMeasurementHistory || showBmiGraph ? 'header-hidden' : ''}`}>
          <h1 className="header-title">FoodPolice</h1>
          <button type="button" id="settingsBtn" title="설정" aria-label="설정" onClick={openSettings}>
            ⚙️
          </button>
        </header>

        <div id="homeView" className={showHome ? '' : 'hidden'}>
          <div className="home-scroll" id="homeScroll">
            <div className="hero-section" aria-label="소개">
              <span className="hero-icon" aria-hidden>🌿</span>
              <h2 className="hero-title">
                포장만 찍으면
                <br />
                원재료·NOVA 한 번에 알려줄게요
              </h2>
            </div>
            <div className="info-cards-wrap">
              <button type="button" className="info-card" aria-label="이런 성분을 분석해요" onClick={() => setShowInfoIngredient(true)}>
                <span className="icon-wrap" aria-hidden>🔍</span>
                <span className="label">이런 성분을 분석해요</span>
                <span className="chevron" aria-hidden>›</span>
              </button>
              <button type="button" className="info-card" aria-label="내 건강에 맞게 판단해요" onClick={() => setShowInfoCriteria(true)}>
                <span className="icon-wrap" aria-hidden>❤️</span>
                <span className="label">내 건강에 맞게 판단해요</span>
                <span className="chevron" aria-hidden>›</span>
              </button>
              <button type="button" className="info-card" aria-label="이렇게 촬영해요" onClick={() => setShowInfoPhoto(true)}>
                <span className="icon-wrap" aria-hidden>📷</span>
                <span className="label">이렇게 촬영해요</span>
                <span className="chevron" aria-hidden>›</span>
              </button>
            </div>
            {loading && (
              <div className="loading-callout-wrap">
                <div className="card" id="loadingCard">
                  <div className="loading">
                    <span className="loading-spinner" aria-hidden>⏳</span>
                    <span id="loadingText">{loadingText}</span>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="error-msg" id="errorCard">
                <span className="error-icon" aria-hidden>⚠️</span>
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
              <button type="button" className="fab" id="fabUpload" aria-label="포장 촬영" onClick={triggerUpload}>
                📷
              </button>
              <span className="fab-label">포장 뒷면 촬영</span>
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
                  <span className="row-icon" aria-hidden>☀️</span>
                  <span className="row-text">
                    <span className="row-title">화면 설정</span>
                    <span className="row-subtitle">{settingsDisplaySubtitle}</span>
                  </span>
                  <span className="row-chevron" aria-hidden>›</span>
                </button>
                <button type="button" className="settings-row" aria-label="개인 맞춤화" onClick={() => setSettingsPage('profile')}>
                  <span className="row-icon" aria-hidden>👤</span>
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
                  }}
                >
                  <span className="row-icon" aria-hidden>🗑</span>
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
                          ✓
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
                {profile.onboardingLocked ? (
                  <div className="form-group settings-readonly-row">
                    <span className="label">출생연도(만 n세)</span>
                    <span className="value">{birthDisplay(profile.birthDate || '')}</span>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>출생연도(만 n세)</label>
                    <input
                      type="date"
                      id="profileBirth"
                      min="1900-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      value={profileBirth}
                      onChange={(e) => {
                        const v = e.target.value || undefined;
                        setProfileBirth(e.target.value);
                        if (clientId) {
                          const p = { ...profile, birthDate: v };
                          setProfileState(p);
                          saveProfile(clientId, p);
                        }
                      }}
                    />
                  </div>
                )}
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
                      <span aria-hidden>📋</span>
                    </button>
                  </div>
                  <div style={{ color: 'var(--text2)', fontSize: '1rem', marginBottom: 12 }}>
                    {(() => {
                      const list = profile.bodyMeasurements || [];
                      const latest = list.length
                        ? [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                        : null;
                      const h = latest?.heightCm ?? profile.heightCm;
                      const w = latest?.weightKg ?? profile.weightKg;
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
                    <span>➕</span> 키·몸무게 기록 추가
                  </button>
                </div>
                {(() => {
                  const bmiInfo = getBMICategory(profile);
                  if (!bmiInfo) return null;
                  return (
                    <div className="bmi-display" style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--card)', border: '1px solid var(--card-stroke)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>BMI (현재)</span>
                        <span style={{ marginLeft: 8, color: 'var(--text2)' }}>{bmiInfo.bmi.toFixed(1)} · {bmiInfo.category}</span>
                        {isObeseByProfile(profile) && <span style={{ marginLeft: 6, fontSize: '0.9rem', color: 'var(--risk)' }}>(비만)</span>}
                      </div>
                      <button
                        type="button"
                        className="icon-btn-circle"
                        aria-label="비만도 추이"
                        onClick={() => setShowBmiGraph(true)}
                        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--card-stroke)', background: 'var(--card)', color: 'var(--accent)' }}
                      >
                        <span aria-hidden>📈</span>
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
            <div className="sheet-icon">🧪</div>
            <div className="info-category">
              <h4><span className="ico">➕</span> 첨가물</h4>
              <ul><li>보존료, 산화방지제, 착향료, 증점제, 유화제 등</li></ul>
            </div>
            <div className="info-category">
              <h4><span className="ico">🍬</span> 감미료</h4>
              <ul><li>아스파탐, 수크랄로스, 아세설팜칼륨, 스테비아 등</li></ul>
            </div>
            <div className="info-category">
              <h4><span className="ico">🎨</span> 색소</h4>
              <ul><li>타르색소, 카라멜색소, 코치닐 등</li></ul>
            </div>
            <div className="info-category">
              <h4><span className="ico">⚠️</span> 주의 성분</h4>
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
            <div className="sheet-icon">❤️</div>
            <p style={{ margin: '0 0 16px', color: 'var(--text2)', fontSize: '1.15rem', lineHeight: 1.6 }}>
              한국형 NOVA 분류를 기준으로, 원재료와 가공 정도를 보고 그룹을 판정해요.
            </p>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="info-category">
                <h4>
                  <img src={NOVA_IMG[n]} alt="" className="nova-sheet-icon" referrerPolicy="no-referrer" />
                  {NOVA_NAMES[n]}
                </h4>
                <ul>
                  <li>
                    {n === 1 && '자연 그대로에 가깝고, 원재료 구조를 유지해요.'}
                    {n === 2 && '조리용 소금, 설탕, 기름처럼 요리에 쓰는 재료예요.'}
                    {n === 3 && '원재료 특성을 많이 유지한 가공 식품이에요.'}
                    {n === 4 && '원재료 구조가 사라지고, 산업적 첨가물이 많이 들어간 식품이에요.'}
                  </li>
                </ul>
              </div>
            ))}
            <p style={{ margin: '12px 0 0', color: 'var(--text2)', fontSize: '1.05rem', lineHeight: 1.5 }}>
              나이·성별·키·몸무게로 BMI와 비만 판정을 참고해, 초가공 경고 등 맞춤 안내를 드려요.
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
            <div className="sheet-icon">📷</div>
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
              <span className="txt"><strong>그림자가 지지 않게</strong> 밝은 곳에서 촬영해 주세요.</span>
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
            <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
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
                      <button type="button" aria-label="삭제" style={{ color: 'var(--risk)', padding: 8 }} onClick={() => onDelete(idx)}>🗑</button>
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
            <div style={{ fontSize: 44, marginBottom: 12 }}>📈</div>
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
  );
}
