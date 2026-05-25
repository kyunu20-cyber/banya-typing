// 한글 IME 안전 입력 처리 (commit-and-clear 패턴)
// ────────────────────────────────────────────────────────────
// 아키텍처
//   SoT(Source of Truth)
//     - committed : 현재 라인에서 확정된 텍스트 (라인 단위 문자열 상태)
//     - composing : IME 조합 중 음절 (시각용 미리보기, 절대 누적 X)
//     - inputEl.value : "한 음절/한 글자" 임시 버퍼. 확정되면 즉시 ''로 비움
//
//   왜 input.value를 장기 SoT로 안 쓰는가
//     - macOS 한글 IME는 value가 라인 길이만큼 누적되면 composition buffer와
//       어긋나는 race를 일으킴 ("보재자관"식 밀림 현상의 직접 원인)
//     - 음절이 확정될 때마다 value를 ''로 비우면 IME가 항상 깨끗한 상태에서
//       다음 음절을 시작 → race 자체가 발생 안 함
//
//   이벤트별 역할
//     compositionstart  → isComposing 플래그만
//     compositionupdate → composing 미리보기 갱신 + rAF로 렌더 코얼레싱
//     compositionend    → e.data를 committed에 push → value='' → 목탁
//     input (non-IME)   → value를 committed에 push → value='' → 목탁
//     keydown Backspace → input이 비었을 때만 committed 롤백 (브라우저 뒤로가기 차단)
//
//   금지
//     - keydown에서 e.key 누적 X
//     - currentIndex 직접 ++/-- X (committed.length로만 도출)
//     - composing을 committed에 합치는 어떤 처리도 X

export class TypingSession {
  constructor({ inputEl, onUpdate, onLineComplete, onComplete, onStrike }) {
    this.inputEl = inputEl;
    this.onUpdate = onUpdate;
    this.onLineComplete = onLineComplete;
    this.onComplete = onComplete;
    this.onStrike = onStrike;

    this.lines = [];
    this.lineIndex = 0;

    this.committed = '';
    this.composing = '';
    this.isComposing = false;
    this.judges = []; // committed[i]의 정/오 — 길이는 committed.length와 항상 일치

    this.totalCorrect = 0;
    this.totalWrong = 0;
    this.firstKeyAt = null;

    this._rafId = 0;
    this._bind();
  }

  _bind() {
    const el = this.inputEl;

    el.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });

    el.addEventListener('compositionupdate', (e) => {
      // 조합 중 자모 미리보기만. committed/judges는 절대 안 건드림.
      this.composing = e.data || '';
      this._scheduleRender();

      // ⭐ 한글 IME는 마지막 음절을 자동 finalize하지 않음 —
      //   committed + composing이 target과 완전 일치하면 blur로 강제 종결.
      //   blur → compositionend(syllable) 자연 발생 → _commit → _advanceLine 흐름.
      const target = this.lines[this.lineIndex] || '';
      if (
        target &&
        this.composing &&
        this.committed + this.composing === target
      ) {
        el.blur();
      }
    });

    el.addEventListener('compositionend', (e) => {
      this.isComposing = false;
      // e.data가 비어 있는 일부 IME를 위한 fallback
      const syllable = e.data || el.value || '';
      this.composing = '';

      // ⭐ 핵심: IME 버퍼 즉시 리셋. 다음 음절은 깨끗한 상태에서 시작.
      // 이 한 줄이 "value 누적 → race → 글자 밀림"을 차단함.
      el.value = '';

      if (syllable) this._commit(syllable);
      this._scheduleRender();
    });

    el.addEventListener('input', (e) => {
      // 조합 중 input 이벤트는 무시 (IME가 처리)
      if (e.isComposing || this.isComposing) return;

      const v = el.value;
      // compositionend에서 우리가 비워 둔 직후 fire되는 빈 input 이벤트
      if (v === '') return;

      el.value = '';
      this._commit(v);
      this._scheduleRender();
    });

    // Backspace만 직접 처리 — 그 외 keydown은 일체 손대지 않음
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace') return;
      if (this.isComposing) return;     // 조합 중이면 IME가 자모 단위로 삭제
      if (el.value !== '') return;      // 영문 한 글자 지우는 중 — 브라우저에 위임
      // input이 빈 상태의 Backspace = committed에서 직접 한 글자 롤백
      e.preventDefault();               // 브라우저 뒤로가기 방지
      if (this.committed.length === 0) return;
      this._popLast();
      this._scheduleRender();
    });
  }

  _commit(str) {
    if (this.firstKeyAt === null) this.firstKeyAt = Date.now();
    const target = this.lines[this.lineIndex] || '';
    let lastOk = true;
    // 코드포인트 단위 (한글 음절은 1코드포인트)
    for (const ch of str) {
      const i = this.committed.length;
      // target 끝을 넘어선 입력은 무시 — 라인 길이 초과 방지
      if (i >= target.length) break;
      const expected = target[i];
      const ok = ch === expected;
      this.committed += ch;
      this.judges[i] = ok;
      if (ok) this.totalCorrect += 1;
      else this.totalWrong += 1;
      lastOk = ok;
    }
    // 목탁 — 음절 단위로 한 번만 (스펙: "IME 종성 확정 시에만 울림")
    this.onStrike && this.onStrike({ ok: lastOk });

    // 라인 완료 — committed가 target과 정확히 같을 때만
    if (this.committed === target && target.length > 0) {
      this._advanceLine();
    }
  }

  _popLast() {
    const i = this.committed.length - 1;
    if (i < 0) return;
    const was = this.judges[i];
    this.committed = this.committed.slice(0, -1);
    this.judges.length = i;
    if (was === true) this.totalCorrect -= 1;
    else if (was === false) this.totalWrong -= 1;
  }

  _advanceLine() {
    this.onLineComplete && this.onLineComplete(this.lineIndex);
    if (this.lineIndex >= this.lines.length - 1) {
      this.onComplete && this.onComplete();
      return;
    }
    this.lineIndex += 1;
    this.committed = '';
    this.composing = '';
    this.judges = [];
    this.inputEl.value = '';
    // blur로 강제 finalize한 경우를 위해 즉시 재포커스 (다음 라인 입력 끊김 방지)
    this.inputEl.focus();
  }

  // rAF로 렌더를 한 프레임에 한 번만 — composition 폭주 시에도 안정
  _scheduleRender() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
      this._emit();
    });
  }

  _emit() {
    const target = this.lines[this.lineIndex] || '';
    this.onUpdate && this.onUpdate({
      lineIndex: this.lineIndex,
      target,
      committed: this.committed,
      composing: this.composing,
      currentIndex: this.committed.length, // committed.length에서만 도출
      totalCorrect: this.totalCorrect,
      totalWrong: this.totalWrong,
      firstKeyAt: this.firstKeyAt,
    });
  }

  load(lines) {
    this.lines = lines.slice();
    this.lineIndex = 0;
    this.committed = '';
    this.composing = '';
    this.judges = [];
    this.isComposing = false;
    this.totalCorrect = 0;
    this.totalWrong = 0;
    this.firstKeyAt = null;
    this.inputEl.value = '';
    this.inputEl.focus();
    this._emit();
  }

  focus() {
    this.inputEl.focus();
  }
}
