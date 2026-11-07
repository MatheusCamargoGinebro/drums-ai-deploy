'use strict';
/* =====================================================================
   Camadas: Store (persistência) · AnimationController (visual)
            DrumKitManager (estado/orquestração) · KeyboardController (entrada)
            UIController (DOM, remapeamento de teclas, editor Custom) · bootstrap
   ===================================================================== */

/** localStorage com tratamento de erro (pode estar bloqueado pelo navegador). */
const Store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('bv.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bv.' + k, JSON.stringify(v)); } catch { /* ignora */ } },
};

/** Animações de impacto — o CSS faz o trabalho; aqui só (re)disparamos classes. */
class AnimationController {
  constructor(stage) {
    this.stage = stage;
    stage.addEventListener('animationend', e => {
      if (e.animationName === 'ring') e.target.parentElement.classList.remove('hit');
      if (e.animationName === 'swap') stage.classList.remove('switching');
    });
  }
  pad(id) { return this.stage.querySelector(`[data-id="${id}"]`); }
  hit(id) {
    const el = this.pad(id); if (!el) return;
    el.classList.remove('hit'); void el.offsetWidth; // força reflow para reiniciar a animação
    el.classList.add('hit');
  }
  hold(id, on) { this.pad(id)?.classList.toggle('held', on); } // destaque contínuo (modo sustentado)
  swap() { this.stage.classList.remove('switching'); void this.stage.offsetWidth; this.stage.classList.add('switching'); }
}

/** Mantém kit atual e modo sustentado; coordena som + animação. */
class DrumKitManager {
  constructor(kits, pieces, audio, anim) {
    this.kits = kits; this.pieces = pieces; this.audio = audio; this.anim = anim;
    this.onError = null; this.kit = null; this.sustain = false;
    this.held = new Map(); // origem do toque ('p:<pointerId>' ou 'k:<tecla>') → nota sustentada
    this.setKit(DEFAULT_KIT_ID);
  }
  find(id) { return this.pieces.find(p => p.id === id); }
  setKit(id) {
    const kit = this.kits.find(k => k.id === id);
    if (!kit) return null;
    this.releaseAll(); this.kit = kit; this.audio.setFilter(kit.filter);
    return kit;
  }
  setSustain(on) { this.sustain = on; if (!on) this.releaseAll(); }
  reset() { this.releaseAll(); this.sustain = false; this.audio.setVolume(DEFAULT_VOLUME); return this.setKit(DEFAULT_KIT_ID); }

  /** Pressionar (mouse, toque ou tecla). `src` identifica quem pressionou, para soltar depois. */
  press(id, src) {
    const piece = this.find(id); if (!piece) return;
    this.release(src);
    this.anim.hit(id); // visual sempre; áudio pode falhar
    const h = this.audio.play(piece, this.kit, 1, this.sustain);
    if (!h) return this.onError?.('Áudio indisponível neste navegador.');
    if (this.sustain) { this.held.set(src, h); this.anim.hold(id, true); }
  }
  release(src) {
    const h = this.held.get(src); if (!h) return;
    this.audio.release(h); this.held.delete(src); this.anim.hold(h.id, false);
  }
  releaseAll() { [...this.held.keys()].forEach(s => this.release(s)); }
  preview(id) { const p = this.find(id); if (p) { this.anim.hit(id); this.audio.play(p, this.kit); } }
}

/** Teclado físico → peças. Consulta `piece.key` a cada tecla, então remapear funciona na hora. */
class KeyboardController {
  constructor(pieces, manager) {
    document.addEventListener('keydown', e => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('select, input, summary, .ctrl')) return; // não rouba teclas dos controles
      const k = e.key.toLowerCase(), piece = pieces.find(p => p.key === k);
      if (piece) { e.preventDefault(); manager.press(piece.id, 'k:' + k); }
    });
    document.addEventListener('keyup', e => manager.release('k:' + e.key.toLowerCase()));
    window.addEventListener('blur', () => manager.releaseAll()); // evita notas "presas"
  }
}

/** Construção e atualização do DOM. */
class UIController {
  constructor(manager, audio) {
    this.m = manager; this.audio = audio; this.listening = null;
    this.custom = manager.kits.find(k => k.custom);
    this.$ = s => document.querySelector(s);
    this.root = document.documentElement;
  }
  static keyLabel(k) { return k === ' ' ? 'Espaço' : k.toUpperCase(); }

