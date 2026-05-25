// 두벌식 가상 키보드 — 탭으로 자모/Space/Backspace 입력.
// 모바일에서 시스템 키보드(천지인 등) 대신 이걸 메인 입력으로 사용.

// ─── 키 정의 ────────────────────────────────────────────────
// [id, 기본 자모, shift 자모(있으면)]
const ROWS = [
  [
    ['Q', 'ㅂ', 'ㅃ'], ['W', 'ㅈ', 'ㅉ'], ['E', 'ㄷ', 'ㄸ'], ['R', 'ㄱ', 'ㄲ'],
    ['T', 'ㅅ', 'ㅆ'], ['Y', 'ㅛ', ''], ['U', 'ㅕ', ''], ['I', 'ㅑ', ''],
    ['O', 'ㅐ', 'ㅒ'], ['P', 'ㅔ', 'ㅖ'],
  ],
  [
    ['A', 'ㅁ', ''], ['S', 'ㄴ', ''], ['D', 'ㅇ', ''], ['F', 'ㄹ', ''],
    ['G', 'ㅎ', ''], ['H', 'ㅗ', ''], ['J', 'ㅓ', ''], ['K', 'ㅏ', ''],
    ['L', 'ㅣ', ''],
  ],
  [
    ['SHIFT', '⇧', ''], ['Z', 'ㅋ', ''], ['X', 'ㅌ', ''], ['C', 'ㅊ', ''],
    ['V', 'ㅍ', ''], ['B', 'ㅠ', ''], ['N', 'ㅜ', ''], ['M', 'ㅡ', ''],
    ['BACKSPACE', '⌫', ''],
  ],
  [['SPACE', '간격', '']],
];

// 영문 키 → 자모 매핑 (PC 물리 키보드 next-hint용)
const KEY_TO_JAMO = {};
ROWS.forEach((row) => row.forEach(([k, j, sj]) => {
  if (j && k.length === 1) KEY_TO_JAMO[k] = { jamo: j, shiftJamo: sj || null };
}));

// 자모 → 키 역매핑 (다음에 칠 키 하이라이트용)
const JAMO_TO_KEY = {};
ROWS.forEach((row) => row.forEach(([k, j, sj]) => {
  if (j && k.length === 1) {
    if (!JAMO_TO_KEY[j]) JAMO_TO_KEY[j] = { key: k, shift: false };
    if (sj) JAMO_TO_KEY[sj] = { key: k, shift: true };
  }
}));

// ─── 한글 분해 (다음 자모 힌트용) ─────────────────────────────
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const DECOMPOSE = {
  ㄲ: ['ㄱ','ㄱ'], ㄳ: ['ㄱ','ㅅ'], ㄵ: ['ㄴ','ㅈ'], ㄶ: ['ㄴ','ㅎ'],
  ㄺ: ['ㄹ','ㄱ'], ㄻ: ['ㄹ','ㅁ'], ㄼ: ['ㄹ','ㅂ'], ㄽ: ['ㄹ','ㅅ'],
  ㄾ: ['ㄹ','ㅌ'], ㄿ: ['ㄹ','ㅍ'], ㅀ: ['ㄹ','ㅎ'], ㅄ: ['ㅂ','ㅅ'],
  ㅆ: ['ㅅ','ㅅ'], ㅘ: ['ㅗ','ㅏ'], ㅙ: ['ㅗ','ㅐ'], ㅚ: ['ㅗ','ㅣ'],
  ㅝ: ['ㅜ','ㅓ'], ㅞ: ['ㅜ','ㅔ'], ㅟ: ['ㅜ','ㅣ'], ㅢ: ['ㅡ','ㅣ'],
};

export function decomposeSyllable(ch) {
  if (!ch) return null;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return { type: 'literal', char: ch };
  const choIdx = Math.floor(code / (21 * 28));
  const jungIdx = Math.floor((code % (21 * 28)) / 28);
  const jongIdx = code % 28;
  return {
    type: 'syllable',
    cho: CHO[choIdx],
    jung: JUNG[jungIdx],
    jong: JONG[jongIdx],
  };
}

export function flattenJamo(syllable) {
  if (!syllable || syllable.type !== 'syllable') return [];
  const out = [];
  const push = (jamo) => {
    if (!jamo) return;
    if (DECOMPOSE[jamo]) {
      const [a, b] = DECOMPOSE[jamo];
      out.push(a, b);
    } else {
      out.push(jamo);
    }
  };
  push(syllable.cho); push(syllable.jung); push(syllable.jong);
  return out;
}

