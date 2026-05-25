import { sections } from './sutra.js?v=23';
import { TypingSession } from './typing.js?v=23';
import { Stats } from './stats.js?v=23';
import { Mokak } from './mokak.js?v=23';

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

// ── 렌더 (typing.works 스타일 — 단일 라인 덮어쓰기) ────────
let lastCommittedLen = 0;
let lastLineIndex = -1;

function renderTyping(s) {
  const { target, committed, composing, lineIndex } = s;

  // 새 줄로 넘어가면 카운터 리셋
  if (lineIndex !== lastLineIndex) {
    lastCommittedLen = 0;
    lastLineIndex = lineIndex;
  }
  // Backspace로 줄어들면 lastCommittedLen도 따라 내림 — 재입력 시 애니메이션 재실행 보장
  if (committed.length < lastCommittedLen) {
    lastCommittedLen = committed.length;
  }

  // 본문 한 줄을 글자별 span으로 — 친 자리는 정타/오타 색으로 덮어씀
  const frag = document.createDocumentFragment();
  const composingIdx = committed.length; // 조합 중 음절이 들어갈 자리
  for (let i = 0; i < target.length; i++) {
    const expected = target[i];
    const span = document.createElement('span');
    span.className = 'ch';
    if (expected === ' ') span.classList.add('space');

    if (i < committed.length) {
      // 이미 결정된 자리 — 사용자가 친 글자로 덮어씀
      const got = committed[i];
      const isOk = got === expected;
      span.textContent = got;
      span.classList.add(isOk ? 'ok' : 'bad');
      // 이전에 이미 처리된 글자는 애니메이션 비활성 (반복 깜빡임 방지)
      if (i < lastCommittedLen) span.style.animation = 'none';
    } else if (i === composingIdx && composing) {
      // 조합 중 음절을 그 자리에 옅게 미리보기
      span.textContent = composing;
      span.classList.add('pending', 'current');
    } else if (i === composingIdx) {
      // 다음 칠 차례 — 가이드 글자 + 커서
      span.textContent = expected;
      span.classList.add('current');
    } else {
      // 아직 안 친 가이드 글자
      span.textContent = expected;
    }
    frag.appendChild(span);
  }
  typingAreaEl.innerHTML = '';
  typingAreaEl.appendChild(frag);

  lastCommittedLen = committed.length;

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
  // 즉시 한 번 울려 피드백
  if (on) mokak.strike({ wrong: false });
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

// 중단 — 타이핑 도중 ESC. 지금까지 친 분량으로 점수 모달 (auto-advance 없음)
function showPartialResults() {
  if (!modal.hidden) return;
  if (session.firstKeyAt === null) return; // 아무것도 안 친 상태면 무시

  const totalStrokes = session.totalCorrect + session.totalWrong;
  const elapsed = (Date.now() - session.firstKeyAt) / 1000;
  const wpm = Math.round((totalStrokes * 60) / Math.max(1, elapsed));
  const acc = totalStrokes
    ? Math.round((session.totalCorrect / totalStrokes) * 100)
    : 100;
  const prevBest = stats.getBest(stats.currentKey);

  modalEyebrow.textContent = '중단';
  modalTitle.textContent = sectionTitle.textContent;
  modalWpm.textContent = `${wpm} 타`;
  modalAcc.textContent = `${acc}%`;
  modalWpmBest.textContent = prevBest ? `이전 최고 ${prevBest.wpm} 타` : '';
  modalAccBest.textContent = prevBest ? `이전 최고 ${prevBest.acc}%` : '';
  modalMeaning.textContent = meaningText.textContent;

  // 중단은 best 갱신 X (완주 아니므로) — stats.finish 호출 안 함
  // 버튼: 다시(현재 섹션) / 닫기 또는 다음
  if (state.mode === 'short' && state.sectionIndex < sections.length - 1) {
    modalNext.textContent = '다음 섹션';
  } else if (state.mode === 'long') {
    modalNext.textContent = '처음으로';
  } else {
    modalNext.textContent = '닫기';
  }

  modal.hidden = false;
  cancelAutoAdvance(); // 중단 모달은 자동 진행 안 함
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

// 입력이 포커스를 잃으면 즉시 복귀 (모달/인트로 떠있을 땐 X)
// ⭐ IME 조합 중에는 refocus 금지 — 한자 후보창 띄울 때 잠깐 blur되는데
//    여기서 refocus하면 composition이 끊겨서 Backspace 연속 삭제가 멈춤
inputEl.addEventListener('blur', () => {
  if (!modal.hidden) return;
  if (!introEl?.hidden) return;
  if (session.isComposing) return;
  setTimeout(() => {
    if (session.isComposing) return; // 다음 tick에서도 한 번 더 확인
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
const introStartBtn = $('#intro-start');
const introSkip = $('#intro-dont-show');
const restartBtn = $('#restart-btn');

function showIntro() {
  introEl.hidden = false;
}
function hideIntro() {
  introEl.hidden = true;
  session.focus();
}

function doStart() {
  if (introSkip.checked) {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
  }
  hideIntro();
}
introStartBtn.addEventListener('click', doStart);
// pointerdown으로도 받아서 click이 누락되는 케이스 방지
introStartBtn.addEventListener('pointerdown', (e) => {
  // 다음 frame에서 click이 정상 발생하면 click 핸들러가 처리.
  // click이 안 오는 경우(blur 가로채기 등) 대비 fallback
  setTimeout(() => {
    if (!introEl.hidden) doStart();
  }, 50);
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
