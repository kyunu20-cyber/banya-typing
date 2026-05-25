// 분당 타수, 정확도, localStorage 최고기록

const STORAGE_KEY = 'banya-typing:best';

export class Stats {
  constructor({ wpmEl, accEl, bestEl, progressFillEl, progressTextEl }) {
    this.wpmEl = wpmEl;
    this.accEl = accEl;
    this.bestEl = bestEl;
    this.progressFillEl = progressFillEl;
    this.progressTextEl = progressTextEl;
    this.best = this._loadBest();
    this.currentKey = null;
  }

  _loadBest() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  _saveBest() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.best));
    } catch {
      // ignore
    }
  }

  setSection(key) {
    this.currentKey = key;
    this.renderBest();
  }

  renderBest() {
    if (!this.bestEl) return;
    const rec = this.best[this.currentKey];
    if (!rec) {
      this.bestEl.textContent = '— 타 / —%';
    } else {
      this.bestEl.textContent = `${rec.wpm} 타 / ${rec.acc}%`;
    }
  }

  update({ totalCorrect, totalWrong, firstKeyAt, totalChars, doneChars }) {
    const wpm = this._calcWpm(totalCorrect + totalWrong, firstKeyAt);
    const acc = this._calcAcc(totalCorrect, totalWrong);
    if (this.wpmEl) this.wpmEl.textContent = String(wpm);
    if (this.accEl) this.accEl.textContent = String(acc);

    if (this.progressFillEl && totalChars > 0) {
      const pct = Math.min(100, Math.round((doneChars / totalChars) * 100));
      this.progressFillEl.style.width = `${pct}%`;
    }
    if (this.progressTextEl) {
      this.progressTextEl.textContent = `${doneChars} / ${totalChars}`;
    }
    return { wpm, acc };
  }

  _calcWpm(totalStrokes, firstKeyAt) {
    if (!firstKeyAt) return 0;
    const elapsedSec = Math.max(1, (Date.now() - firstKeyAt) / 1000);
    return Math.round((totalStrokes * 60) / elapsedSec);
  }

  _calcAcc(correct, wrong) {
    const total = correct + wrong;
    if (total === 0) return 100;
    return Math.round((correct / total) * 100);
  }

  // 섹션 완료 시 호출 — 최고기록 갱신 여부 반환
  finish({ wpm, acc }) {
    const key = this.currentKey;
    const prev = this.best[key];
    const wpmBest = !prev || wpm > prev.wpm;
    const accBest = !prev || acc > prev.acc;
    const updated = {
      wpm: prev ? Math.max(prev.wpm, wpm) : wpm,
      acc: prev ? Math.max(prev.acc, acc) : acc,
    };
    this.best[key] = updated;
    this._saveBest();
    this.renderBest();
    return { wpmBest, accBest, best: updated };
  }

  getBest(key) {
    return this.best[key] || null;
  }
}
