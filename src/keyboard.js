// 두벌식 가상 키보드 + 다음에 눌러야 할 자모 하이라이트
// 한글 음절을 초·중·종성으로 분해하고, 현재 IME 조합 상태와 비교해 다음 자모를 계산한다.

// ─── 자모 테이블 ─────────────────────────────────────────────
const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];
const JUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ',
  'ㅣ',
];
const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

// 복합 자모 분해 (받침 + 모음)
const DECOMPOSE = {
  ㄲ: ['ㄱ', 'ㄱ'],
  ㄳ: ['ㄱ', 'ㅅ'],
  ㄵ: ['ㄴ', 'ㅈ'],
  ㄶ: ['ㄴ', 'ㅎ'],
  ㄺ: ['ㄹ', 'ㄱ'],
  ㄻ: ['ㄹ', 'ㅁ'],
  ㄼ: ['ㄹ', 'ㅂ'],
  ㄽ: ['ㄹ', 'ㅅ'],
  ㄾ: ['ㄹ', 'ㅌ'],
  ㄿ: ['ㄹ', 'ㅍ'],
  ㅀ: ['ㄹ', 'ㅎ'],
  ㅄ: ['ㅂ', 'ㅅ'],
  ㅆ: ['ㅅ', 'ㅅ'],
  ㅘ: ['ㅗ', 'ㅏ'],
  ㅙ: ['ㅗ', 'ㅐ'],
  ㅚ: ['ㅗ', 'ㅣ'],
  ㅝ: ['ㅜ', 'ㅓ'],
  ㅞ: ['ㅜ', 'ㅔ'],
  ㅟ: ['ㅜ', 'ㅣ'],
  ㅢ: ['ㅡ', 'ㅣ'],
};

// 두벌식 매핑: 자모 → { key: 'A', shift: false }
const JAMO_TO_KEY = {
  ㅂ: ['Q', false], ㅈ: ['W', false], ㄷ: ['E', false], ㄱ: ['R', false],
  ㅅ: ['T', false], ㅛ: ['Y', false], ㅕ: ['U', false], ㅑ: ['I', false],
  ㅐ: ['O', false], ㅔ: ['P', false],
  ㅁ: ['A', false], ㄴ: ['S', false], ㅇ: ['D', false], ㄹ: ['F', false],
  ㅎ: ['G', false], ㅗ: ['H', false], ㅓ: ['J', false], ㅏ: ['K', false],
  ㅣ: ['L', false],
  ㅋ: ['Z', false], ㅌ: ['X', false], ㅊ: ['C', false], ㅍ: ['V', false],
  ㅠ: ['B', false], ㅜ: ['N', false], ㅡ: ['M', false],
  // 쌍자음 + ㅒ ㅖ
  ㅃ: ['Q', true], ㅉ: ['W', true], ㄸ: ['E', true], ㄲ: ['R', true],
  ㅆ: ['T', true], ㅒ: ['O', true], ㅖ: ['P', true],
};

// 키보드 시각 레이아웃 (영문 + 두벌식 자모 병기)
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
  ],
  [['SPACE', '', '']],
];

// ─── 한글 분해 ────────────────────────────────────────────────
export function decomposeSyllable(ch) {
  if (!ch) return null;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) {
    // 음절 범위 밖 (공백, 한자, 호환 자모 등) — 그대로 반환
    return { type: 'literal', char: ch };
  }
  const choIdx = Math.floor(code / (21 * 28));
  const jungIdx = Math.floor((code % (21 * 28)) / 28);
  const jongIdx = code % 28;
  return {
    type: 'syllable',
    cho: CHO[choIdx],
    jung: JUNG[jungIdx],
    jong: JONG[jongIdx], // '' 가능
  };
}

// 자모를 입력 순서대로 평탄화 (복합 자모는 분해)
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
  push(syllable.cho);
  push(syllable.jung);
  push(syllable.jong);
  return out;
}

