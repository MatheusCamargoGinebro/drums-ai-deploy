'use strict';
/* =====================================================================
   AudioManager — síntese com Web Audio API (sem arquivos de áudio).
   Vantagens: latência mínima, funciona offline e via file://.
   ===================================================================== */
class AudioManager {
  constructor() {
    this.ctx = null; this.master = null; this.filter = null; this.noiseBuf = null;
    this.openHat = null; this.hold = false; this.cur = null; this.volume = DEFAULT_VOLUME; this.failed = false;
    // Cada tipo de peça mapeia para um método de voz (KISS: sem if/else gigante)
    this.voices = { kick: this._kick, snare: this._snare, tom: this._tom, hat: this._hat, cymbal: this._cymbal };
  }

  /** Cria o AudioContext sob demanda (navegadores exigem gesto do usuário). */
  init() {
    if (this.ctx) return true;
    if (this.failed) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass'; this.filter.frequency.value = 20000;
      const comp = this.ctx.createDynamicsCompressor(); // evita estouro com várias peças juntas
      this.master.connect(this.filter).connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (err) {
      console.error('Web Audio indisponível:', err);
      this.failed = true; this.ctx = null;
      return false;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, .01);
  }

  setFilter(freq) { // cada kit pode abafar o som (ex.: Lo-Fi)
    this.filterFreq = freq || 20000;
    if (this.filter) this.filter.frequency.setTargetAtTime(this.filterFreq, this.ctx.currentTime, .01);
  }

  /** Toca uma peça usando os parâmetros do kit. Retorna false se o áudio não estiver disponível. */
  play(piece, kit, velocity = 1, hold = false) {
    if (!this.init()) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.filterFreq) this.filter.frequency.value = this.filterFreq;
    try {
      const p = this.params(piece, kit);
      this.hold = hold; // true = modo sustentado (som contínuo até release)
      this.cur = { id: piece.id, gains: [], srcs: [] }; // "handle" devolvido ao chamador
      this.voices[piece.type].call(this, p, this.ctx.currentTime, velocity * p.vol, piece);
      return this.cur;
    } catch (err) { console.error('Erro ao tocar', piece.id, err); return false; }
  }

  /** Parâmetros efetivos: tipo base → kit → modificadores da peça → ajustes do usuário (kit.pieceSound). */
  params(piece, kit) {
    const p = { ...BASE_SOUND[piece.type], ...(kit.sound?.[piece.type] || {}), vol: 1 };
    const m = piece.mod || {};
    if (m.freqMul && p.freq) p.freq *= m.freqMul;
    if (m.decayMul) p.decay *= m.decayMul;
    if (m.hpMul && p.hp) p.hp *= m.hpMul;
    return Object.assign(p, kit.pieceSound?.[piece.id]);
  }

  /** Encerra uma nota sustentada com um release curto (como soltar a tecla de um piano). */
  release(h) {
    const t = this.ctx.currentTime;
    h.gains.forEach(g => {
      const a = g.gain;
      if (a.cancelAndHoldAtTime) a.cancelAndHoldAtTime(t); else { a.cancelScheduledValues(t); a.setValueAtTime(a.value, t); }
      a.setTargetAtTime(0, t, .05);
    });
    h.srcs.forEach(s => s.stop(t + .4));
  }

  /* ---------- blocos de construção ---------- */
  _env(g, t, peak, decay) {
    g.gain.setValueAtTime(peak, t);
    // sustentado: cai até 40% e mantém; normal: decai até o silêncio
    g.gain.exponentialRampToValueAtTime(this.hold ? peak * .4 : .001, t + (this.hold ? Math.min(decay, .25) : decay));
    this.cur.gains.push(g);
  }
  _start(src, t, decay, offset = 0) { // sustentado: só para em release()
    src.start(t, offset);
    if (this.hold) this.cur.srcs.push(src); else src.stop(t + decay + .05);
  }
  _osc(wave, f0, f1, t, decay, vol, sweep = .1) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    this._env(g, t, vol, decay);
    o.connect(g).connect(this.master); this._start(o, t, decay);
    return g;
  }
  _noise(t, decay, hp, vol) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf; s.loop = this.hold; f.type = 'highpass'; f.frequency.value = hp;
    this._env(g, t, vol, decay);
    s.connect(f).connect(g).connect(this.master); this._start(s, t, decay, Math.random());
    return g;
  }

  /* ---------- vozes ---------- */
  _kick(p, t, v) { this._osc(p.wave, p.freq, p.end, t, p.decay, v, .12); this._noise(t, .015, 3000, p.click * v); }
  _snare(p, t, v) { this._osc(p.wave, p.freq, p.freq * .6, t, p.decay * .7, p.tone * v, .05); this._noise(t, p.decay, p.hp, p.noise * v); }
  _tom(p, t, v) { this._osc(p.wave, p.freq, p.freq * .55, t, p.decay, v, .15); }
  _hat(p, t, v, piece) {
    if (this.openHat) this.openHat.gain.setTargetAtTime(0, t, .01); // chimbal fechado "corta" o aberto
    const g = this._noise(t, p.decay, p.hp, .6 * v);
    this.openHat = piece.open ? g : null;
  }
  _cymbal(p, t, v) {
    this._noise(t, p.decay, p.hp, .45 * v);
    const g = this.ctx.createGain(), hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = p.hp; this._env(g, t, .12 * v, p.decay);
    hp.connect(g).connect(this.master);
    [1, 1.48, 1.8, 2.54, 2.63, 3.9].forEach(r => { // parciais inarmônicos = timbre metálico
      const o = this.ctx.createOscillator(); o.type = p.wave; o.frequency.value = p.metal * r;
      o.connect(hp); this._start(o, t, p.decay);
    });
  }
}