// 다음에 입력해야 할 자모/키 — 화면 하이라이트용
export function nextJamo(targetChar, composingChar) {
  if (!targetChar) return null;
  if (targetChar === ' ') return { key: 'SPACE', shift: false };
  const t = decomposeSyllable(targetChar);
  if (!t || t.type !== 'syllable') return null;
  const c = composingChar ? decomposeSyllable(composingChar) : null;
  const targetSeq = flattenJamo(t);
  const compSeq = c ? flattenJamo(c) : [];
  let i = 0;
  while (i < targetSeq.length && i < compSeq.length && targetSeq[i] === compSeq[i]) i += 1;
  if (i >= targetSeq.length) return null;
  const jamo = targetSeq[i];
  const map = JAMO_TO_KEY[jamo];
  if (!map) return null;
  return { key: map.key, shift: map.shift, jamo };
}

// ─── 인터랙티브 키보드 ────────────────────────────────────────
export class Keyboard {
  // onTap({ type: 'jamo'|'space'|'backspace', jamo?, key? })
  constructor(root, { onTap, interactive = true } = {}) {
    this.root = root;
    this.onTap = onTap;
    this.interactive = interactive;
    this.keyEls = new Map();
    this.shiftDown = false;
    this._render();
  }

  _render() {
    this.root.innerHTML = '';
    ROWS.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      row.forEach(([key, jamo, shiftJamo]) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'kb-key';
        el.dataset.key = key;
        if (key === 'SPACE') el.classList.add('space');
        if (key === 'SHIFT') el.classList.add('mod');
        if (key === 'BACKSPACE') el.classList.add('mod');

        // 자모 라벨
        const j = document.createElement('span');
        j.className = 'kb-jamo';
        j.textContent = jamo || (key === 'SPACE' ? '간격' : key);
        el.appendChild(j);

        // 영문/Shift 보조 표기 (PC 힌트용)
        if (key !== 'SPACE' && key !== 'SHIFT' && key !== 'BACKSPACE') {
          const s = document.createElement('span');
          s.className = 'kb-sub';
          s.textContent = shiftJamo || key;
          el.appendChild(s);
        }

        if (this.interactive) {
          // pointerdown으로 받아 즉시 반응 (click의 ~300ms 지연 회피)
          el.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            this._handleTap(key, jamo, shiftJamo);
          });
        }

        this.keyEls.set(key, el);
        rowEl.appendChild(el);
      });
      this.root.appendChild(rowEl);
    });
  }

  _handleTap(key, jamo, shiftJamo) {
    // 시각 피드백
    const el = this.keyEls.get(key);
    if (el) {
      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 90);
    }

    if (key === 'SHIFT') {
      this.shiftDown = !this.shiftDown;
      this._refreshShiftVisual();
      return;
    }
    if (key === 'SPACE') {
      this.onTap && this.onTap({ type: 'space' });
      return;
    }
    if (key === 'BACKSPACE') {
      this.onTap && this.onTap({ type: 'backspace' });
      return;
    }
    let emit = jamo;
    if (this.shiftDown && shiftJamo) emit = shiftJamo;
    this.onTap && this.onTap({ type: 'jamo', jamo: emit });
    // 한 글자 입력 후 shift 자동 해제 (모바일 표준)
    if (this.shiftDown) {
      this.shiftDown = false;
      this._refreshShiftVisual();
    }
  }

  _refreshShiftVisual() {
    const sh = this.keyEls.get('SHIFT');
    if (!sh) return;
    if (this.shiftDown) sh.classList.add('active');
    else sh.classList.remove('active');
    // 키 라벨도 shift 적용 표시
    this.keyEls.forEach((el, key) => {
      const isLetter = key.length === 1;
      if (!isLetter) return;
      const jamoEl = el.querySelector('.kb-jamo');
      if (!jamoEl) return;
      // 데이터에서 원래 자모를 다시 찾아 표기
      const row = ROWS.flat().find((r) => r[0] === key);
      if (!row) return;
      const [, j, sj] = row;
      jamoEl.textContent = this.shiftDown && sj ? sj : j;
    });
  }

  // 다음에 칠 자모 하이라이트 (PC에서 유용)
  highlight(hint) {
    this.keyEls.forEach((el) => el.classList.remove('next', 'shift-hint'));
    if (!hint || !hint.key) return;
    const el = this.keyEls.get(hint.key);
    if (el) el.classList.add('next');
    if (hint.shift) {
      const sh = this.keyEls.get('SHIFT');
      if (sh) sh.classList.add('shift-hint');
    }
  }

  // 물리 키보드 입력 시 키 시각 피드백 (PC)
  pressByKey(keyCode) {
    const el = this.keyEls.get(keyCode);
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 90);
  }
}
