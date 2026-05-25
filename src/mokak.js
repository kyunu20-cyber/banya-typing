// 목탁(木鐸) 사운드 — assets/mokak.wav 재생
// 빠른 연타에서도 끊김 없도록 매번 새 source 노드를 만들고, 정타/오타는 게인·피치로 구분

const STORAGE_KEY = 'banya-typing:audio';
const SOURCE_URL = 'assets/mokak.wav';

export class Mokak {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffer = null;
    this._loading = null;
    const saved = this._loadPrefs();
    this.enabled = saved.enabled ?? true;
    this.volume = saved.volume ?? 0.8;
  }

  _loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  _savePrefs() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enabled: this.enabled, volume: this.volume }),
      );
    } catch {
      // ignore
    }
  }

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  async _loadBuffer() {
    if (this.buffer) return this.buffer;
    if (this._loading) return this._loading;
    this._ensureCtx();
    if (!this.ctx) return null;
    this._loading = (async () => {
      try {
        const res = await fetch(SOURCE_URL);
        const arr = await res.arrayBuffer();
        this.buffer = await this.ctx.decodeAudioData(arr);
        return this.buffer;
      } catch (e) {
        console.warn('목탁 사운드 로드 실패:', e);
        return null;
      }
    })();
    return this._loading;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this._savePrefs();
    if (on) this._loadBuffer(); // 미리 디코딩
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
    this._savePrefs();
  }

  strike({ wrong = false } = {}) {
    if (!this.enabled) return;
    this._ensureCtx();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    // 버퍼 미준비면 비동기 로드 후 한 번만 — 다음부터는 즉시 재생
    if (!this.buffer) {
      this._loadBuffer().then((b) => {
        if (b) this._play(b, wrong);
      });
      return;
    }
    this._play(this.buffer, wrong);
  }

  _play(buffer, wrong) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    // 오타는 살짝 낮은 피치 + 음량 ↓ 로 둔탁하게
    src.playbackRate.value = wrong ? 0.85 : 1.0;
    const g = this.ctx.createGain();
    const peak = wrong ? 0.55 : 1.0;
    // 1초까지만 재생 + 끝에서 짧게 페이드아웃해 클릭음 방지
    const duration = Math.min(1.0, buffer.duration);
    const fade = 0.05;
    g.gain.setValueAtTime(peak, now);
    g.gain.setValueAtTime(peak, now + Math.max(0, duration - fade));
    g.gain.linearRampToValueAtTime(0.0001, now + duration);
    src.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + duration + 0.02);
  }
}
