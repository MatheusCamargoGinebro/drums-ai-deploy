'use strict';
/* =====================================================================
   CONFIGURAÇÃO CENTRALIZADA — edite aqui para mudar teclas, kits e sons.
   ===================================================================== */

const DEFAULT_KIT_ID = 'acoustic';
const DEFAULT_VOLUME = 0.8;

/* Peças + mapeamento de teclado (key = valor de event.key em minúsculas; ' ' = espaço).
   `mod` ajusta o som base do tipo: freqMul (afinação), decayMul (duração), hpMul (brilho). */
const PIECES = [
  { id: 'crash', name: 'Crash',           type: 'cymbal', key: 'h', mod: { decayMul: 1 } },
  { id: 'tom1',  name: 'Tom 1',           type: 'tom',    key: 'd', mod: { freqMul: 1.3 } },
  { id: 'tom2',  name: 'Tom 2',           type: 'tom',    key: 'f', mod: { freqMul: 1 } },
  { id: 'ride',  name: 'Ride',            type: 'cymbal', key: 'j', mod: { decayMul: .55, hpMul: 1.3 } },
  { id: 'hatc',  name: 'Chimbal Fechado', type: 'hat',    key: 's', open: false },
  { id: 'snare', name: 'Caixa',           type: 'snare',  key: 'a' },
  { id: 'floor', name: 'Surdo',           type: 'tom',    key: 'g', mod: { freqMul: .6, decayMul: 1.3 } },
  { id: 'hato',  name: 'Chimbal Aberto',  type: 'hat',    key: 'k', open: true, mod: { decayMul: 7 } },
  { id: 'kick',  name: 'Bumbo',           type: 'kick',   key: ' ' },
];

/* Parâmetros de síntese padrão por tipo (cada kit sobrescreve o que quiser).
   freq/end: Hz inicial/final · decay: segundos · hp: corte do passa-alta · wave: forma de onda */
const BASE_SOUND = {
  kick:   { wave: 'sine',     freq: 140, end: 45,  decay: .45, click: .4 },
  snare:  { wave: 'triangle', freq: 190, decay: .2, noise: .8, tone: .5, hp: 1500 },
  tom:    { wave: 'sine',     freq: 200, decay: .35 },
  hat:    { hp: 7500, decay: .06 },
  cymbal: { hp: 5000, decay: 1.4, metal: 300, wave: 'square' },
};