  init() {
    const { pieces, kits } = this.m, stage = this.$('#stage');
    // Restaura teclas e kit Custom salvos
    const keys = Store.get('keys', {});
    pieces.forEach(p => { if (typeof keys[p.id] === 'string') p.key = keys[p.id]; });
    const c = Store.get('custom', null);
    if (c) Object.assign(this.custom, { theme: { ...CUSTOM_THEME, ...c.theme }, pieceSound: c.pieceSound || {}, filter: c.filter || 0 });

    stage.innerHTML = pieces.map(p => `
      <button type="button" class="pad" data-id="${p.id}" data-type="${p.type}" style="grid-area:${p.id}">
        <span class="pad__name">${p.name}</span><kbd></kbd>
      </button>`).join('');
    // pointerdown/up = menor latência e suporte a multitoque; mouse, toque e caneta
    stage.addEventListener('pointerdown', e => {
      const pad = e.target.closest('.pad');
      if (pad) { e.preventDefault(); this.m.press(pad.dataset.id, 'p:' + e.pointerId); }
    });
    ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, e => this.m.release('p:' + e.pointerId)));

    this.$('#kit-select').innerHTML = kits.map(k => `<option value="${k.id}">${k.name}</option>`).join('');
    this.$('#kit-select').addEventListener('change', e => this.changeKit(e.target.value));
    this.$('#volume').addEventListener('input', e => this.audio.setVolume(+e.target.value));
    this.$('#sustain').addEventListener('change', e => this.m.setSustain(e.target.checked));
    this.$('#reset').addEventListener('click', () => this.reset());
    this.m.onError = msg => this.status(msg);

    this.initRemap();
    this.renderEditor();
    this.refreshKeys();
    this.applyKit(this.m.kit);
  }

  changeKit(id) {
    const kit = this.m.setKit(id);
    if (!kit) return this.status('Kit não encontrado.');
    this.applyKit(kit); this.m.anim.swap(); this.status(`Kit: ${kit.name}`);
  }

  reset() { // volta ao estado inicial (o kit Custom guarda suas edições; use "Zerar kit Custom")
    this.m.reset();
    this.m.pieces.forEach(p => { p.key = DEFAULT_KEYS[p.id]; });
    Store.set('keys', DEFAULT_KEYS);
    this.$('#sustain').checked = false;
    this.refreshKeys(); this.applyKit(this.m.kit); this.status('Kit padrão, teclas e modo normal restaurados.');
  }

  /** Aplica o tema do kit como variáveis CSS e sincroniza controles. */
  applyKit(kit) {
    Object.entries({ ...THEME_BASE, ...kit.theme }).forEach(([k, v]) => this.root.style.setProperty(`--${k}`, v));
    this.$('#kit-badge').textContent = kit.name;
    this.$('#kit-select').value = kit.id;
    this.$('#volume').value = this.audio.volume;
    this.$('#editor').hidden = !kit.custom;
  }

  /* ---------- Remapeamento de teclas ---------- */
  initRemap() {
    this.$('#help-body').addEventListener('click', e => {
      const b = e.target.closest('[data-remap]'); if (!b) return;
      this.listening = b.dataset.remap; this.refreshKeys();
      this.status(`Pressione a nova tecla para "${this.m.find(this.listening).name}" (Esc cancela).`);
    });
    // Captura (fase de captura) para que a tecla não toque nenhuma peça enquanto remapeia
    document.addEventListener('keydown', e => {
      if (!this.listening) return;
      e.preventDefault(); e.stopPropagation();
      const id = this.listening; this.listening = null;
      if (e.key === 'Escape') this.status('Remapeamento cancelado.');
      else if (e.key.length !== 1) this.status('Tecla inválida: use letras, números, símbolos ou Espaço.');
      else this.assignKey(id, e.key.toLowerCase());
      this.refreshKeys();
    }, true);
  }

  assignKey(id, key) {
    const piece = this.m.find(id), other = this.m.pieces.find(p => p.key === key && p.id !== id);
    if (other) other.key = piece.key; // conflito: as duas peças trocam de tecla
    piece.key = key;
    Store.set('keys', Object.fromEntries(this.m.pieces.map(p => [p.id, p.key])));
    this.status(`${piece.name} → ${UIController.keyLabel(key)}` + (other ? ` (${other.name} recebeu a tecla anterior)` : ''));
  }

  /** Atualiza rótulos nos pads, ARIA e tabela de ajuda. */
  refreshKeys() {
    this.m.pieces.forEach(p => {
      const pad = this.m.anim.pad(p.id), l = UIController.keyLabel(p.key);
      pad.querySelector('kbd').textContent = l;
      pad.setAttribute('aria-label', `${p.name}, tecla ${l}`);
      pad.setAttribute('aria-keyshortcuts', p.key === ' ' ? 'Space' : p.key);
    });
    this.$('#help-body').innerHTML = this.m.pieces.map(p => {
      const wait = this.listening === p.id;
      return `<tr><td>${p.name}</td><td><button type="button" class="ctrl keybtn${wait ? ' waiting' : ''}" data-remap="${p.id}">${wait ? 'Aguardando…' : UIController.keyLabel(p.key)}</button></td></tr>`;
    }).join('');
  }

  /* ---------- Editor do kit Custom ---------- */
  renderEditor() {
    const c = this.custom, th = { ...THEME_BASE, ...c.theme };
    const field = (pid, prm, val) => {
      const s = PARAM_SPECS[prm];
      if (prm === 'wave') return `<label>${s.label}<select class="ctrl" data-piece="${pid}" data-param="wave">${WAVES.map(w => `<option${w === val ? ' selected' : ''}>${w}</option>`).join('')}</select></label>`;
      val = +(+val).toFixed(2);
      return `<label>${s.label}: <output>${val}</output><input type="range" data-piece="${pid}" data-param="${prm}" min="${s.min}" max="${s.max}" step="${s.step}" value="${val}"></label>`;
    };
    const color = (k, l) => `<label>${l}<input type="color" data-theme="${k}" value="${th[k]}"></label>`;
    this.$('#editor').innerHTML = `
      <h2>Editor do kit Custom</h2>
      <div class="global">${color('accent', 'Cor de destaque')}${color('accent2', 'Cor dos pratos')}${color('drum', 'Cor dos tambores')}
        <label>Abafamento (filtro): <output>${c.filter || 20000}</output> Hz
          <input type="range" data-filter min="500" max="20000" step="100" value="${c.filter || 20000}"></label>
        <button type="button" class="ctrl" id="custom-reset">Zerar kit Custom</button></div>
      ${this.m.pieces.map(p => `<details class="piece-edit"><summary>${p.name}</summary><div class="params">
        ${[...PARAMS_BY_TYPE[p.type], 'vol'].map(prm => field(p.id, prm, this.audio.params(p, c)[prm])).join('')}
      </div></details>`).join('')}`;
    if (this.editorBound) return; this.editorBound = true;

    const ed = this.$('#editor');
    ed.addEventListener('input', e => { // ajuste ao vivo, salvo a cada mudança
      const t = e.target, out = t.parentElement.querySelector('output');
      if (t.dataset.theme) { c.theme[t.dataset.theme] = t.value; this.applyKit(c); }
      else if (t.dataset.filter !== undefined) { c.filter = +t.value; this.audio.setFilter(c.filter); }
      else if (t.dataset.param) { (c.pieceSound[t.dataset.piece] ??= {})[t.dataset.param] = t.tagName === 'SELECT' ? t.value : +t.value; }
      if (out) out.textContent = t.value;
      Store.set('custom', { theme: c.theme, pieceSound: c.pieceSound, filter: c.filter });
    });
    ed.addEventListener('change', e => { if (e.target.dataset.piece) this.m.preview(e.target.dataset.piece); }); // ouve o resultado
    ed.addEventListener('click', e => {
      if (e.target.id !== 'custom-reset') return;
      Object.assign(c, { theme: { ...CUSTOM_THEME }, pieceSound: {}, filter: 0 });
      Store.set('custom', { theme: c.theme, pieceSound: {}, filter: 0 });
      this.audio.setFilter(0); this.renderEditor(); this.applyKit(c); this.status('Kit Custom zerado.');
    });
  }

  status(msg) { this.$('#status').textContent = msg; }
}

/* ---------- Bootstrap ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const audio = new AudioManager();
  const anim = new AnimationController(document.querySelector('#stage'));
  const manager = new DrumKitManager(KITS, PIECES, audio, anim);
  new UIController(manager, audio).init();
  new KeyboardController(PIECES, manager);
});
