import { sections } from './sutra.js?v=32';
import { TypingSession } from './typing.js?v=32';
import { Stats } from './stats.js?v=32';
import { Mokak } from './mokak.js?v=32';
import { Keyboard } from './keyboard.js?v=32';

// 모바일 감지 — 좁은 화면 + 터치 primary 둘 다 만족할 때만
// (큰 태블릿/터치 노트북은 물리 키보드 쓰니까 제외)
const IS_MOBILE =
  window.matchMedia &&
  window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;

// ── DOM ─────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const modeSelect = $('#mode-select');
const sectionSelect = $('#section-select');
const sectionTitle = $('#section-title');
const sectionHanja = $('#section-hanja');
const typingAreaEl = $('#typing-area');
const inputEl = $('#typing-input');
const meaningEl = $('#meaning');
const meaningText = $('#meaning-text');
const meaningToggle = $('#meaning-toggle');
const soundToggle = $('#sound-toggle');
const wpmEl = $('#stat-wpm');
const accEl = $('#stat-acc');
const bestEl = $('#stat-best');
const progressFillEl = $('#progress-fill');
const progressTextEl = $('#progress-text');

const modal = $('#result-modal');
const modalTitle = $('#modal-title');
const modalWpm = $('#modal-wpm');
const modalAcc = $('#modal-acc');
const modalWpmBest = $('#modal-wpm-best');
const modalAccBest = $('#modal-acc-best');
const modalMeaning = $('#modal-meaning');
const modalRetry = $('#modal-retry');
const modalNext = $('#modal-next');
const modalEyebrow = $('#modal-eyebrow');

// ── 상태 ────────────────────────────────────────────────────
const state = {
  mode: 'short', // 'sentence' | 'short' | 'long'
  sectionIndex: 1, // 짧은 글: sections 인덱스
  sentenceLine: 0, // 한 문장 모드: 현재 섹션 내 라인 인덱스
  meaningOpen: false,
};

// ── 인스턴스 ────────────────────────────────────────────────
const mokak = new Mokak();
const stats = new Stats({
  wpmEl, accEl, bestEl, progressFillEl, progressTextEl,
});

const session = new TypingSession({
  inputEl,
  onUpdate: (s) => renderTyping(s),
  onLineComplete: () => {/* 진행 표시는 update에서 */},
  onComplete: () => onSessionComplete(),
  // 목탁은 compositionupdate(자모)·input(영문/Backspace)에서만 — keydown 일체 사용 X
  onStrike: () => mokak.strike({ wrong: false }),
});

// ── 가상 키보드 ───────────────────────────────────────────
// 모바일: 시스템 키보드 차단(inputmode="none") + 가상 키보드 메인 입력
// PC: 가상 키보드 숨김 (물리 키보드 사용)
const kbRoot = $('#virtual-keyboard');
let keyboard = null;
if (IS_MOBILE) {
  // 시스템 키보드 안 뜨게 — 입력은 우리가 가상 키보드로 받음
  inputEl.setAttribute('inputmode', 'none');
  inputEl.setAttribute('readonly', 'readonly');
  // 자동 포커스 안 줘도 됨 (탭으로 자모 받음)
  kbRoot.hidden = false;
  keyboard = new Keyboard(kbRoot, {
    interactive: true,
    onTap: (e) => {
      // 사용자 첫 탭에서 목탁 워밍업 (이미 했으면 no-op)
      mokak.warmup();
      if (e.type === 'jamo') {
        session.virtualInputJamo(e.jamo);
        mokak.strike({ wrong: false });
      } else if (e.type === 'space') {
        session.virtualSpace();
        mokak.strike({ wrong: false });
      } else if (e.type === 'backspace') {
        session.virtualBackspace();
      }
    },
  });
  // 모바일 안내 박스 노출
  const mobileNotice = $('#mobile-notice');
  if (mobileNotice) mobileNotice.hidden = false;
}