/* Tema visual padrão (variáveis CSS). Cada kit sobrescreve o que quiser. */
const THEME_BASE = {
  bg: '#14151a', surface: '#1e2028', text: '#f1f1f4', muted: '#9a9cab',
  accent: '#ff9f43', accent2: '#d9b45a', drum: '#4a4d5c',
  radius: '50%', radiusWide: '2rem', texture: 'none',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
const MONO = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';

/* ---------------------------- KITS ---------------------------- */
const KITS = [
  { id: 'acoustic', name: 'Acoustic Drum Kit',
    theme: { bg: 'radial-gradient(circle at 50% -10%, #3d2b1e, #120e0b 70%)', surface: '#2a1d14', text: '#fbeedd',
      muted: '#bfa68c', accent: '#ff9f43', accent2: '#d9b45a', drum: '#7a4a2a',
      texture: 'repeating-linear-gradient(90deg, #ffffff07 0 2px, transparent 2px 8px)' },
    sound: {} },

  { id: 'rock', name: 'Rock',
    theme: { bg: 'linear-gradient(160deg, #2b0a0a, #0e0e10)', surface: '#1c1212', accent: '#ff3b3b', accent2: '#e0b84a',
      drum: '#8a1f1f', texture: 'repeating-linear-gradient(135deg, #ffffff06 0 3px, transparent 3px 9px)' },
    sound: { kick: { freq: 160, end: 50, decay: .5, click: .6 }, snare: { freq: 200, decay: .26, noise: 1 },
             tom: { freq: 180 }, cymbal: { decay: 1.8 } } },

  { id: 'metal', name: 'Metal',
    theme: { bg: 'linear-gradient(180deg, #0b0d10, #1a1f26)', surface: '#12161b', accent: '#5ee1ff', accent2: '#aab4c0',
      drum: '#2b3038', texture: 'repeating-linear-gradient(45deg, #ffffff08 0 2px, #00000030 2px 4px)' },
    sound: { kick: { freq: 200, end: 40, decay: .3, click: 1 }, snare: { freq: 250, decay: .15, noise: 1.1, hp: 2500 },
             tom: { freq: 150, decay: .25 }, hat: { hp: 9000 }, cymbal: { hp: 6500, decay: 2.2 } } },

  { id: 'jazz', name: 'Jazz',
    theme: { bg: 'radial-gradient(circle at 50% 0, #1f2a44, #0b0f1a 75%)', surface: '#182036', accent: '#ffd166',
      accent2: '#e8c77a', drum: '#3d4f7a', texture: 'radial-gradient(#ffffff0a 1px, transparent 1px) 0 0/14px 14px' },
    sound: { kick: { freq: 100, end: 50, decay: .3, click: .15 }, snare: { freq: 170, decay: .3, noise: .5, tone: .7, hp: 1200 },
             tom: { freq: 230, decay: .45 }, hat: { hp: 6500, decay: .08 }, cymbal: { hp: 5500, decay: 2.2 } } },

  { id: 'electronic', name: 'Electronic',
    theme: { bg: 'linear-gradient(160deg, #10002b, #00121f)', surface: '#150a2e', text: '#eafcff', accent: '#00f5d4',
      accent2: '#f15bb5', drum: '#3a1c71', font: MONO,
      texture: 'linear-gradient(#ffffff0c 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, #ffffff0c 1px, transparent 1px) 0 0/22px 22px' },
    sound: { kick: { freq: 150, end: 38, decay: .7, click: .2 }, snare: { wave: 'sawtooth', freq: 220, decay: .22, noise: 1, tone: .5, hp: 2500 },
             tom: { freq: 260, decay: .3 }, hat: { hp: 9500, decay: .04 }, cymbal: { hp: 8000, decay: 1 } } },

  { id: 'lofi', name: 'Lo-Fi',
    theme: { bg: 'linear-gradient(160deg, #3b2f4a, #1f1a2b)', surface: '#2c2438', text: '#f6e9ff', muted: '#b9a8cc',
      accent: '#ffb3c6', accent2: '#cdb4db', drum: '#6d597a',
      texture: 'radial-gradient(#ffffff10 1.5px, transparent 1.5px) 0 0/10px 10px' },
    filter: 3200, // som "abafado"
    sound: { kick: { freq: 110, end: 45, decay: .4 }, snare: { hp: 900, decay: .25, noise: .7 }, hat: { hp: 5000, decay: .08 } } },

  { id: 'chip8', name: 'Retro 8-Bit',
    theme: { bg: '#000', surface: '#08140a', text: '#b6ffb0', muted: '#5fae58', accent: '#39ff14', accent2: '#ffd400',
      drum: '#1b5e20', radius: '0', radiusWide: '0', font: MONO,
      texture: 'linear-gradient(#39ff1412 1px, transparent 1px) 0 0/8px 8px, linear-gradient(90deg, #39ff1412 1px, transparent 1px) 0 0/8px 8px' },
    sound: { kick: { wave: 'square', freq: 120, end: 30, decay: .2 }, snare: { wave: 'square', freq: 400, decay: .12, noise: .6, hp: 3000 },
             tom: { wave: 'square', freq: 300, decay: .18 }, hat: { hp: 9000, decay: .03 }, cymbal: { hp: 8000, decay: .5 } } },
];

/* ------------- Personalização (teclas, editor e kit Custom) ------------- */
const DEFAULT_KEYS = Object.fromEntries(PIECES.map(p => [p.id, p.key])); // usado no reset
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];

/* Metadados dos controles do editor: rótulo e faixa de cada parâmetro. */
const PARAM_SPECS = {
  wave:  { label: 'Forma de onda' },
  freq:  { label: 'Afinação (Hz)',      min: 40,  max: 1000,  step: 1 },
  end:   { label: 'Queda final (Hz)',   min: 20,  max: 200,   step: 1 },
  decay: { label: 'Duração (s)',        min: .02, max: 3,     step: .01 },
  click: { label: 'Ataque / click',     min: 0,   max: 1.5,   step: .01 },
  noise: { label: 'Ruído (esteira)',    min: 0,   max: 1.5,   step: .01 },
  tone:  { label: 'Corpo (tom)',        min: 0,   max: 1.5,   step: .01 },
  hp:    { label: 'Brilho (corte, Hz)', min: 200, max: 12000, step: 50 },
  metal: { label: 'Timbre metálico (Hz)', min: 100, max: 1000, step: 10 },
  vol:   { label: 'Volume da peça',     min: 0,   max: 1.5,   step: .01 },
};
/* Quais parâmetros cada tipo de peça expõe no editor ("vol" é adicionado a todos). */
const PARAMS_BY_TYPE = {
  kick:   ['wave', 'freq', 'end', 'decay', 'click'],
  snare:  ['wave', 'freq', 'decay', 'tone', 'noise', 'hp'],
  tom:    ['wave', 'freq', 'decay'],
  hat:    ['hp', 'decay'],
  cymbal: ['wave', 'hp', 'decay', 'metal'],
};

const CUSTOM_THEME = { bg: 'radial-gradient(circle at 50% 0, #1c1b3a, #0e0e18 70%)', surface: '#191a2e',
  accent: '#7c5cff', accent2: '#c0c6d4', drum: '#3a3f55' };

/* Kit editável: `pieceSound[idDaPeça]` guarda os ajustes individuais de cada peça. */
KITS.push({ id: 'custom', name: 'Custom (editável)', custom: true,
  theme: { ...CUSTOM_THEME }, sound: {}, pieceSound: {}, filter: 0 });