// 조합 중 음절(composing)이 target 음절의 어디까지 진행됐는지 인덱스 반환
export function progressInTarget(targetSyl, composingSyl) {
  if (!targetSyl || targetSyl.type !== 'syllable') return 0;
  if (!composingSyl || composingSyl.type !== 'syllable') return 0;
  const targetSeq = flattenJamo(targetSyl);
  const compSeq = flattenJamo(composingSyl);
  // 가장 단순: prefix 매칭 길이
  let i = 0;
  while (
    i < targetSeq.length &&
    i < compSeq.length &&
    targetSeq[i] === compSeq[i]
  ) {
    i += 1;
  }
  return i;
}

// 다음 입력해야 할 자모 (없으면 null = 음절 완성 직전)
export function nextJamo(targetChar, composingChar) {
  if (!targetChar) return null;
  // 공백/한자 등은 그 글자 자체가 키
  if (targetChar === ' ') return { key: 'SPACE', shift: false };
  const t = decomposeSyllable(targetChar);
  if (!t || t.type !== 'syllable') return null;
  const c = composingChar ? decomposeSyllable(composingChar) : null;
  const targetSeq = flattenJamo(t);
  const compSeq = c ? flattenJamo(c) : [];
  // prefix 위치
  let i = 0;
  while (
    i < targetSeq.length &&
    i < compSeq.length &&
    targetSeq[i] === compSeq[i]
  ) {
    i += 1;
  }
  if (i >= targetSeq.length) return null;
  const jamo = targetSeq[i];
  const map = JAMO_TO_KEY[jamo];
  if (!map) return null;
  return { key: map[0], shift: map[1], jamo };
}

// ─── 키보드 렌더 ──────────────────────────────────────────────
export class Keyboard {
  constructor(root) {
    this.root = root;
    this.keyEls = new Map(); // key (e.g., 'Q') → element
    this._render();
  }

  _render() {
    this.root.innerHTML = '';
    ROWS.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      row.forEach(([key, jamo, shiftJamo]) => {
        const el = document.createElement('div');
        el.className = 'kb-key';
        if (key === 'SPACE') el.classList.add('space');
        if (key === 'SHIFT') el.classList.add('wide');

        if (shiftJamo) {
          const s = document.createElement('span');
          s.className = 'kb-shift';
          s.textContent = shiftJamo;
          el.appendChild(s);
        } else if (key !== 'SPACE' && key !== 'SHIFT') {
          // 균형용 빈 공간
          const s = document.createElement('span');
          s.className = 'kb-shift';
          s.textContent = ' ';
          el.appendChild(s);
        }

        const j = document.createElement('span');
        j.className = 'kb-jamo';
        if (key === 'SPACE') j.textContent = 'space';
        else if (key === 'SHIFT') j.textContent = '⇧ shift';
        else j.textContent = jamo || key;
        el.appendChild(j);

        if (key !== 'SPACE' && key !== 'SHIFT') {
          const k = document.createElement('span');
          k.className = 'kb-shift';
          k.textContent = key;
          el.appendChild(k);
        }

        this.keyEls.set(key, el);
        rowEl.appendChild(el);
      });
      this.root.appendChild(rowEl);
    });
  }

  clearHints() {
    this.keyEls.forEach((el) => {
      el.classList.remove('next', 'shift-hint');
    });
  }

  highlight({ key, shift }) {
    this.clearHints();
    if (!key) return;
    const el = this.keyEls.get(key);
    if (el) el.classList.add('next');
    if (shift) {
      const sh = this.keyEls.get('SHIFT');
      if (sh) sh.classList.add('shift-hint');
    }
  }

  // 실제 키 입력 시각 피드백 (살짝 눌림)
  pressByJamo(jamo) {
    const map = JAMO_TO_KEY[jamo];
    if (!map) return;
    const el = this.keyEls.get(map[0]);
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 90);
  }
}