// ❌ keydown 핸들러 완전 제거 — e.key 기반 문자/사운드 처리 모두 입력 이벤트에 위임

// ── 초기 UI ─────────────────────────────────────────────────
function buildSectionOptions() {
  sectionSelect.innerHTML = '';
  sections.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i + 1}. ${s.title}`;
    sectionSelect.appendChild(opt);
  });
  sectionSelect.value = String(state.sectionIndex);
}

function applyModeUi() {
  // 긴 글 모드일 땐 섹션 선택 비활성
  if (state.mode === 'long') {
    sectionSelect.style.opacity = '0.4';
    sectionSelect.disabled = true;
  } else {
    sectionSelect.style.opacity = '1';
    sectionSelect.disabled = false;
  }
}

// ── 세션 로드 ───────────────────────────────────────────────
function loadCurrent() {
  applyModeUi();
  let lines = [];
  let title = '';
  let hanja = '';
  let meaning = '';
  let bestKey = '';

  if (state.mode === 'long') {
    // 긴 글: 전체 라인 평탄화. 메타는 시작 섹션 기준.
    lines = sections.flatMap((s) => s.lines);
    title = '전체 — 반야심경';
    hanja = '般若波羅蜜多心經';
    meaning = sections.map((s) => s.meaning).join(' ');
    bestKey = 'long:all';
  } else if (state.mode === 'short') {
    const s = sections[state.sectionIndex];
    lines = s.lines.slice();
    title = s.title;
    hanja = s.hanja;
    meaning = s.meaning;
    bestKey = `short:${s.id}`;
  } else {
    // 한 문장: 선택된 섹션의 첫 라인만
    const s = sections[state.sectionIndex];
    const idx = Math.min(state.sentenceLine, s.lines.length - 1);
    lines = [s.lines[idx]];
    title = `${s.title} — 한 줄`;
    hanja = s.hanja;
    meaning = s.meaning;
    bestKey = `sentence:${s.id}:${idx}`;
  }

  sectionTitle.textContent = title;
  sectionHanja.textContent = hanja;
  meaningText.textContent = meaning;

  stats.setSection(bestKey);
  // load() 호출이 _emit → renderTyping을 트리거하므로 totalChars를 먼저 세팅
  session.totalCharsTarget = lines.reduce((a, l) => a + l.length, 0);
  session.load(lines);
}

// ── 렌더 — 증분 업데이트 (변경된 칸만 텍스트/클래스 갱신) ─────
// 매 탭마다 DOM을 통째 재구축하지 않음 → 모바일 반응 속도 대폭 향상
let lastLineIndex = -1;
let chSpans = []; // 현재 라인의 .ch 스팬들

function rebuildLine(target) {
  typingAreaEl.replaceChildren();
  chSpans = new Array(target.length);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < target.length; i++) {
    const span = document.createElement('span');
    span.className = 'ch';
    if (target[i] === ' ') span.classList.add('space');
    span.textContent = target[i];
    chSpans[i] = span;
    frag.appendChild(span);
  }
  typingAreaEl.appendChild(frag);
}

function renderTyping(s) {
  const { target, committed, composing, lineIndex } = s;

  // 라인 바뀜 / 길이 달라짐 → 한 번만 전체 재구축
  if (lineIndex !== lastLineIndex || chSpans.length !== target.length) {
    rebuildLine(target);
    lastLineIndex = lineIndex;
  }

  // 각 span의 텍스트/클래스만 diff 업데이트
  const composingIdx = committed.length;
  for (let i = 0; i < target.length; i++) {
    const span = chSpans[i];
    const expected = target[i];
    let text;
    let ok = false, bad = false, pending = false, current = false;

    if (i < committed.length) {
      const got = committed[i];
      text = got;
      if (got === expected) ok = true; else bad = true;
    } else if (i === composingIdx && composing) {
      text = composing;
      pending = true; current = true;
    } else if (i === composingIdx) {
      text = expected;
      current = true;
    } else {
      text = expected;
    }

    if (span.textContent !== text) span.textContent = text;
    // classList.toggle은 force 인자로 멱등 — 동일 상태면 DOM 변경 없음
    span.classList.toggle('ok', ok);
    span.classList.toggle('bad', bad);
    span.classList.toggle('pending', pending);
    span.classList.toggle('current', current);
  }

  // 통계 + 진행률
  const doneChars = completedLineChars() + committed.length;
  stats.update({
    totalCorrect: s.totalCorrect,
    totalWrong: s.totalWrong,
    firstKeyAt: s.firstKeyAt,
    totalChars: session.totalCharsTarget || 1,
    doneChars,
  });
}

function completedLineChars() {
  // 이전에 완료한 줄들의 글자 수 합
  let n = 0;
  for (let i = 0; i < session.lineIndex; i++) {
    n += (session.lines[i] || '').length;
  }
  return n;
}

// ── 완료 처리 (자동 진행) ─────────────────────────────────
let autoAdvanceTimer = null;
// 다음 섹션이 있으면 짧게 — 학습 모달이 흐름을 끊지 않도록
// 마지막 섹션(닫기만 가능)은 길게 — 사용자가 의역을 충분히 읽을 시간
const AUTO_ADVANCE_MS_NEXT = 1200;
const AUTO_ADVANCE_MS_LAST = 3500;

function onSessionComplete() {
  const totalStrokes = session.totalCorrect + session.totalWrong;
  const elapsed = session.firstKeyAt
    ? (Date.now() - session.firstKeyAt) / 1000
    : 1;
  const wpm = Math.round((totalStrokes * 60) / Math.max(1, elapsed));
  const acc = totalStrokes
    ? Math.round((session.totalCorrect / totalStrokes) * 100)
    : 100;

  const prevBest = stats.getBest(stats.currentKey);
  const { wpmBest, accBest } = stats.finish({ wpm, acc });

  // ─── 한 문장 모드: 같은 섹션 다음 줄 또는 다음 섹션 첫 줄로 자동 진행 ───
  if (state.mode === 'sentence') {
    const cur = sections[state.sectionIndex];
    if (state.sentenceLine < cur.lines.length - 1) {
      state.sentenceLine += 1;
    } else if (state.sectionIndex < sections.length - 1) {
      state.sectionIndex += 1;
      state.sentenceLine = 0;
      sectionSelect.value = String(state.sectionIndex);
    } else {
      // 마지막 문장 — 처음으로
      state.sectionIndex = 0;
      state.sentenceLine = 0;
      sectionSelect.value = '0';
    }
    // 결과는 짧게 토스트 느낌 — 통계 footer가 갱신되므로 즉시 다음으로
    loadCurrent();
    return;
  }

  // ─── 짧은 글 / 긴 글: 오타 0 + 다음 섹션 있으면 모달 건너뛰고 즉시 다음으로 ───
  const hasNextSection =
    (state.mode === 'short' && state.sectionIndex < sections.length - 1) ||
    state.mode === 'long';
  const isPerfect = session.totalWrong === 0;
  if (isPerfect && hasNextSection) {
    if (state.mode === 'short') {
      state.sectionIndex += 1;
      sectionSelect.value = String(state.sectionIndex);
    } else {
      state.sectionIndex = 0;
      sectionSelect.value = '0';
    }
    loadCurrent();
    return;
  }

  // ─── 그 외: 모달 띄우고 자동 진행 (오타 있으면 결과 확인 / 마지막 섹션이면 의역 학습) ───
  restoreFullModal();
  modalTitle.textContent = sectionTitle.textContent;
  modalWpm.textContent = `${wpm} 타`;
  modalAcc.textContent = `${acc}%`;
  modalWpmBest.textContent = prevBest
    ? `이전 최고 ${prevBest.wpm} 타${wpmBest ? ' · 갱신!' : ''}`
    : wpmBest
      ? '첫 기록!'
      : '';
  modalAccBest.textContent = prevBest
    ? `이전 최고 ${prevBest.acc}%${accBest ? ' · 갱신!' : ''}`
    : accBest
      ? '첫 기록!'
      : '';
  modalMeaning.textContent = meaningText.textContent;
  modalEyebrow.textContent =
    state.mode === 'long' ? '전체 완료' : '섹션 완료';

  if (state.mode === 'long') {
    modalNext.textContent = '처음으로';
  } else if (
    state.mode === 'short' &&
    state.sectionIndex < sections.length - 1
  ) {
    modalNext.textContent = '다음 섹션';
  } else {
    modalNext.textContent = '닫기';
  }

  modal.hidden = false;

  // 자동 진행 — 다음 섹션이 있으면 짧게, 마지막이면 길게
  const delay = hasNextSection ? AUTO_ADVANCE_MS_NEXT : AUTO_ADVANCE_MS_LAST;
  if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = setTimeout(() => {
    if (!modal.hidden) modalNext.click();
  }, delay);
}

function cancelAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

// ── 이벤트 ──────────────────────────────────────────────────
modeSelect.addEventListener('change', () => {
  state.mode = modeSelect.value;
  loadCurrent();
});
sectionSelect.addEventListener('change', () => {
  state.sectionIndex = Number(sectionSelect.value);
  loadCurrent();
});

meaningToggle.addEventListener('click', () => {
  setMeaning(!state.meaningOpen);
});

soundToggle.addEventListener('click', () => {
  const on = mokak.toggle();
  soundToggle.setAttribute('aria-pressed', String(on));
  if (on) {
    // 토글로 켤 때도 같은 워밍업 — 첫 피드백부터 latency 0
    mokak.warmup().then(() => mokak.strike({ wrong: false }));
  }
});

// 중단 버튼 — ESC와 동일 동작
const stopBtn = $('#stop-btn');
stopBtn.addEventListener('click', () => {
  showPartialResults();
});

modalRetry.addEventListener('click', () => {
  cancelAutoAdvance();
  modal.hidden = true;
  loadCurrent();
});

modalNext.addEventListener('click', () => {
  cancelAutoAdvance();
  modal.hidden = true;
  if (state.mode === 'short' && state.sectionIndex < sections.length - 1) {
    state.sectionIndex += 1;
    sectionSelect.value = String(state.sectionIndex);
  } else if (state.mode === 'long') {
    state.sectionIndex = 0;
    sectionSelect.value = '0';
  }
  loadCurrent();
});

// 글로벌 키보드 — Tab=뜻 토글, ESC=모달 닫기 또는 중단 점수
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    setMeaning(!state.meaningOpen);
    session.focus();
    return;
  }
  if (e.key === 'Escape') {
    if (!modal.hidden) {
      cancelAutoAdvance();
      modal.hidden = true;
      session.focus();
    } else if (!introEl.hidden) {
      // 인트로 떠있을 땐 무시
    } else {
      showPartialResults();
    }
  }
});

// 중단 — 타이핑 도중 ESC/⏹. 점수 + 공유만 (의역/best 비교 없음)
function showPartialResults() {
  if (!modal.hidden) return;
  if (session.firstKeyAt === null) return;

  const totalStrokes = session.totalCorrect + session.totalWrong;
  const elapsed = (Date.now() - session.firstKeyAt) / 1000;
  const wpm = Math.round((totalStrokes * 60) / Math.max(1, elapsed));
  const acc = totalStrokes
    ? Math.round((session.totalCorrect / totalStrokes) * 100)
    : 100;

  // ⭐ 중단 모달: 타이틀은 브랜드만, 의역/best 비교는 모두 숨김
  modalEyebrow.textContent = '';
  modalEyebrow.hidden = true;
  modalTitle.textContent = '반야심경 타자';
  modalWpm.textContent = `${wpm} 타`;
  modalAcc.textContent = `${acc}%`;
  modalWpmBest.textContent = 'by 1kproject';
  modalWpmBest.hidden = false;
  modalAccBest.textContent = '';
  modalAccBest.hidden = true;
  modalMeaning.hidden = true;
  modalNext.textContent = '닫기';

  modal.hidden = false;
  cancelAutoAdvance();
}

// 완료 모달 표시할 때 중단에서 숨겼던 요소들 다시 복구
function restoreFullModal() {
  modalEyebrow.hidden = false;
  modalWpmBest.hidden = false;
  modalAccBest.hidden = false;
  modalMeaning.hidden = false;
}

// ─── 공유 기능 ───────────────────────────────────────────────
const modalShare = $('#modal-share');
const shareToast = $('#share-toast');

modalShare.addEventListener('click', () => {
  shareScore();
});

function showShareToast(msg) {
  shareToast.textContent = msg;
  shareToast.hidden = false;
  clearTimeout(showShareToast._t);
  showShareToast._t = setTimeout(() => {
    shareToast.hidden = true;
  }, 2400);
}

async function shareScore() {
  const blob = await generateShareImage();
  const file = new File([blob], 'banya-score.png', { type: 'image/png' });
  const shareText = '반야심경 타자 by 1kproject';
  const shareUrl = window.location.href;

  // 1순위 — Web Share API (모바일/지원 데스크톱)
  if (
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: '반야심경 타자',
        text: shareText,
        url: shareUrl,
      });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 사용자 취소
    }
  }

  // 2순위 — 이미지 다운로드 + 링크 클립보드 복사
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'banya-score.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  let copied = false;
  try {
    await navigator.clipboard.writeText(shareUrl);
    copied = true;
  } catch {}
  showShareToast(
    copied ? '이미지 저장 + 링크 복사됨' : '이미지 저장됨 (링크는 직접 복사해주세요)'
  );
}

// 점수 카드 이미지 생성 — 1080×1080 정사각 (인스타 피드/스토리/카톡 호환)
async function generateShareImage() {
  const totalStrokes = session.totalCorrect + session.totalWrong;
  const elapsed = session.firstKeyAt
    ? (Date.now() - session.firstKeyAt) / 1000
    : 1;
  const wpm = Math.round((totalStrokes * 60) / Math.max(1, elapsed));
  const acc = totalStrokes
    ? Math.round((session.totalCorrect / totalStrokes) * 100)
    : 100;

  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 배경 — 한지 톤
  ctx.fillStyle = '#F7F4EE';
  ctx.fillRect(0, 0, W, H);

  // 외곽 보더 (살짝)
  ctx.strokeStyle = '#E6E0D2';
  ctx.lineWidth = 4;
  ctx.strokeRect(60, 60, W - 120, H - 120);

  // 한자 般若心經
  ctx.fillStyle = '#1C1A17';
  ctx.font = '800 150px "Nanum Myeongjo", "Batang", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('般若心經', W / 2, 280);

  // 한글 타이틀
  ctx.font = '700 56px "Nanum Myeongjo", serif';
  ctx.fillStyle = '#4A443C';
  ctx.fillText('반야심경 타자', W / 2, 360);

  // 금색 디바이더
  ctx.strokeStyle = '#B8860B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 120, 410);
  ctx.lineTo(W / 2 + 120, 410);
  ctx.stroke();

  // 점수 2칸
  const labelY = 540;
  const valueY = 680;
  const unitY = 740;
  const colL = W / 2 - 200;
  const colR = W / 2 + 200;

  ctx.fillStyle = '#8B7D6B';
  ctx.font = '500 30px "Noto Sans KR", sans-serif';
  ctx.fillText('분당 타수', colL, labelY);
  ctx.fillText('정확도', colR, labelY);

  ctx.fillStyle = '#1C1A17';
  ctx.font = '700 130px "Nanum Myeongjo", serif';
  ctx.fillText(String(wpm), colL, valueY);
  ctx.fillText(String(acc) + '%', colR, valueY);

  ctx.fillStyle = '#8B7D6B';
  ctx.font = '500 28px "Noto Sans KR", sans-serif';
  ctx.fillText('타', colL, unitY);

  // 하단 디바이더
  ctx.strokeStyle = '#E6E0D2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(180, 880);
  ctx.lineTo(W - 180, 880);
  ctx.stroke();

  // by 1kproject
  ctx.fillStyle = '#8B7D6B';
  ctx.font = '500 30px "Noto Sans KR", sans-serif';
  ctx.fillText('by 1kproject', W / 2, 940);

  // URL
  ctx.fillStyle = '#B8860B';
  ctx.font = '500 22px "Noto Sans KR", monospace';
  ctx.fillText(window.location.host || 'banya-typing', W / 2, 985);

  return await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/png', 0.95)
  );
}

// 빈 영역 클릭 시 입력에 포커스
document.addEventListener('click', (e) => {
  const t = e.target;
  if (
    t.closest('select') ||
    t.closest('button') ||
    t.closest('.modal') ||
    t.closest('.meaning') ||
    t.closest('.intro')
  ) {
    return;
  }
  session.focus();
});

// 입력이 포커스를 잃으면 즉시 복귀 — 단, IME 조합 / 모달 / 인트로 / 인터랙티브 요소로 갈 땐 안 함
// ⭐ select/button으로 포커스 옮긴 직후 refocus하면 드롭다운이 바로 닫혀버리는 race를 차단
inputEl.addEventListener('blur', (e) => {
  if (!modal.hidden) return;
  if (!introEl?.hidden) return;
  if (session.isComposing) return;
  // 포커스가 다른 인터랙티브 요소로 넘어가는 경우 — refocus 차단 (select 드롭다운 보호)
  const next = e.relatedTarget;
  if (next && next !== document.body) {
    const tag = next.tagName;
    if (tag === 'SELECT' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A') {
      return;
    }
  }
  setTimeout(() => {
    if (session.isComposing) return;
    const active = document.activeElement;
    // 다음 tick에서도 다른 요소가 포커스 잡고 있으면 양보
    if (active && active !== document.body && active !== inputEl) return;
    session.focus();
  }, 0);
});

function setMeaning(open) {
  state.meaningOpen = open;
  meaningEl.hidden = !open;
  meaningToggle.setAttribute('aria-pressed', String(open));
}

// ── 인트로 ─────────────────────────────────────────────────
const INTRO_KEY = 'banya-typing:intro-seen';
const introEl = $('#intro');
const introSkip = $('#intro-dont-show');
const restartBtn = $('#restart-btn');

function showIntro() {
  introEl.hidden = false;
}
function hideIntro() {
  introEl.hidden = true;
  session.focus();
}

function doStart(mode) {
  if (introSkip.checked) {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
  }
  if (mode && mode !== state.mode) {
    state.mode = mode;
    modeSelect.value = mode;
  }
  // ⭐ 사용자 첫 클릭 시점에 AudioContext resume + 목탁 wav 디코드 선행
  // 이래야 첫 타격부터 latency 없이 즉시 재생
  mokak.warmup();
  hideIntro();
  loadCurrent();
}

// 인트로의 모드 버튼 3개 — 각자 모드 골라 바로 시작
document.querySelectorAll('.intro-mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    doStart(btn.dataset.mode);
  });
});

restartBtn.addEventListener('click', () => {
  try { localStorage.removeItem(INTRO_KEY); } catch {}
  showIntro();
});

// ── 초기화 ──────────────────────────────────────────────────
function init() {
  buildSectionOptions();
  modeSelect.value = state.mode;
  soundToggle.setAttribute('aria-pressed', String(mokak.enabled));

  let seen = false;
  try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch {}
  if (seen) {
    introEl.hidden = true;
  } else {
    showIntro();
  }

  loadCurrent();
  // 인트로 떠 있으면 input 포커스 뺏지 않음 — 인트로 클릭이 hidden input blur로 꼬이는 케이스 차단
  if (!introEl.hidden) {
    inputEl.blur();
  }
}

init();
